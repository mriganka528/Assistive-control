// ---------------------------------------------------------------------------
// Assistive Control — discrete action controller (§8)
//
// Drives the discrete control roles — left click, right click, and confirm
// (a key press, Enter by default) — from the user's movements, with multi-stage
// gesture support. Bindings are grouped by signal: when several roles share ONE
// signal they carry distinct patterns (single / double / long), so a single
// reliable movement can produce multiple commands (blink once = left click,
// twice = right click, long = Enter). When the user has enough distinct
// movements, each role simply uses its own signal with a "single" pattern.
//
// Each signal runs through ONE TapPatternDetector, which guarantees one
// classified action per activation and a refractory gap — a sustained movement
// never machine-guns. All OS actions route through the input bridge, where the
// main-process safety gate applies.
// ---------------------------------------------------------------------------

import type { ControlBinding, GesturePattern } from "../calibration/types";
import { TapPatternDetector } from "./gestureEngine";
import { getInput, type InputPort } from "./inputBridge";

export type DiscreteTimings = {
  tapDwellMs: number;
  tapCooldownMs: number;
  doubleTapWindowMs: number;
  longActionMs: number;
};

export type DiscreteRole = "leftClick" | "rightClick" | "confirm";

export type DiscreteBindings = {
  leftClick: ControlBinding | null;
  rightClick: ControlBinding | null;
  confirm: ControlBinding | null;
};

export type DiscreteTick = {
  /** the first role that fired this frame, if any (for status/telemetry). */
  fired: DiscreteRole | null;
};

type Group = {
  signal: string;
  binding: ControlBinding;
  detector: TapPatternDetector;
  byPattern: Map<GesturePattern, DiscreteRole>;
};

/** Role priority when reporting/executing (left click is most common). */
const ROLE_ORDER: DiscreteRole[] = ["leftClick", "rightClick", "confirm"];

function patternOf(binding: ControlBinding): GesturePattern {
  return binding.pattern ?? "single";
}

export class DiscreteController {
  private bindings: DiscreteBindings;
  private timings: DiscreteTimings;
  private input: InputPort;
  private confirmKey: string;
  private groups: Group[] = [];

  constructor(
    bindings: DiscreteBindings,
    timings: DiscreteTimings,
    input: InputPort = getInput(),
    confirmKey = "enter"
  ) {
    this.bindings = bindings;
    this.timings = timings;
    this.input = input;
    this.confirmKey = confirmKey;
    this.rebuild();
  }

  private rebuild(): void {
    // Collect the present roles in priority order.
    const entries: { role: DiscreteRole; binding: ControlBinding }[] = [];
    for (const role of ROLE_ORDER) {
      const b = this.bindings[role];
      if (b) entries.push({ role, binding: b });
    }

    // Group by signal.
    const bySignal = new Map<
      string,
      { rep: ControlBinding; byPattern: Map<GesturePattern, DiscreteRole> }
    >();
    for (const { role, binding } of entries) {
      let g = bySignal.get(binding.signal);
      if (!g) {
        g = { rep: binding, byPattern: new Map() };
        bySignal.set(binding.signal, g);
      }
      const p = patternOf(binding);
      if (!g.byPattern.has(p)) g.byPattern.set(p, role);
      // Prefer the "single" binding as representative for thresholds.
      if (p === "single") g.rep = binding;
    }

    this.groups = [];
    for (const [signal, g] of bySignal) {
      const hasSingle = g.byPattern.has("single");
      const hasDouble = g.byPattern.has("double");
      const hasLong = g.byPattern.has("long");
      this.groups.push({
        signal,
        binding: g.rep,
        byPattern: g.byPattern,
        detector: new TapPatternDetector({
          activationThreshold: g.rep.activationThreshold,
          releaseThreshold: g.rep.releaseThreshold,
          increases: g.rep.increases,
          dwellMs: this.timings.tapDwellMs,
          cooldownMs: this.timings.tapCooldownMs,
          longActionMs: this.timings.longActionMs,
          doubleWindowMs: this.timings.doubleTapWindowMs,
          hasSingle,
          hasDouble,
          hasLong,
        }),
      });
    }
  }

  setBindings(bindings: DiscreteBindings): void {
    this.bindings = bindings;
    this.rebuild();
  }

  setTimings(patch: Partial<DiscreteTimings>): void {
    this.timings = { ...this.timings, ...patch };
    for (const g of this.groups) {
      g.detector.setConfig({
        dwellMs: this.timings.tapDwellMs,
        cooldownMs: this.timings.tapCooldownMs,
        longActionMs: this.timings.longActionMs,
        doubleWindowMs: this.timings.doubleTapWindowMs,
      });
    }
  }

  setConfirmKey(key: string): void {
    this.confirmKey = key;
  }

  reset(): void {
    for (const g of this.groups) g.detector.reset();
  }

  private execute(role: DiscreteRole): void {
    switch (role) {
      case "leftClick":
        void this.input.leftClick();
        break;
      case "rightClick":
        void this.input.rightClick();
        break;
      case "confirm":
        void this.input.keyPress(this.confirmKey);
        break;
    }
  }

  /** Advance one frame; performs at most one action per signal group. */
  update(signals: Record<string, number>, timestamp: number): DiscreteTick {
    let fired: DiscreteRole | null = null;
    for (const g of this.groups) {
      const v = signals[g.signal];
      if (typeof v !== "number" || Number.isNaN(v)) continue;
      const pattern = g.detector.update(v, timestamp);
      if (!pattern) continue;
      const role = g.byPattern.get(pattern);
      if (!role) continue;
      this.execute(role);
      if (
        fired === null ||
        ROLE_ORDER.indexOf(role) < ROLE_ORDER.indexOf(fired)
      ) {
        fired = role;
      }
    }
    return { fired };
  }

  // --- generic passthroughs for the on-screen keyboard (§13) ----------------

  press(key: string): Promise<boolean> {
    return this.input.keyPress(key);
  }

  type(text: string): Promise<boolean> {
    return this.input.typeText(text);
  }
}
