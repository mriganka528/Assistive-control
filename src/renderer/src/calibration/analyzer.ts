// ---------------------------------------------------------------------------
// Assistive Control — movement analyzer
//
// Scores each tested movement as a *control-reliability* estimate (NOT medical
// accuracy). Selection combines several independent signals so we don't pick a
// semantically-wrong channel just because of statistical noise:
//
//   1. Separation from baseline        (Cohen's d)
//   2. Consistency while active         (low relative spread)
//   3. Repeatability across reps        (stable peaks rep-to-rep)
//   4. False activation during baseline (baseline rarely crosses threshold)
//   5. Plausibility (soft prior)        (channel fits the movement family)
//   6. Temporal characteristics         (clean, well-formed activations)
//
// Plausibility is a *soft* multiplier only — an unexpected but genuinely strong
// channel can still win, preserving the movement-agnostic product goal.
// ---------------------------------------------------------------------------

import type {
  SignalSample,
  SignalStats,
  BaselineModel,
  SignalEvaluation,
  MovementResult,
  MovementFamily,
  MovementDirection,
} from "./types";

const EPS = 1e-6;
const REP_GAP_MS = 500; // timestamp gap that separates two recorded reps
const D_MAX = 3; // Cohen's d that maps to a full separation score

// Weights for the final control-reliability score (sum = 1).
const W_SEPARATION = 0.3;
const W_LOW_FALSE = 0.25;
const W_REPEATABILITY = 0.2;
const W_CONSISTENCY = 0.15;
const W_TEMPORAL = 0.1;

// ---------------------------------------------------------------------------
// Basic statistics
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function variance(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (const v of values) sum += (v - avg) * (v - avg);
  return sum / (values.length - 1);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx];
}

export function computeStats(values: number[]): SignalStats {
  if (values.length === 0) {
    return { mean: 0, std: 0, variance: 0, min: 0, max: 0, p95: 0, count: 0 };
  }
  const avg = mean(values);
  const varc = variance(values, avg);
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: avg,
    std: Math.sqrt(varc),
    variance: varc,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: percentile(sorted, 95),
    count: values.length,
  };
}

function channelValues(samples: SignalSample[], channel: string): number[] {
  const out: number[] = [];
  for (const s of samples) {
    const v = s.signals[channel];
    if (typeof v === "number" && !Number.isNaN(v)) out.push(v);
  }
  return out;
}

/** All channels present across the given samples (excludes MediaPipe "_neutral"). */
function collectChannels(samples: SignalSample[]): Set<string> {
  const channels = new Set<string>();
  for (const s of samples) {
    for (const ch of Object.keys(s.signals)) {
      if (ch !== "_neutral") channels.add(ch);
    }
  }
  return channels;
}

/** Split a concatenated recording back into per-rep segments using time gaps. */
function segmentByTimeGap(
  samples: SignalSample[],
  gapMs = REP_GAP_MS
): SignalSample[][] {
  if (samples.length === 0) return [];
  const segments: SignalSample[][] = [];
  let current: SignalSample[] = [samples[0]];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].timestamp - samples[i - 1].timestamp > gapMs) {
      segments.push(current);
      current = [];
    }
    current.push(samples[i]);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

// ---------------------------------------------------------------------------
// Plausibility (soft priors) + family / direction inference
// ---------------------------------------------------------------------------

type PlausibilityRule = {
  name: RegExp; // matches the movement name
  strong: RegExp; // channels that strongly fit -> 1.0
  medium?: RegExp; // channels that loosely fit -> 0.6
  family: MovementFamily;
};

