// ---------------------------------------------------------------------------
// Assistive Control — signal math shared by the analog controllers
//
// Small, pure helpers used by the cursor and scroll controllers to turn a raw
// signal value into a normalized [0,1] intensity and to apply a dead zone.
// Kept dependency-free so they are trivially unit-testable.
// ---------------------------------------------------------------------------

/** Clamp x into [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Normalized activation intensity in [0,1]:
 *   0   at (or below) the activation threshold,
 *   1   at the end of the signal's usable range (1 for rising, 0 for falling).
 * Respects whether the movement drives the channel up or down.
 */
export function signalIntensity(
  value: number,
  activationThreshold: number,
  increases: boolean
): number {
  const span = Math.max(
    1e-3,
    increases ? 1 - activationThreshold : activationThreshold
  );
  const raw = increases ? value - activationThreshold : activationThreshold - value;
  return clamp(raw / span, 0, 1);
}

/**
 * Dead-zone a bipolar axis value in [-1,1]. Magnitudes below `dead` return 0;
 * larger magnitudes are rescaled so motion starts smoothly from zero at the
 * dead-zone edge (no sudden jump).
 */
export function applyDeadzone(v: number, dead: number): number {
  const a = Math.abs(v);
  if (a <= dead) return 0;
  const scaled = (a - dead) / Math.max(1e-3, 1 - dead);
  return Math.sign(v) * clamp(scaled, 0, 1);
}
