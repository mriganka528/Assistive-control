// ---------------------------------------------------------------------------
// Assistive Control — shared calibration / control / runtime types
//
// NOTE ON tsconfig: this project uses `erasableSyntaxOnly` (no enums / no
// namespaces) and `verbatimModuleSyntax`. All "enum-like" values are modelled
// as string-literal union types plus `const` maps, never `enum`.
// ---------------------------------------------------------------------------

/** A single frame of signal values captured at a point in time. */
export type SignalSample = {
  timestamp: number;
  /** channel name -> value in [0, 1] (blendshapes) or normalized feature. */
  signals: Record<string, number>;
};

/** Summary statistics for one signal channel. */
export type SignalStats = {
  mean: number;
  std: number;
  variance: number;
  min: number;
  max: number;
  /** 95th percentile — robust "high but not outlier" reference. */
  p95: number;
  count: number;
};

/** The user's natural resting behaviour, per channel. */
export type BaselineModel = {
  channels: Record<string, SignalStats>;
  sampleCount: number;
  durationMs: number;
};

/**
 * Movement "family" — a soft classification used only to bias signal
 * selection toward plausible channels. It is NEVER a hard filter, so the
 * analyzer can still surface unexpected-but-strong signals.
 */
export type MovementFamily =
  | "eye-blink"
  | "eye-look"
  | "brow"
  | "mouth"
  | "cheek"
  | "jaw"
  | "head"
  | "hand"
  | "generic";

/** Directional intent a movement can express (for cursor / scroll). */
export type MovementDirection = "left" | "right" | "up" | "down";

/**
 * Multi-stage activation pattern for a discrete gesture derived from ONE signal
 * (§8). A single reliable movement can drive several commands: e.g. blink once
 * -> left click, blink twice -> right click, long blink -> Enter.
 */
export type GesturePattern = "single" | "double" | "long";

/** Detailed quality breakdown for one candidate signal of a movement. */
export type SignalEvaluation = {
  channel: string;
  /** Cohen's-d-style separation from baseline, normalized to [0,1]. */
  separation: number;
  /** Stability of the signal while active, [0,1]. */
  consistency: number;
  /** Consistency of peak activation across repeated bursts, [0,1]. */
  repeatability: number;
  /** How often the baseline falsely crossed the activation threshold, [0,1] (lower is better). */
  falseActivationRate: number;
  /** Soft prior that this channel is meaningful for the movement, [0,1]. */
  plausibility: number;
  /** Temporal quality: clean, repeatable, well-formed activations, [0,1]. */
  temporal: number;
  /** Representative active level during the movement. */
  activation: number;
  /** Suggested activation / release thresholds (with hysteresis). */
  activationThreshold: number;
  releaseThreshold: number;
  /** Whether the movement drives this channel UP (true) or DOWN from baseline. */
  increases: boolean;
  /** Combined control-reliability score in [0,100] (excludes plausibility). */
  score: number;
};

/** The analysis result for a single tested movement. */
export type MovementResult = {
  name: string;
  /** Control-reliability score in [0,100] (NOT a medical accuracy figure). */
  score: number;
  /** Best MediaPipe / feature channel chosen for this movement. */
  bestSignal: string;
  family: MovementFamily;
  isDirectional: boolean;
  direction: MovementDirection | null;
  activationThreshold: number;
  releaseThreshold: number;
  increases: boolean;
  /** Full breakdown for the chosen signal. */
  evaluation: SignalEvaluation;
  /** Other candidate signals for this movement, ranked. */
  alternatives: SignalEvaluation[];
};

// ---------------------------------------------------------------------------
// Control mapping
// ---------------------------------------------------------------------------

/** The abstract functions the app can drive. */
export type ControlRole =
  | "cursor"
  | "leftClick"
  | "rightClick"
  | "middleClick"
  | "scroll"
  | "confirm";

export const CONTROL_ROLES: ControlRole[] = [
  "cursor",
  "leftClick",
  "rightClick",
  "middleClick",
  "scroll",
  "confirm",
];

/** Binds one movement/signal to one control role (with a sub-direction). */
export type ControlBinding = {
  role: ControlRole;
  movementName: string;
  signal: string;
  direction: MovementDirection | null;
  activationThreshold: number;
  releaseThreshold: number;
  increases: boolean;
  reliability: number;
  /**
   * Which activation pattern of the signal triggers this binding (§8).
   * Absent/"single" = a normal one-shot activation. When several discrete
   * roles share the SAME signal they use distinct patterns (single/double/long)
   * so one movement can drive multiple commands.
   */
  pattern?: GesturePattern;
};

/** The complete, personalized control mapping. */
export type ControlMapping = {
  /** 0..4 directional bindings driving the cursor. */
  cursor: ControlBinding[];
  leftClick: ControlBinding | null;
  rightClick: ControlBinding | null;
  middleClick: ControlBinding | null;
  /** up / down bindings driving scroll. */
  scroll: ControlBinding[];
  confirm: ControlBinding | null;
};