const PLAUSIBILITY_RULES: PlausibilityRule[] = [
  {
    name: /blink|wink/,
    strong: /eyeblink/,
    medium: /eyesquint|eyewide/,
    family: "eye-blink",
  },
  {
    name: /look|gaze|glance|eye/,
    strong: /eyelook/,
    medium: /eyesquint|eyewide|eyeblink/,
    family: "eye-look",
  },
  {
    name: /brow|eyebrow|raise/,
    strong: /brow/,
    family: "brow",
  },
  {
    name: /smile|grin/,
    strong: /mouthsmile/,
    medium: /cheeksquint|mouthdimple|mouthstretch/,
    family: "mouth",
  },
  { name: /frown/, strong: /mouthfrown/, family: "mouth" },
  {
    name: /pucker|kiss/,
    strong: /mouthpucker|mouthfunnel/,
    family: "mouth",
  },
  {
    name: /jaw|open|mouth/,
    strong: /jawopen/,
    medium: /mouthfunnel|mouthpucker|mouthclose/,
    family: "jaw",
  },
  { name: /cheek|puff/, strong: /cheek/, family: "cheek" },
  { name: /nose|sneer/, strong: /nosesneer/, family: "mouth" },
  {
    name: /head|nod|tilt|turn|yaw|pitch|roll/,
    strong: /head/,
    family: "head",
  },
  {
    name: /hand|finger|pinch|fist|palm|thumb|index/,
    strong: /hand|finger|pinch|thumb|index|palm|fist/,
    family: "hand",
  },
];

/**
 * Soft prior in [0,1] that `channel` is meaningful for movement `name`.
 * Returns { plausibility, family, matched }.
 * When the name matches no known family we return a neutral 0.7 (no prior),
 * so novel/unexpected movements are not penalized — supporting discovery.
 */
function channelPlausibility(
  name: string,
  channel: string
): { plausibility: number; family: MovementFamily; matched: boolean } {
  const n = name.toLowerCase();
  const c = channel.toLowerCase();

  // Direction-only names (e.g. "Left") could be eye OR head — consider both.
  const directionOnly =
    /^(left|right|up|down)$/.test(n.trim()) ||
    (/left|right|up|down/.test(n) && !/eye|look|head|brow|smile|jaw|cheek/.test(n));

  for (const rule of PLAUSIBILITY_RULES) {
    if (rule.name.test(n)) {
      if (rule.strong.test(c)) {
        return { plausibility: 1.0, family: rule.family, matched: true };
      }
      if (rule.medium && rule.medium.test(c)) {
        return { plausibility: 0.6, family: rule.family, matched: true };
      }
      return { plausibility: 0.35, family: rule.family, matched: true };
    }
  }

  if (directionOnly) {
    if (/eyelook|head/.test(c)) {
      return { plausibility: 0.9, family: "generic", matched: true };
    }
    return { plausibility: 0.4, family: "generic", matched: true };
  }

  return { plausibility: 0.7, family: "generic", matched: false };
}

/** Best-effort family classification from the winning channel. */
function familyFromChannel(channel: string): MovementFamily {
  const c = channel.toLowerCase();
  if (/eyeblink/.test(c)) return "eye-blink";
  if (/eyelook/.test(c)) return "eye-look";
  if (/brow/.test(c)) return "brow";
  if (/cheek/.test(c)) return "cheek";
  if (/jaw/.test(c)) return "jaw";
  if (/mouth|nose/.test(c)) return "mouth";
  if (/head/.test(c)) return "head";
  if (/hand|finger|pinch|thumb|index|palm|fist/.test(c)) return "hand";
  return "generic";
}

/**
 * Infer a directional intent from the movement name, else the channel.
 * `increases` (whether the movement drives the channel up or down from
 * baseline) lets positional hand channels resolve a direction: e.g. the wrist
 * moving down-image (handPosY increasing) is a "down" movement. Directional
 * movements feed the cursor/scroll roles (§7); non-directional ones feed
 * discrete actions like clicks.
 */
function inferDirection(
  name: string,
  channel: string,
  increases = true
): MovementDirection | null {
  const n = name.toLowerCase();
  const c = channel.toLowerCase();

  // 1. Explicit direction in the (rarely used) movement name.
  if (/right/.test(n)) return "right";
  if (/left/.test(n)) return "left";
  if (/up|rais|top/.test(n)) return "up";
  if (/down|low|bottom/.test(n)) return "down";

  // 2. Face/head channels encode direction in their name.
  if (/lookup/.test(c)) return "up";
  if (/lookdown/.test(c)) return "down";
  if (/lookout.*left|lookin.*right/.test(c)) return "left";
  if (/lookout.*right|lookin.*left/.test(c)) return "right";
  if (/left/.test(c) && /look|head/.test(c)) return "left";
  if (/right/.test(c) && /look|head/.test(c)) return "right";

  // 3. Positional hand channels: the axis is continuous, so the sign of the
  //    movement (increase vs decrease from baseline) picks the direction.
  //    (Image y grows downward; the exact left/right sense can be flipped in
  //    the editable mapping if a user's camera setup reverses it.)
  if (/posx/.test(c)) return increases ? "right" : "left";
  if (/posy/.test(c)) return increases ? "down" : "up";

  return null;
}

