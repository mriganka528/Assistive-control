// ---------------------------------------------------------------------------
// Assistive Control — scroll controller (PHASE 8)
//
// Turns directional scroll bindings (typically up/down, optionally left/right)
// into stepped scroll ticks. Unlike the cursor, scrolling is emitted in
// discrete steps rate-limited by a cooldown, so a sustained movement scrolls at
// a steady, controllable pace instead of flooding the OS with events. Tick
// magnitude scales with signal intensity between 1 and `speed`.
// ---------------------------------------------------------------------------

import type { ControlBinding } from "../calibration/types";
import { getInput, type InputPort } from "./inputBridge";
import { applyDeadzone, signalIntensity } from "./signals";

export type ScrollConfig = {
  deadZone: number;
  /** max scroll ticks per emission at full intensity. */
  speed: number;
  /** minimum gap between scroll emissions (ms). */
  cooldownMs: number;
};

export type ScrollTick = {
  dx: number;
  dy: number;
  scrolled: boolean;
  /** normalized vertical axis after dead zone (down positive), for the UI. */
  axisY: number;
};

export class ScrollController {
  private bindings: ControlBinding[];
  private cfg: ScrollConfig;
  private input: InputPort;
  private lastEmit = Number.NEGATIVE_INFINITY;

  constructor(
    bindings: ControlBinding[],
    cfg: ScrollConfig,
    input: InputPort = getInput()
  ) {
    this.bindings = bindings;
    this.cfg = cfg;
    this.input = input;
  }

  setBindings(bindings: ControlBinding[]): void {
    this.bindings = bindings;
  }

  setConfig(patch: Partial<ScrollConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  reset(): void {
    this.lastEmit = Number.NEGATIVE_INFINITY;
  }

  private ticks(axis: number): number {
    if (axis === 0) return 0;
    const mag = Math.max(1, Math.round(Math.abs(axis) * this.cfg.speed));
    return Math.sign(axis) * mag;
  }

  /** Advance one frame; emits at most one (rate-limited) scroll step. */
  update(signals: Record<string, number>, timestamp: number): ScrollTick {
    let up = 0;
    let down = 0;
    let left = 0;
    let right = 0;

    for (const b of this.bindings) {
      const v = signals[b.signal];
      if (typeof v !== "number" || Number.isNaN(v)) continue;
      const i = signalIntensity(v, b.activationThreshold, b.increases);
      switch (b.direction) {
        case "up":
          up = Math.max(up, i);
          break;
        case "down":
          down = Math.max(down, i);
          break;
        case "left":
          left = Math.max(left, i);
          break;
        case "right":
          right = Math.max(right, i);
          break;
        default:
          break;
      }
    }

    const axisY = applyDeadzone(down - up, this.cfg.deadZone);
    const axisX = applyDeadzone(right - left, this.cfg.deadZone);

    const ready = timestamp - this.lastEmit >= this.cfg.cooldownMs;
    if (!ready || (axisY === 0 && axisX === 0)) {
      return { dx: 0, dy: 0, scrolled: false, axisY };
    }

    const dy = this.ticks(axisY);
    const dx = this.ticks(axisX);
    this.lastEmit = timestamp;
    void this.input.scroll(dx, dy);

    return { dx, dy, scrolled: true, axisY };
  }
}
