// ---------------------------------------------------------------------------
// Assistive Control — adaptive reliability monitor (PHASE 10 / 18)
//
// Continuously tracks how well each movement's control signal is performing,
// over a rolling stability window. It aggregates per-frame reliability readings
// into a smoothed current/average value, a trend, and how long a movement has
// been degraded — which the switching manager uses to decide when to act.
//
// `instantaneousReliability()` is a movement-agnostic, NON-medical estimate of
// live "Control Confidence" (never called accuracy): it scales the calibrated
// score by tracking confidence and penalizes baseline drift / poor SNR.
// ---------------------------------------------------------------------------

import type { HealthReading, MovementHealth } from "../calibration/types";

export type LiveSample = {
  /** resting mean of the channel from the profile baseline. */
  baselineMean: number;
  /** resting std of the channel from the profile baseline. */
  baselineStd: number;
  /** activation threshold for this movement's signal. */
  activationThreshold: number;
  /** whether the movement drives the channel up (true) or down. */
  increases: boolean;
  /** calibrated control-confidence score [0,100]. */
  calibratedScore: number;
  /** live tracking confidence [0,1]; ~0 when the face/hand is lost. */
  trackingConfidence: number;
};

/**
 * Estimate instantaneous control confidence [0,100] for one movement. This is
 * intentionally conservative and honest: it degrades toward 0 as tracking is
 * lost, as the resting baseline drifts toward the activation threshold (false
 * activation risk), or as signal noise overwhelms the activation margin.
 */
export function instantaneousReliability(s: LiveSample): number {
  const conf = clamp(s.trackingConfidence, 0, 1);

  // Margin between the resting baseline and the activation threshold.
  const margin = s.increases
    ? s.activationThreshold - s.baselineMean
    : s.baselineMean - s.activationThreshold;

  // Drift: baseline crossing the activation side is a strong degradation.
  const driftFactor = margin <= 0 ? 0.2 : clamp(margin / 0.1, 0.2, 1);

  // Signal-to-noise of the activation margin vs resting noise.
  const snr = margin / (s.baselineStd + 1e-3);
  const noiseFactor = clamp(snr / 3, 0.3, 1);

  const r = s.calibratedScore * conf * driftFactor * noiseFactor;
  return clamp(r, 0, 100);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export type MonitorConfig = {
  /** rolling window used for averaging & trend (ms). */
  windowMs: number;
  /** average below this is considered "degraded". */
  degradeThreshold: number;
  /** must stay degraded this long before it counts as sustained (ms). */
  stabilityMs: number;
};

export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  windowMs: 3000,
  degradeThreshold: 45,
  stabilityMs: 2500,
};

const TREND_EPS = 3;

export class ReliabilityMonitor {
  private cfg: MonitorConfig;
  private readings = new Map<string, HealthReading[]>();
  private degradedSince = new Map<string, number>();

  constructor(cfg: MonitorConfig = DEFAULT_MONITOR_CONFIG) {
    this.cfg = cfg;
  }

  setConfig(patch: Partial<MonitorConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  reset(): void {
    this.readings.clear();
    this.degradedSince.clear();
  }

  /** Record a live reliability reading and maintain the degradation timer. */
  record(reading: HealthReading): void {
    const list = this.readings.get(reading.movementName) ?? [];
    list.push(reading);
    const cutoff = reading.timestamp - this.cfg.windowMs;
    while (list.length > 0 && list[0].timestamp < cutoff) list.shift();
    this.readings.set(reading.movementName, list);

    const avg = mean(list.map((r) => r.reliability));
    if (avg < this.cfg.degradeThreshold) {
      if (!this.degradedSince.has(reading.movementName)) {
        this.degradedSince.set(reading.movementName, reading.timestamp);
      }
    } else {
      this.degradedSince.delete(reading.movementName);
    }
  }

  private windowFor(name: string): HealthReading[] {
    return this.readings.get(name) ?? [];
  }

  health(name: string, now: number): MovementHealth {
    const list = this.windowFor(name);
    if (list.length === 0) {
      return {
        movementName: name,
        current: 0,
        average: 0,
        trend: "stable",
        degradedForMs: 0,
      };
    }

    const values = list.map((r) => r.reliability);
    const current = values[values.length - 1];
    const average = mean(values);

    // Trend: compare the first vs second half of the window by time.
    const mid = list[0].timestamp + (now - list[0].timestamp) / 2;
    const first = mean(
      list.filter((r) => r.timestamp < mid).map((r) => r.reliability)
    );
    const second = mean(
      list.filter((r) => r.timestamp >= mid).map((r) => r.reliability)
    );
    let trend: MovementHealth["trend"] = "stable";
    if (second - first > TREND_EPS) trend = "improving";
    else if (first - second > TREND_EPS) trend = "degrading";

    const since = this.degradedSince.get(name);
    const degradedForMs = since !== undefined ? Math.max(0, now - since) : 0;

    return { movementName: name, current, average, trend, degradedForMs };
  }

  /** True when a movement has been degraded for at least stabilityMs. */
  isDegraded(name: string, now: number): boolean {
    const since = this.degradedSince.get(name);
    if (since === undefined) return false;
    return now - since >= this.cfg.stabilityMs;
  }

  /** All movement names currently being tracked. */
  trackedNames(): string[] {
    return [...this.readings.keys()];
  }
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
