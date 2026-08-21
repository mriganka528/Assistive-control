// ---------------------------------------------------------------------------
// Assistive Control — gesture engine (event detection)
//
// Converts a continuous per-signal value stream into discrete gesture events
// using a small state machine:
//
//   idle -> rising -> active -> cooldown -> idle
//
// Guarantees ONE action per sustained gesture via:
//   * activation / release thresholds (hysteresis, prevents chatter)
//   * a minimum dwell before "start" fires (rejects momentary spikes)
//   * a cooldown/refractory period, AND requiring the signal to return to
//     rest before the next action can begin (prevents machine-gun repeats)
//   * a long-press classification (held past longActionMs)
//
// Continuous controls (cursor/scroll) use `intensity` rather than events.
// ---------------------------------------------------------------------------

import type { GesturePhase, GestureEvent, GesturePattern } from "../calibration/types";

export type GestureConfig = {
  activationThreshold: number;
  releaseThreshold: number;
  /** true if "active" means value >= activation (rising signal). */
  increases: boolean;
  /** must stay active this long before "start" fires. */
  dwellMs: number;
  /** refractory period after a gesture ends. */
  cooldownMs: number;
  /** held beyond this -> a one-time "long" event. */
  longActionMs: number;
};

export type GestureUpdate = {
  phase: GesturePhase;
  /** currently in the active phase. */
  active: boolean;
  /** discrete event fired on this frame, if any. */
  event: GestureEvent | null;
  /** ms the gesture has been (or was) held. */
  heldMs: number;
  /** normalized magnitude beyond the activation threshold, >= 0. */
  intensity: number;
};

export class GestureDetector {
  private config: GestureConfig;
  private phase: GesturePhase = "idle";
  private riseStart = 0;
  private activeStart = 0;
  private cooldownStart = 0;
  private emittedLong = false;

  constructor(config: GestureConfig) {
    this.config = config;
  }

  setConfig(patch: Partial<GestureConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  reset(): void {
    this.phase = "idle";
    this.emittedLong = false;
    this.riseStart = 0;
    this.activeStart = 0;
    this.cooldownStart = 0;
  }

  getPhase(): GesturePhase {
    return this.phase;
  }

  private isActive(v: number): boolean {
    return this.config.increases
      ? v >= this.config.activationThreshold
      : v <= this.config.activationThreshold;
  }

  private isReleased(v: number): boolean {
    return this.config.increases
      ? v <= this.config.releaseThreshold
      : v >= this.config.releaseThreshold;
  }

  private computeIntensity(v: number): number {
    const { activationThreshold, increases } = this.config;
    const span = Math.max(
      1e-3,
      increases ? 1 - activationThreshold : activationThreshold
    );
    const raw = increases ? v - activationThreshold : activationThreshold - v;
    return Math.max(0, raw / span);
  }

  /** Advance the state machine with a new sample. */
  update(value: number, timestamp: number): GestureUpdate {
    let event: GestureEvent | null = null;
    const active = this.isActive(value);
    const released = this.isReleased(value);

    switch (this.phase) {
      case "idle":
        if (active) {
          this.phase = "rising";
          this.riseStart = timestamp;
        }
        break;

      case "rising":
        if (released) {
          this.phase = "idle";
        } else if (timestamp - this.riseStart >= this.config.dwellMs) {
          this.phase = "active";
          this.activeStart = timestamp;
          this.emittedLong = false;
          event = "start";
        }
        break;

      case "active":
        if (released) {
          event = "end";
          this.phase = "cooldown";
          this.cooldownStart = timestamp;
        } else if (
          !this.emittedLong &&
          timestamp - this.activeStart >= this.config.longActionMs
        ) {
          this.emittedLong = true;
          event = "long";
        } else {
          event = "hold";
        }
        break;

      case "cooldown":
        // Require BOTH the refractory time to elapse AND the signal to relax,
        // so holding the gesture can never produce repeated actions.
        if (released && timestamp - this.cooldownStart >= this.config.cooldownMs) {
          this.phase = "idle";
        }
        break;
    }

    let heldMs = 0;
    if (this.phase === "active" || event === "end") {
      heldMs = timestamp - this.activeStart;
    }

    return {
      phase: this.phase,
      active: this.phase === "active",
      event,
      heldMs,
      intensity: this.computeIntensity(value),
    };
  }
}

// ---------------------------------------------------------------------------
// Multi-stage tap pattern detection (§8)
//
// Wraps a GestureDetector to classify ONE signal's activations into
// single / double / long, so a single reliable movement can drive several
// commands (e.g. blink once = left click, twice = right click, long = Enter).
//
// Disambiguation rules (only the patterns actually mapped on this signal are
// considered, so unused patterns never add latency):
//   * single only            -> fires immediately on activation (snappy click)
//   * single + long          -> single fires on release (once "not long" known)
//   * single + double (+long)-> single waits out the double-tap window; a second
//                               activation within the window becomes "double";
//                               a held activation becomes "long"
// The underlying detector still guarantees ONE classification per activation
// and a refractory gap, so a sustained movement never machine-guns.
// ---------------------------------------------------------------------------

export type TapPatternConfig = {
  activationThreshold: number;
  releaseThreshold: number;
  increases: boolean;
  dwellMs: number;
  cooldownMs: number;
  longActionMs: number;
  doubleWindowMs: number;
  hasSingle: boolean;
  hasDouble: boolean;
  hasLong: boolean;
};

export class TapPatternDetector {
  private cfg: TapPatternConfig;
  private inner: GestureDetector;