// ---------------------------------------------------------------------------
// Tunable thresholds & user settings
// ---------------------------------------------------------------------------

export type Thresholds = {
  cursorDeadZone: number;
  cursorSensitivity: number;
  cursorSpeed: number;
  /** 0..1 exponential smoothing factor (higher = smoother/slower). */
  cursorSmoothing: number;
  /** Response-curve exponent (>1 = fine near rest, full speed at high effort). */
  cursorAcceleration: number;
  scrollDeadZone: number;
  scrollSpeed: number;
  scrollCooldownMs: number;
  clickDwellMs: number;
  clickCooldownMs: number;
  confirmDwellMs: number;
  longActionMs: number;
  /** Multi-stage tap detection (§8): dwell/cooldown for tap counting and the
   *  window within which a second tap counts as a "double". Kept separate from
   *  clickCooldownMs so a double-tap's second press isn't blocked by refractory. */
  tapDwellMs: number;
  tapCooldownMs: number;
  doubleTapWindowMs: number;
  /** How long the face may be lost before input is frozen. */
  faceLossGraceMs: number;
  /** MediaPipe tracking confidence below which control freezes. */
  minTrackingConfidence: number;
};

export type SwitchingMode = "assisted" | "automatic";

export type Settings = {
  switchingMode: SwitchingMode;
  cursorSpeed: number;
  cursorSensitivity: number;
  scrollSpeed: number;
  cameraDeviceId: string | null;
};

/** Sensible starting values. Speeds/sensitivities are user-tunable. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  // A slightly larger dead zone + a precision response curve + stronger
  // smoothing together remove the jitter/overshoot that made control feel
  // imprecise, while the acceleration curve keeps full speed available.
  cursorDeadZone: 0.15,
  cursorSensitivity: 1.0,
  cursorSpeed: 16,
  cursorSmoothing: 0.8,
  cursorAcceleration: 1.6,
  scrollDeadZone: 0.18,
  scrollSpeed: 3,
  scrollCooldownMs: 110,
  clickDwellMs: 180,
  clickCooldownMs: 700,
  confirmDwellMs: 500,
  longActionMs: 900,
  tapDwellMs: 110,
  tapCooldownMs: 150,
  doubleTapWindowMs: 450,
  faceLossGraceMs: 800,
  minTrackingConfidence: 0.4,
};

export const DEFAULT_SETTINGS: Settings = {
  switchingMode: "assisted",
  cursorSpeed: 14,
  cursorSensitivity: 1.0,
  scrollSpeed: 3,
  cameraDeviceId: null,
};

// ---------------------------------------------------------------------------
// Persisted profile
// ---------------------------------------------------------------------------

export const PROFILE_VERSION = 1;

export type CalibrationProfile = {
  version: number;
  baseline: BaselineModel;
  movements: MovementResult[];
  /** Flattened best-signal stats per movement (for quick reference). */
  signals: Record<string, SignalStats>;
  /** movementName -> reliability score [0,100]. */
  reliability: Record<string, number>;
  controls: ControlMapping;
  thresholds: Thresholds;
  settings: Settings;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Runtime (live control loop) types
// ---------------------------------------------------------------------------

export type GesturePhase = "idle" | "rising" | "active" | "cooldown";

/** Discrete events emitted by the gesture engine for one signal. */
export type GestureEvent =
  | "start" // crossed activation + satisfied dwell
  | "hold" // still active this frame
  | "end" // returned below release threshold
  | "short" // start->end quickly (tap)
  | "long"; // held past longActionMs

export type RuntimeState =
  | "READY"
  | "ACTIVE"
  | "PAUSED"
  | "STOPPED"
  | "NO_FACE"
  | "LOW_CONFIDENCE";

/** Snapshot of live control status for the UI. */
export type ControlStatus = {
  armed: boolean;
  paused: boolean;
  faceVisible: boolean;
  trackingConfident: boolean;
  state: RuntimeState;
  activeRole: ControlRole | null;
  activeMovement: string | null;
  activeSignal: string | null;
  activeSignalValue: number;
  activeReliability: number;
};

/** A live reliability reading for the reliability monitor. */
export type HealthReading = {
  movementName: string;
  reliability: number;
  timestamp: number;
};

/** Per-movement live health, aggregated over a rolling window. */
export type MovementHealth = {
  movementName: string;
  current: number;
  average: number;
  trend: "stable" | "improving" | "degrading";
  degradedForMs: number;
};

/** A proposed control switch surfaced to the user (assisted mode). */
export type SwitchProposal = {
  role: ControlRole;
  fromMovement: string;
  toMovement: string;
  fromReliability: number;
  toReliability: number;
  reason: string;
};
