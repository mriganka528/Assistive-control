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
  /**
   * Response curve exponent applied to the (post-deadzone) axis magnitude.
   * >1 gives fine precision near rest and full speed only at strong effort,
   * which is what makes the cursor feel both smooth AND accurate. Defaults to
   * 1.5 when omitted.
   */
  acceleration?: number;
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

/** Reference frame time (60fps) that smoothing/speed are calibrated against. */
const REF_FRAME_MS = 1000 / 60;
/** Clamp dt so a stall or a background tab can't launch the cursor. */
const MAX_FRAME_MS = 50;

/**
 * Shape a normalized axis magnitude [0,1] with a precision curve: a gentle
 * signal produces a small fraction of full speed (fine control), while a strong
 * signal still reaches full speed. Sign is preserved.
 */
function shape(axis: number, accel: number): number {
  const a = Math.abs(axis);
  if (a === 0) return 0;
  return Math.sign(axis) * Math.pow(a, accel);
}

export class CursorController {
  private bindings: ControlBinding[];
  private cfg: CursorConfig;
  private input: InputPort;

  private velX = 0;
  private velY = 0;
  private accX = 0;
  private accY = 0;
  private lastTs: number | null = null;

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
    this.lastTs = null;
  }

  /**
   * Advance one frame. `timestamp` (ms) lets motion stay consistent regardless
   * of the actual frame rate; when omitted a 60fps step is assumed.
   */
  update(signals: Record<string, number>, timestamp?: number): CursorTick {
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

    // Frame-time factor so smoothing and travel are frame-rate independent.
    let dtFactor = 1;
    if (typeof timestamp === "number") {
      if (this.lastTs !== null) {
        const dt = clamp(timestamp - this.lastTs, 1, MAX_FRAME_MS);
        dtFactor = dt / REF_FRAME_MS;
      }
      this.lastTs = timestamp;
    }

    const accel = this.cfg.acceleration ?? 1.5;
    const axisX = shape(applyDeadzone(right - left, this.cfg.deadZone), accel);
    const axisY = shape(applyDeadzone(down - up, this.cfg.deadZone), accel);

    const targetX = axisX * this.cfg.sensitivity * this.cfg.speed;
    const targetY = axisY * this.cfg.sensitivity * this.cfg.speed;

    // Exponential smoothing, corrected for frame time so the response feel is
    // the same at 30fps or 120fps (a longer frame moves the state further).
    const base = clamp(this.cfg.smoothing, 0, 0.98);
    const s = Math.pow(base, dtFactor);
    this.velX = s * this.velX + (1 - s) * targetX;
    this.velY = s * this.velY + (1 - s) * targetY;

    // Snap tiny residual velocity to zero so the cursor comes to a clean stop
    // (no sub-pixel drift once the movement is released).
    if (Math.abs(this.velX) < 0.01 && axisX === 0) this.velX = 0;
    if (Math.abs(this.velY) < 0.01 && axisY === 0) this.velY = 0;

    this.accX += this.velX * dtFactor;
    this.accY += this.velY * dtFactor;
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
