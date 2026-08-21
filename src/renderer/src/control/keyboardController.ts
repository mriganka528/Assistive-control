// ---------------------------------------------------------------------------
// Assistive Control — keyboard / confirm controller (STAGE 8)
//
// Drives the "confirm" control role (a key press — Enter by default) from a
// discrete gesture binding, using the same one-gesture-one-action guarantee as
// clicks. Also exposes generic keyPress / typeText passthroughs for the UI
// (e.g. an on-screen keyboard built later). All actions route through the input
// bridge to the main process, where the safety gate applies.
// ---------------------------------------------------------------------------

import type { ControlBinding } from "../calibration/types";
import { GestureDetector, type GestureConfig } from "./gestureEngine";
import { getInput, type InputPort } from "./inputBridge";

export type ConfirmTimings = {
  dwellMs: number;
  cooldownMs: number;
  longActionMs: number;
};

export type KeyboardTick = {
  /** true on the frame the confirm gesture fired. */
  confirmed: boolean;
};

function toGestureConfig(
  binding: ControlBinding,
  timings: ConfirmTimings
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

export class KeyboardController {
  private confirmBinding: ControlBinding | null;
  private timings: ConfirmTimings;
  private input: InputPort;
  private confirmKey: string;
  private detector: GestureDetector | null = null;

  constructor(
    confirmBinding: ControlBinding | null,
    timings: ConfirmTimings,
    input: InputPort = getInput(),
    confirmKey = "enter"
  ) {
    this.confirmBinding = confirmBinding;
    this.timings = timings;
    this.input = input;
    this.confirmKey = confirmKey;
    this.rebuild();
  }

  private rebuild(): void {
    this.detector = this.confirmBinding
      ? new GestureDetector(toGestureConfig(this.confirmBinding, this.timings))
      : null;
  }

  setBinding(confirmBinding: ControlBinding | null): void {
    this.confirmBinding = confirmBinding;
    this.rebuild();
  }

  setTimings(patch: Partial<ConfirmTimings>): void {
    this.timings = { ...this.timings, ...patch };
    this.detector?.setConfig(patch);
  }

  setConfirmKey(key: string): void {
    this.confirmKey = key;
  }

  reset(): void {
    this.detector?.reset();
  }

  /** Advance one frame; presses the confirm key at most once per gesture. */
  update(signals: Record<string, number>, timestamp: number): KeyboardTick {
    if (!this.detector || !this.confirmBinding) return { confirmed: false };
    const v = signals[this.confirmBinding.signal];
    if (typeof v !== "number" || Number.isNaN(v)) return { confirmed: false };

    const u = this.detector.update(v, timestamp);
    if (u.event === "start") {
      void this.input.keyPress(this.confirmKey);
      return { confirmed: true };
    }
    return { confirmed: false };
  }

  /** Generic passthroughs for UI-driven typing. */
  press(key: string): Promise<boolean> {
    return this.input.keyPress(key);
  }

  type(text: string): Promise<boolean> {
    return this.input.typeText(text);
  }
}
