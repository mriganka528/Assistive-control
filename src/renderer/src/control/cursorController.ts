// ---------------------------------------------------------------------------
// Assistive Control — cursor controller (PHASE 6)
//
// Turns up to four directional cursor bindings (left/right/up/down) into smooth
// relative cursor motion. Design goals from the spec:
//   * dead zone   — ignore tiny/resting signal so the cursor doesn't drift
//   * sensitivity — user gain on how strongly signal maps to speed
//   * speed       — pixels/frame at full intensity
//   * smoothing   — exponential velocity smoothing to remove jitter
//
// Motion is emitted as integer relative deltas via the input bridge; sub-pixel
// remainder is accumulated so even slow, gentle movements eventually move the
// cursor. Nothing here injects input directly — it calls the bridge, which
// forwards to the main process where the safety gate applies.
// ---------------------------------------------------------------------------

import type { ControlBinding } from "../calibration/types";
import { getInput, type InputPort } from "./inputBridge";
import { applyDeadzone, clamp, signalIntensity } from "./signals";

export type CursorConfig = {
  deadZone: number;
  sensitivity: number;
  speed: number;
  /** 0..1 exponential smoothing (higher = smoother/slower to respond). */
  smoothing: number;
};

export type CursorTick = {
  /** smoothed velocity actually applied this frame (px). */
  vx: number;
  vy: number;
  /** normalized directional axes after dead zone, for the UI. */
  axisX: number;
  axisY: number;
  moved: boolean;
};

export class CursorController {
  private bindings: ControlBinding[];
  private cfg: CursorConfig;
  private input: InputPort;

  private velX = 0;
  private velY = 0;
  private accX = 0;
  private accY = 0;

  constructor(
    bindings: ControlBinding[],
    cfg: CursorConfig,
    input: InputPort = getInput()
  ) {
    this.bindings = bindings;
    this.cfg = cfg;
    this.input = input;
  }

  setBindings(bindings: ControlBinding[]): void {
    this.bindings = bindings;
  }

  setConfig(patch: Partial<CursorConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  reset(): void {
    this.velX = 0;
    this.velY = 0;
    this.accX = 0;
    this.accY = 0;
  }

  /** Advance one frame with the current signal values. */
  update(signals: Record<string, number>): CursorTick {
    let left = 0;
    let right = 0;
    let up = 0;
    let down = 0;

    for (const b of this.bindings) {
      const v = signals[b.signal];
      if (typeof v !== "number" || Number.isNaN(v)) continue;
      const i = signalIntensity(v, b.activationThreshold, b.increases);
      switch (b.direction) {
        case "left":
          left = Math.max(left, i);
          break;
        case "right":
          right = Math.max(right, i);
          break;
        case "up":
          up = Math.max(up, i);
          break;
        case "down":
          down = Math.max(down, i);
          break;
        default:
          break;
      }
    }

    const axisX = applyDeadzone(right - left, this.cfg.deadZone);
    const axisY = applyDeadzone(down - up, this.cfg.deadZone);

    const targetX = axisX * this.cfg.sensitivity * this.cfg.speed;
    const targetY = axisY * this.cfg.sensitivity * this.cfg.speed;

    const s = clamp(this.cfg.smoothing, 0, 0.98);
    this.velX = s * this.velX + (1 - s) * targetX;
    this.velY = s * this.velY + (1 - s) * targetY;

    this.accX += this.velX;
    this.accY += this.velY;
    const dx = Math.trunc(this.accX);
    const dy = Math.trunc(this.accY);

    let moved = false;
    if (dx !== 0 || dy !== 0) {
      this.accX -= dx;
      this.accY -= dy;
      moved = true;
      void this.input.moveCursorBy(dx, dy);
    }

    return { vx: this.velX, vy: this.velY, axisX, axisY, moved };
  }
}
