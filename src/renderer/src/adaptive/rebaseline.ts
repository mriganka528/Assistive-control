// ---------------------------------------------------------------------------
// Assistive Control — quick re-baseline (PHASE 12)
//
// On restart we don't force a full enrollment. Instead we capture a short
// resting baseline and shift each movement's activation/release thresholds by
// how far the resting signal has drifted since calibration (lighting, camera
// position, seating). This preserves the user's personalized mapping and
// hysteresis while adapting to today's conditions.
// ---------------------------------------------------------------------------

import type {
  CalibrationProfile,
  ControlBinding,
  ControlMapping,
  MovementResult,
  SignalSample,
} from "../calibration/types";
import { buildBaselineModel } from "../calibration/analyzer";

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Produce an adjusted profile from a short resting capture. Thresholds move
 * with the baseline drift so the activation margin is preserved; the mapping,
 * reliability, and directions are otherwise unchanged.
 */
export function quickRebaseline(
  profile: CalibrationProfile,
  baselineSamples: SignalSample[],
  durationMs = 0
): CalibrationProfile {
  const newBaseline = buildBaselineModel(baselineSamples, durationMs);

  const driftFor = (channel: string): number => {
    const oldMean = profile.baseline.channels[channel]?.mean ?? 0;
    const newMean = newBaseline.channels[channel]?.mean;
    if (typeof newMean !== "number") return 0;
    return newMean - oldMean;
  };

  const movements: MovementResult[] = profile.movements.map((m) => {
    const shift = driftFor(m.bestSignal);
    if (shift === 0) return m;
    const activationThreshold = clamp01(m.activationThreshold + shift);
    const releaseThreshold = clamp01(m.releaseThreshold + shift);
    return {
      ...m,
      activationThreshold,
      releaseThreshold,
      evaluation: {
        ...m.evaluation,
        activationThreshold,
        releaseThreshold,
      },
    };
  });

  const byName = new Map(movements.map((m) => [m.name, m]));

  const adjustBinding = (b: ControlBinding): ControlBinding => {
    const m = byName.get(b.movementName);
    if (!m) return b;
    return {
      ...b,
      activationThreshold: m.activationThreshold,
      releaseThreshold: m.releaseThreshold,
      increases: m.increases,
    };
  };

  const controls: ControlMapping = {
    cursor: profile.controls.cursor.map(adjustBinding),
    scroll: profile.controls.scroll.map(adjustBinding),
    leftClick: profile.controls.leftClick
      ? adjustBinding(profile.controls.leftClick)
      : null,
    rightClick: profile.controls.rightClick
      ? adjustBinding(profile.controls.rightClick)
      : null,
    confirm: profile.controls.confirm
      ? adjustBinding(profile.controls.confirm)
      : null,
  };

  return {
    ...profile,
    baseline: newBaseline,
    movements,
    controls,
    updatedAt: new Date().toISOString(),
  };
}
