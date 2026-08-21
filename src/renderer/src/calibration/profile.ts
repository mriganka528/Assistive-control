// ---------------------------------------------------------------------------
// Assistive Control — user profile (build + local persistence)
//
// The profile is stored as local JSON in the Electron main process
// (app.getPath('userData')/profile.json) via the preload bridge. The renderer
// has no direct filesystem access, honoring the security model. Nothing is
// ever uploaded — see PHASE 17 (local-only privacy).
// ---------------------------------------------------------------------------

import {
  PROFILE_VERSION,
  DEFAULT_THRESHOLDS,
  DEFAULT_SETTINGS,
  type CalibrationProfile,
  type MovementResult,
  type SignalSample,
  type SignalStats,
  type Thresholds,
  type Settings,
} from "./types";
import { buildBaselineModel, computeStats } from "./analyzer";
import { buildControlMapping } from "../control/movementMapper";

function nowIso(): string {
  return new Date().toISOString();
}

function bestSignalStats(
  movement: MovementResult,
  movementSamples?: Record<string, SignalSample[]>
): SignalStats {
  const samples = movementSamples?.[movement.name];
  if (samples && samples.length > 0) {
    const values: number[] = [];
    for (const s of samples) {
      const v = s.signals[movement.bestSignal];
      if (typeof v === "number" && !Number.isNaN(v)) values.push(v);
    }
    if (values.length > 0) return computeStats(values);
  }
  // Fall back to a synthetic single-point stat from the evaluation.
  const a = movement.evaluation.activation;
  return { mean: a, std: 0, variance: 0, min: a, max: a, p95: a, count: 0 };
}

export type BuildProfileParams = {
  baselineSamples: SignalSample[];
  baselineDurationMs?: number;
  movements: MovementResult[];
  movementSamples?: Record<string, SignalSample[]>;
  thresholds?: Thresholds;
  settings?: Settings;
  /** Existing profile to preserve createdAt / user tunables across recalibration. */
  previous?: CalibrationProfile | null;
};

/** Assemble a complete, versioned profile from calibration output. */
export function buildProfile(params: BuildProfileParams): CalibrationProfile {
  const {
    baselineSamples,
    baselineDurationMs = 0,
    movements,
    movementSamples,
    thresholds,
    settings,
    previous,
  } = params;

  const baseline = buildBaselineModel(baselineSamples, baselineDurationMs);
  const controls = buildControlMapping(movements);

  const reliability: Record<string, number> = {};
  const signals: Record<string, SignalStats> = {};
  for (const m of movements) {
    reliability[m.name] = m.score;
    signals[m.name] = bestSignalStats(m, movementSamples);
  }

  return {
    version: PROFILE_VERSION,
    baseline,
    movements,
    signals,
    reliability,
    controls,
    thresholds: thresholds ?? previous?.thresholds ?? DEFAULT_THRESHOLDS,
    settings: settings ?? previous?.settings ?? DEFAULT_SETTINGS,
    createdAt: previous?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Persistence (via preload bridge)
// ---------------------------------------------------------------------------

export function isElectronAvailable(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI;
}

/** Minimal structural validation + light migration of a loaded profile. */
function coerceProfile(raw: unknown): CalibrationProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<CalibrationProfile>;
  if (!p.baseline || !Array.isArray(p.movements) || !p.controls) return null;

  // Fill any missing optional sections with defaults (forward compatibility).
  return {
    version: typeof p.version === "number" ? p.version : PROFILE_VERSION,
    baseline: p.baseline,
    movements: p.movements,
    signals: p.signals ?? {},
    reliability: p.reliability ?? {},
    controls: p.controls,
    thresholds: { ...DEFAULT_THRESHOLDS, ...(p.thresholds ?? {}) },
    settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    createdAt: p.createdAt ?? nowIso(),
    updatedAt: p.updatedAt ?? nowIso(),
  };
}

/** Load the saved profile, or null if none / unavailable. */
export async function loadProfile(): Promise<CalibrationProfile | null> {
  if (!isElectronAvailable()) return null;
  try {
    const raw = await window.electronAPI!.profile.load();
    return coerceProfile(raw);
  } catch (err) {
    console.error("Failed to load profile:", err);
    return null;
  }
}

/** Persist the profile locally. Returns true on success. */
export async function saveProfile(
  profile: CalibrationProfile
): Promise<boolean> {
  profile.updatedAt = nowIso();
  if (!isElectronAvailable()) {
    console.warn("Electron bridge unavailable — profile not persisted.");
    return false;
  }
  try {
    return await window.electronAPI!.profile.save(profile);
  } catch (err) {
    console.error("Failed to save profile:", err);
    return false;
  }
}

/** Delete the saved profile (used before a full recalibration). */
export async function clearProfile(): Promise<boolean> {
  if (!isElectronAvailable()) return false;
  try {
    return await window.electronAPI!.profile.clear();
  } catch (err) {
    console.error("Failed to clear profile:", err);
    return false;
  }
}