  private awaitingSecond = false;
  private windowExpiry = 0;
  private longFired = false;
  private classifiedImmediate = false;
  private classifiedDouble = false;

  constructor(cfg: TapPatternConfig) {
    this.cfg = cfg;
    this.inner = new GestureDetector({
      activationThreshold: cfg.activationThreshold,
      releaseThreshold: cfg.releaseThreshold,
      increases: cfg.increases,
      dwellMs: cfg.dwellMs,
      cooldownMs: cfg.cooldownMs,
      longActionMs: cfg.longActionMs,
    });
  }

  setConfig(patch: Partial<TapPatternConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
    this.inner.setConfig({
      activationThreshold: this.cfg.activationThreshold,
      releaseThreshold: this.cfg.releaseThreshold,
      increases: this.cfg.increases,
      dwellMs: this.cfg.dwellMs,
      cooldownMs: this.cfg.cooldownMs,
      longActionMs: this.cfg.longActionMs,
    });
  }

  reset(): void {
    this.inner.reset();
    this.awaitingSecond = false;
    this.windowExpiry = 0;
    this.longFired = false;
    this.classifiedImmediate = false;
    this.classifiedDouble = false;
  }

  /** Advance one frame; returns a classified pattern this frame, if any. */
  update(value: number, timestamp: number): GesturePattern | null {
    let emitted: GesturePattern | null = null;
    const u = this.inner.update(value, timestamp);

    if (u.event === "start") {
      if (this.awaitingSecond && timestamp <= this.windowExpiry && this.cfg.hasDouble) {
        // Second activation within the window -> double.
        emitted = "double";
        this.classifiedDouble = true;
        this.awaitingSecond = false;
      } else {
        // Fresh first activation.
        this.longFired = false;
        this.classifiedImmediate = false;
        this.classifiedDouble = false;
        if (this.cfg.hasSingle && !this.cfg.hasDouble && !this.cfg.hasLong) {
          emitted = "single"; // nothing to disambiguate -> immediate
          this.classifiedImmediate = true;
        }
      }
    } else if (u.event === "long") {
      if (
        this.cfg.hasLong &&
        !this.classifiedImmediate &&
        !this.classifiedDouble &&
        !this.longFired
      ) {
        emitted = "long";
        this.longFired = true;
      }
    } else if (u.event === "end") {
      if (this.classifiedImmediate) {
        this.classifiedImmediate = false;
      } else if (this.longFired) {
        this.longFired = false;
      } else if (this.classifiedDouble) {
        this.classifiedDouble = false;
      } else if (this.cfg.hasDouble) {
        // A plain tap ended; wait to see whether a second tap follows.
        this.awaitingSecond = true;
        this.windowExpiry = timestamp + this.cfg.doubleWindowMs;
      } else if (this.cfg.hasSingle) {
        // No double expected; single was deferred to rule out a long-press.
        emitted = "single";
      }
    }

    // Double-tap window elapsed with no second tap -> commit the single.
    if (!emitted && this.awaitingSecond && timestamp > this.windowExpiry) {
      this.awaitingSecond = false;
      if (this.cfg.hasSingle) emitted = "single";
    }

    return emitted;
  }
}