// ---------------------------------------------------------------------------
// Per-channel evaluation
// ---------------------------------------------------------------------------

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function evaluateChannel(
  channel: string,
  movementName: string,
  baselineStats: SignalStats,
  movementSamples: SignalSample[],
  repSegments: SignalSample[][]
): SignalEvaluation {
  const mValues = channelValues(movementSamples, channel);
  const mStats = computeStats(mValues);

  const increases = mStats.mean >= baselineStats.mean;

  // --- Activation / release thresholds (with hysteresis) --------------------
  const bMean = baselineStats.mean;
  const bStd = baselineStats.std;
  let activationThreshold: number;
  if (increases) {
    const noiseTop = Math.max(baselineStats.p95, bMean + 2.0 * bStd);
    const midpoint = bMean + 0.5 * (mStats.mean - bMean);
    activationThreshold = Math.max(noiseTop, Math.min(midpoint, mStats.max));
  } else {
    const noiseBot = Math.min(bMean - 2.0 * bStd, baselineStats.min);
    const midpoint = bMean + 0.5 * (mStats.mean - bMean);
    activationThreshold = Math.min(noiseBot, Math.max(midpoint, mStats.min));
  }
  // Release threshold sits halfway back toward baseline (hysteresis).
  const releaseThreshold = bMean + 0.5 * (activationThreshold - bMean);

  const isActive = (v: number): boolean =>
    increases ? v >= activationThreshold : v <= activationThreshold;

  // --- Separation (Cohen's d) ----------------------------------------------
  const pooledStd =
    Math.sqrt((baselineStats.variance + mStats.variance) / 2) + EPS;
  const d = Math.abs(mStats.mean - bMean) / pooledStd;
  const separation = clamp01(d / D_MAX);

  // --- False activation during baseline ------------------------------------
  // Approximated from baseline stats: probability a Gaussian baseline exceeds
  // the activation threshold. (We only keep baseline *stats* on the profile,
  // but here we still have the movement samples; baseline crossing is derived
  // from its distribution to stay cheap and robust.)
  const zGap = Math.abs(activationThreshold - bMean) / (bStd + EPS);
  // Complementary error-function style tail estimate, bounded to [0,1].
  const falseActivationRate = clamp01(0.5 * Math.exp(-0.7 * zGap * zGap));

  // --- Consistency (stability while active) --------------------------------
  const activeVals = mValues.filter(isActive);
  let consistency = 0;
  if (activeVals.length >= 2) {
    const activeStats = computeStats(activeVals);
    const amplitude = Math.abs(activeStats.mean - bMean) + EPS;
    consistency = clamp01(1 - activeStats.std / amplitude);
  }

  // --- Repeatability across reps -------------------------------------------
  const repPeaks: number[] = [];
  const repDurations: number[] = [];
  let repsReachingActivation = 0;
  for (const seg of repSegments) {
    const vals = channelValues(seg, channel);
    if (vals.length === 0) continue;
    const segStats = computeStats(vals);
    const peakDev = increases
      ? segStats.max - bMean
      : bMean - segStats.min;
    repPeaks.push(peakDev);

    // Duration this rep spent active (ms).
    let firstActive = -1;
    let lastActive = -1;
    for (let i = 0; i < seg.length; i++) {
      if (isActive(seg[i].signals[channel] ?? bMean)) {
        if (firstActive < 0) firstActive = i;
        lastActive = i;
      }
    }
    if (firstActive >= 0) {
      repsReachingActivation++;
      repDurations.push(
        seg[lastActive].timestamp - seg[firstActive].timestamp
      );
    } else {
      repDurations.push(0);
    }
  }

  let repeatability: number;
  if (repPeaks.length >= 2) {
    const peakStats = computeStats(repPeaks);
    repeatability = clamp01(1 - peakStats.std / (Math.abs(peakStats.mean) + EPS));
  } else if (repPeaks.length === 1) {
    repeatability = 0.5; // single clean rep — can't fully judge repeat
  } else {
    repeatability = 0;
  }

  // --- Temporal quality -----------------------------------------------------
  const repCount = repSegments.length || 1;
  const fractionActiveReps = repsReachingActivation / repCount;
  const meanDuration = mean(repDurations.filter((x) => x > 0));
  // Reward reps that reached activation and sustained ~long enough to control.
  const durationScore = clamp01(meanDuration / 350);
  const temporal = clamp01(fractionActiveReps * (0.5 + 0.5 * durationScore));

  // --- Combine (control reliability, excludes plausibility) -----------------
  const reliability =
    W_SEPARATION * separation +
    W_LOW_FALSE * (1 - falseActivationRate) +
    W_REPEATABILITY * repeatability +
    W_CONSISTENCY * consistency +
    W_TEMPORAL * temporal;

  const { plausibility } = channelPlausibility(movementName, channel);

  return {
    channel,
    separation,
    consistency,
    repeatability,
    falseActivationRate,
    plausibility,
    temporal,
    activation: mStats.mean,
    activationThreshold,
    releaseThreshold,
    increases,
    score: Math.round(clamp01(reliability) * 100),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build per-channel baseline statistics from raw baseline samples. */
export function buildBaselineModel(
  baselineSamples: SignalSample[],
  durationMs = 0
): BaselineModel {
  const channels = collectChannels(baselineSamples);
  const stats: Record<string, SignalStats> = {};
  for (const ch of channels) {
    stats[ch] = computeStats(channelValues(baselineSamples, ch));
  }
  return {
    channels: stats,
    sampleCount: baselineSamples.length,
    durationMs,
  };
}

/**
 * Analyze recorded movements against the baseline and return ranked results.
 * Signature is unchanged from the original prototype so existing callers keep
 * working; the internals are the improved multi-factor analysis.
 */
export function analyzeMovements(
  baselineSamples: SignalSample[],
  movementSamples: Record<string, SignalSample[]>
): MovementResult[] {
  if (
    baselineSamples.length === 0 ||
    Object.keys(movementSamples).length === 0
  ) {
    return [];
  }

  // Candidate channels = everything seen in the baseline (+ movement) minus
  // "_neutral". We evaluate all of them; plausibility only softly re-weights.
  const channelSet = collectChannels(baselineSamples);

  // Pre-compute baseline stats per channel.
  const baselineStats: Record<string, SignalStats> = {};
  for (const ch of channelSet) {
    baselineStats[ch] = computeStats(channelValues(baselineSamples, ch));
  }

  const results: MovementResult[] = [];

  for (const [movementName, samples] of Object.entries(movementSamples)) {
    if (samples.length === 0) continue;

    // Also consider channels that appear only in the movement recording.
    const channels = new Set<string>(channelSet);
    for (const ch of collectChannels(samples)) channels.add(ch);

    const repSegments = segmentByTimeGap(samples);

    const evaluations: SignalEvaluation[] = [];
    for (const ch of channels) {
      const bStats = baselineStats[ch] ?? computeStats([]);
      evaluations.push(
        evaluateChannel(ch, movementName, bStats, samples, repSegments)
      );
    }

    // Rank by plausibility-adjusted score. Plausibility can discount a channel
    // by at most 40% (when plausibility = 0), never fully block it.
    const adjusted = evaluations
      .map((e) => ({
        evaluation: e,
        adjusted: e.score * (0.6 + 0.4 * e.plausibility),
      }))
      .sort((a, b) => b.adjusted - a.adjusted);

    const best = adjusted[0].evaluation;
    const alternatives = adjusted.slice(1, 6).map((a) => a.evaluation);

    const family = (() => {
      const p = channelPlausibility(movementName, best.channel);
      return p.matched ? p.family : familyFromChannel(best.channel);
    })();

    const direction = inferDirection(movementName, best.channel, best.increases);
    const isDirectional = direction !== null;

    results.push({
      name: movementName,
      score: best.score,
      bestSignal: best.channel,
      family,
      isDirectional,
      direction,
      activationThreshold: best.activationThreshold,
      releaseThreshold: best.releaseThreshold,
      increases: best.increases,
      evaluation: best,
      alternatives,
    });
  }

  // Strongest movement first.
  results.sort((a, b) => b.score - a.score);
  return results;
}
