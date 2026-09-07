// ---------------------------------------------------------------------------
// Assistive Control — control runtime (PHASES 13, 15, 18, 19 glue)
//
// Framework-agnostic orchestrator driven one frame at a time by the React
// layer. It owns the controllers, the reliability monitor, and the switching
// manager, and enforces the mandatory safety model on the renderer side:
//
//   * SAFETY GATE     — control only runs when armed & not paused & not stopped
//   * FACE-LOSS WATCHDOG — freezes control if the face is lost past a grace time
//   * CONFIDENCE FREEZE  — freezes control when tracking confidence is too low
//
// Defense in depth: even if this gate were bypassed, the main process refuses
// to inject input unless safety.canInject() is true.
// ---------------------------------------------------------------------------

import type {
  CalibrationProfile,
  ControlBinding,
  ControlMapping,
  ControlRole,
  ControlStatus,
  RuntimeState,
  SwitchingMode,
  SwitchProposal,
} from "../calibration/types";
import type { SafetyState } from "../../../shared/ipc";
import { CursorController } from "../control/cursorController";
import { ScrollController } from "../control/scrollController";
import {
  DiscreteController,
  type DiscreteBindings,
} from "../control/discreteController";
import { signalIntensity } from "../control/signals";
import {
  ReliabilityMonitor,
  instantaneousReliability,
} from "../adaptive/reliabilityMonitor";
import {
  SwitchingManager,
  type SwitchDecision,
} from "../adaptive/switchingManager";

export type FrameInput = {
  timestamp: number;
  faceVisible: boolean;
  /** overall tracking confidence in [0,1]; ~0 when the subject is lost. */
  trackingConfidence: number;
  /** merged face + hand signal channels for this frame. */
  signals: Record<string, number>;
};

export type RuntimeFrameResult = {
  status: ControlStatus;
  decisions: SwitchDecision[];
};

type RoleBinding = { role: ControlRole; binding: ControlBinding };

const IDLE_SAFETY: SafetyState = {
  armed: false,
  paused: false,
  stopped: false,
  reason: "idle",
};

/** Only re-run the (relatively expensive) switching evaluation this often. */
const SWITCH_EVAL_INTERVAL_MS = 750;

export class ControlRuntime {
  private profile: CalibrationProfile;
  private mapping: ControlMapping;

  private cursor: CursorController;
  private discrete: DiscreteController;
  private scroll: ScrollController;

  private monitor: ReliabilityMonitor;
  private switching: SwitchingManager;

  private safety: SafetyState = IDLE_SAFETY;
  private lastFaceSeen = 0;
  private lastSwitchEval = Number.NEGATIVE_INFINITY;
  private profileDirty = false;

  constructor(profile: CalibrationProfile) {
    this.profile = profile;
    this.mapping = profile.controls;
    this.monitor = new ReliabilityMonitor();
    this.switching = new SwitchingManager(profile.settings.switchingMode);

    // Placeholders replaced immediately by build().
    this.cursor = new CursorController([], this.cursorConfig());
    this.discrete = new DiscreteController(
      this.discreteBindings(),
      this.discreteTimings()
    );
    this.scroll = new ScrollController([], this.scrollConfig());
    this.build();
  }

  // --- configuration derived from profile thresholds + user settings --------

  private cursorConfig() {
    const t = this.profile.thresholds;
    const s = this.profile.settings;
    return {
      deadZone: t.cursorDeadZone,
      sensitivity: s.cursorSensitivity ?? t.cursorSensitivity,
      speed: s.cursorSpeed ?? t.cursorSpeed,
      smoothing: t.cursorSmoothing,
      acceleration: t.cursorAcceleration,
    };
  }

  private scrollConfig() {
    const t = this.profile.thresholds;
    const s = this.profile.settings;
    return {
      deadZone: t.scrollDeadZone,
      speed: s.scrollSpeed ?? t.scrollSpeed,
      cooldownMs: t.scrollCooldownMs,
    };
  }

