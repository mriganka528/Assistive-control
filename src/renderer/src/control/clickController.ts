// ---------------------------------------------------------------------------
// Assistive Control — click controller (PHASE 7)
//
// Drives left and right clicks from discrete gesture bindings. Each binding
// runs through a GestureDetector so that ONE sustained gesture produces exactly
// ONE click — holding the movement never machine-guns clicks (the detector's
// cooldown requires the signal to relax before another action can start).
//
// A click fires on the "start" event (right after the dwell is satisfied) for
// responsiveness. Continuous "hold" frames are ignored.
// ---------------------------------------------------------------------------

import type { ControlBinding } from "../calibration/types";
import { GestureDetector, type GestureConfig } from "./gestureEngine";
import { getInput, type InputPort } from "./inputBridge";

export type ClickTimings = {
  dwellMs: number;
  cooldownMs: number;
  longActionMs: number;
};

export type ClickKind = "left" | "right";

export type ClickTick = {
  /** which button fired this frame, if any. */
  fired: ClickKind | null;
};

function toGestureConfig(
  binding: ControlBinding,
  timings: ClickTimings
): GestureConfig {
  return {
    activationThreshold: binding.activationThreshold,
    releaseThreshold: binding.releaseThreshold,
    increases: binding.increases,
    dwellMs: timings.dwellMs,
    cooldownMs: timings.cooldownMs,
    longActionMs: timings.longActionMs,
  };
}

export class ClickController {
  private leftBinding: ControlBinding | null;
  private rightBinding: ControlBinding | null;
  private timings: ClickTimings;
  private input: InputPort;

  private leftDetector: GestureDetector | null = null;
  private rightDetector: GestureDetector | null = null;

  constructor(
    leftBinding: ControlBinding | null,
    rightBinding: ControlBinding | null,
    timings: ClickTimings,
    input: InputPort = getInput()
  ) {
    this.leftBinding = leftBinding;
    this.rightBinding = rightBinding;
    this.timings = timings;
    this.input = input;
    this.rebuild();
  }

  private rebuild(): void {
    this.leftDetector = this.leftBinding
      ? new GestureDetector(toGestureConfig(this.leftBinding, this.timings))
      : null;
    this.rightDetector = this.rightBinding
      ? new GestureDetector(toGestureConfig(this.rightBinding, this.timings))
      : null;
  }

  setBindings(
    leftBinding: ControlBinding | null,
    rightBinding: ControlBinding | null
  ): void {
    this.leftBinding = leftBinding;
    this.rightBinding = rightBinding;
    this.rebuild();
  }

  setTimings(patch: Partial<ClickTimings>): void {
    this.timings = { ...this.timings, ...patch };
    this.leftDetector?.setConfig(patch);
    this.rightDetector?.setConfig(patch);
  }

  reset(): void {
    this.leftDetector?.reset();
    this.rightDetector?.reset();
  }

  /** Advance one frame; performs at most one click. Left takes precedence. */
  update(signals: Record<string, number>, timestamp: number): ClickTick {
    let fired: ClickKind | null = null;

    if (this.leftDetector && this.leftBinding) {
      const v = signals[this.leftBinding.signal];
      if (typeof v === "number" && !Number.isNaN(v)) {
        const u = this.leftDetector.update(v, timestamp);
        if (u.event === "start") {
          fired = "left";
          void this.input.leftClick();
        }
      }
    }

    if (!fired && this.rightDetector && this.rightBinding) {
      const v = signals[this.rightBinding.signal];
      if (typeof v === "number" && !Number.isNaN(v)) {
        const u = this.rightDetector.update(v, timestamp);
        if (u.event === "start") {
          fired = "right";
          void this.input.rightClick();
        }
      }
    } else if (this.rightDetector && this.rightBinding) {
      // Keep the right detector's state machine advancing even when left fired,
      // so its phase/cooldown stay coherent frame-to-frame.
      const v = signals[this.rightBinding.signal];
      if (typeof v === "number" && !Number.isNaN(v)) {
        this.rightDetector.update(v, timestamp);
      }
    }

    return { fired };
  }
}