  private discreteTimings() {
    const t = this.profile.thresholds;
    return {
      tapDwellMs: t.tapDwellMs,
      tapCooldownMs: t.tapCooldownMs,
      doubleTapWindowMs: t.doubleTapWindowMs,
      longActionMs: t.longActionMs,
    };
  }

  private discreteBindings(): DiscreteBindings {
    return {
      leftClick: this.mapping.leftClick,
      rightClick: this.mapping.rightClick,
      middleClick: this.mapping.middleClick,
      confirm: this.mapping.confirm,
    };
  }

  private build(): void {
    this.cursor.setBindings(this.mapping.cursor);
    this.cursor.setConfig(this.cursorConfig());
    this.scroll.setBindings(this.mapping.scroll);
    this.scroll.setConfig(this.scrollConfig());
    this.discrete.setBindings(this.discreteBindings());
    this.discrete.setTimings(this.discreteTimings());
  }

  private allBindings(): RoleBinding[] {
    const out: RoleBinding[] = [];
    for (const b of this.mapping.cursor) out.push({ role: "cursor", binding: b });
    for (const b of this.mapping.scroll) out.push({ role: "scroll", binding: b });
    if (this.mapping.leftClick)
      out.push({ role: "leftClick", binding: this.mapping.leftClick });
    if (this.mapping.rightClick)
      out.push({ role: "rightClick", binding: this.mapping.rightClick });
    if (this.mapping.middleClick)
      out.push({ role: "middleClick", binding: this.mapping.middleClick });
    if (this.mapping.confirm)
      out.push({ role: "confirm", binding: this.mapping.confirm });
    return out;
  }

  // --- public control surface ----------------------------------------------

  setProfile(profile: CalibrationProfile): void {
    this.profile = profile;
    this.mapping = profile.controls;
    this.switching.setMode(profile.settings.switchingMode);
    this.switching.reset();
    this.monitor.reset();
    this.build();
    this.resetControllers();
    this.profileDirty = false;
  }

  /** Update the mirrored safety state (from the main-process subscription). */
  setSafety(state: SafetyState): void {
    this.safety = state;
  }

  setSwitchingMode(mode: SwitchingMode): void {
    this.profile.settings.switchingMode = mode;
    this.switching.setMode(mode);
  }

  /** Apply an accepted assisted-mode proposal, updating the live mapping. */
  applyProposal(proposal: SwitchProposal): void {
    this.mapping = this.switching.apply(
      this.mapping,
      proposal,
      this.profile.movements
    );
    this.profile = { ...this.profile, controls: this.mapping };
    this.build();
    this.profileDirty = true;
  }

  getProfile(): CalibrationProfile {
    return this.profile;
  }

  getMapping(): ControlMapping {
    return this.mapping;
  }

  /** True if an auto-switch changed the mapping since the last save. */
  isProfileDirty(): boolean {
    return this.profileDirty;
  }

  markProfileSaved(): void {
    this.profileDirty = false;
  }

  private resetControllers(): void {
    this.cursor.reset();
    this.scroll.reset();
    this.discrete.reset();
  }

  // --- per-frame update ------------------------------------------------------

  frame(input: FrameInput): RuntimeFrameResult {
    const { timestamp, faceVisible, trackingConfidence, signals } = input;
    const t = this.profile.thresholds;

    if (faceVisible) this.lastFaceSeen = timestamp;
    const faceLost = timestamp - this.lastFaceSeen > t.faceLossGraceMs;
    const lowConfidence = trackingConfidence < t.minTrackingConfidence;

    const state = this.resolveState(faceLost, lowConfidence);
    const canControl = state === "ACTIVE";

    if (canControl) {
      this.cursor.update(signals, timestamp);
      this.scroll.update(signals, timestamp);
      this.discrete.update(signals, timestamp);
    } else {
      // Frozen: keep controllers from carrying stale velocity/gesture state.
      this.resetControllers();
    }

    // Reliability monitoring runs continuously so degradation is detected even
    // during active control.
    this.feedMonitor(timestamp, trackingConfidence, signals);

    let decisions: SwitchDecision[] = [];
    if (canControl && timestamp - this.lastSwitchEval >= SWITCH_EVAL_INTERVAL_MS) {
      this.lastSwitchEval = timestamp;
      decisions = this.switching.evaluate({
        now: timestamp,
        mapping: this.mapping,
        movements: this.profile.movements,
        monitor: this.monitor,
        liveHealth: this.liveHealth(timestamp),
      });
      // In automatic mode the switching manager returns updated mappings; apply
      // the last one (decisions compose) and rebuild the controllers.
      const auto = decisions.filter((d) => d.kind === "auto");
      if (auto.length > 0) {
        const applied = auto[auto.length - 1];
        if (applied.kind === "auto") {
          this.mapping = applied.mapping;
          this.profile = { ...this.profile, controls: this.mapping };
          this.build();
          this.profileDirty = true;
        }
      }
    }

    return {
      status: this.buildStatus(state, signals, timestamp),
      decisions,
    };
  }

  private resolveState(faceLost: boolean, lowConfidence: boolean): RuntimeState {
    if (this.safety.stopped) return "STOPPED";
    if (this.safety.paused) return "PAUSED";
    if (!this.safety.armed) return "READY";
    if (faceLost) return "NO_FACE";
    if (lowConfidence) return "LOW_CONFIDENCE";
    return "ACTIVE";
  }

  private feedMonitor(
    timestamp: number,
    trackingConfidence: number,
    _signals: Record<string, number>
  ): void {
    for (const { binding } of this.allBindings()) {
      const stats = this.profile.baseline.channels[binding.signal];
      const reliability = instantaneousReliability({
        baselineMean: stats?.mean ?? 0,
        baselineStd: stats?.std ?? 0,
        activationThreshold: binding.activationThreshold,
        increases: binding.increases,
        calibratedScore: binding.reliability,
        trackingConfidence,
      });
      this.monitor.record({
        movementName: binding.movementName,
        reliability,
        timestamp,
      });
    }
  }

  private liveHealth(now: number): Map<string, number> {
    const map = new Map<string, number>();
    for (const { binding } of this.allBindings()) {
      if (map.has(binding.movementName)) continue;
      map.set(binding.movementName, this.monitor.health(binding.movementName, now).average);
    }
    return map;
  }

  /** Which bound movement is most active right now (for the live status UI). */
  private dominant(
    signals: Record<string, number>
  ): { role: ControlRole; binding: ControlBinding; intensity: number } | null {
    let best: {
      role: ControlRole;
      binding: ControlBinding;
      intensity: number;
    } | null = null;
    for (const { role, binding } of this.allBindings()) {
      const v = signals[binding.signal];
      if (typeof v !== "number" || Number.isNaN(v)) continue;
      const i = signalIntensity(v, binding.activationThreshold, binding.increases);
      if (i > 0.05 && (!best || i > best.intensity)) {
        best = { role, binding, intensity: i };
      }
    }
    return best;
  }

  private buildStatus(
    state: RuntimeState,
    signals: Record<string, number>,
    now: number
  ): ControlStatus {
    const dom = state === "ACTIVE" ? this.dominant(signals) : null;
    const activeName = dom?.binding.movementName ?? null;
    const activeReliability =
      activeName !== null ? Math.round(this.monitor.health(activeName, now).current) : 0;

    return {
      armed: this.safety.armed,
      paused: this.safety.paused,
      faceVisible: state !== "NO_FACE",
      trackingConfident: state !== "LOW_CONFIDENCE",
      state,
      activeRole: dom?.role ?? null,
      activeMovement: activeName,
      activeSignal: dom?.binding.signal ?? null,
      activeSignalValue: dom ? signals[dom.binding.signal] ?? 0 : 0,
      activeReliability,
    };
  }
}
