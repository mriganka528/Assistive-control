// ---------------------------------------------------------------------------
// Assistive Control — shared IPC contract
//
// Imported by BOTH the renderer (types only — erased at build) and the
// preload/main processes (channel constants + payload types). Keep this file
// free of DOM- and Node-specific APIs so it type-checks under both tsconfigs.
// ---------------------------------------------------------------------------

/** IPC channel names shared between preload and main. */
export const IPC = {
  // Input controller
  INPUT_SCREEN_SIZE: "input:screenSize",
  INPUT_MOVE_TO: "input:moveTo",
  INPUT_MOVE_BY: "input:moveBy",
  INPUT_LEFT_CLICK: "input:leftClick",
  INPUT_RIGHT_CLICK: "input:rightClick",
  INPUT_MIDDLE_CLICK: "input:middleClick",
  INPUT_DOUBLE_CLICK: "input:doubleClick",
  INPUT_SCROLL: "input:scroll",
  INPUT_KEY_PRESS: "input:keyPress",
  INPUT_TYPE_TEXT: "input:typeText",
  INPUT_IS_REAL: "input:isReal",
  INPUT_DIAGNOSTICS: "input:diagnostics",

  // Safety
  SAFETY_ARM: "safety:arm",
  SAFETY_DISARM: "safety:disarm",
  SAFETY_PAUSE: "safety:pause",
  SAFETY_RESUME: "safety:resume",
  SAFETY_STOP: "safety:stop",
  SAFETY_GET_STATE: "safety:getState",
  SAFETY_STATE_CHANGED: "safety:stateChanged", // main -> renderer push
  SAFETY_EMERGENCY_STOP: "safety:emergencyStop", // main -> renderer push

  // Profile persistence
  PROFILE_LOAD: "profile:load",
  PROFILE_SAVE: "profile:save",
  PROFILE_CLEAR: "profile:clear",

  // Application launching (§14)
  APP_LIST: "app:list",
  APP_LAUNCH: "app:launch",
} as const;

export type ScreenSize = { width: number; height: number };

/**
 * Diagnostics for the REAL vs SIMULATION input mode (§9/§24). The app must make
 * it unmistakable whether movements drive the real OS or are only being logged.
 */
export type InputDiagnostics = {
  /** true = real OS control active; false = simulation (actions only logged). */
  real: boolean;
  /** machine-readable state for styling/branching. */
  status: "ready" | "not-installed" | "load-error";
  /** human-readable one-line explanation for the banner. */
  message: string;
  /** the optional native module that enables real control. */
  moduleName: string;
  /** actionable next step when not real (empty when real). */
  hint: string;
};

export type SafetyState = {
  /** Control is armed (allowed to inject input) vs. disarmed. */
  armed: boolean;
  /** Temporarily paused by the user. */
  paused: boolean;
  /** Hard emergency-stopped; requires an explicit re-arm. */
  stopped: boolean;
  /** Reason for the current state (for the UI). */
  reason: string;
};

/**
 * A launchable application (§14). The renderer can only launch apps from this
 * server-provided allow-list by `id` — it can never supply an arbitrary command,
 * so the control system cannot be turned into a way to run anything on the OS.
 */
export type LaunchableApp = {
  id: string;
  label: string;
  /** true if the launcher expects this app to exist on the current platform. */
  available: boolean;
};

export type AppLaunchResult = {
  ok: boolean;
  /** human-readable outcome for the UI. */
  message: string;
};

/**
 * The API surface exposed to the renderer on `window.electronAPI`.
 * `profile` values are `unknown` at this boundary — the renderer's
 * `calibration/profile.ts` wrapper applies the typed `CalibrationProfile`.
 */
export type ElectronAPI = {
  isElectron: boolean;

  input: {
    getScreenSize(): Promise<ScreenSize>;
    moveCursorTo(x: number, y: number): Promise<boolean>;
    moveCursorBy(dx: number, dy: number): Promise<boolean>;
    leftClick(): Promise<boolean>;
    rightClick(): Promise<boolean>;
    middleClick(): Promise<boolean>;
    doubleClick(): Promise<boolean>;
    scroll(dx: number, dy: number): Promise<boolean>;
    keyPress(key: string): Promise<boolean>;
    typeText(text: string): Promise<boolean>;
    /** false when running in simulation mode (nut.js not installed). */
    isRealInput(): Promise<boolean>;
    /** Full REAL vs SIMULATION diagnostics for the status banner. */
    inputDiagnostics(): Promise<InputDiagnostics>;
  };

  safety: {
    arm(): Promise<SafetyState>;
    disarm(): Promise<SafetyState>;
    pause(): Promise<SafetyState>;
    resume(): Promise<SafetyState>;
    stop(): Promise<SafetyState>;
    getState(): Promise<SafetyState>;
    /** Subscribe to main-driven state changes; returns an unsubscribe fn. */
    onStateChange(cb: (state: SafetyState) => void): () => void;
    /** Subscribe to the global emergency-stop hotkey; returns unsubscribe fn. */
    onEmergencyStop(cb: () => void): () => void;
  };

  profile: {
    load(): Promise<unknown | null>;
    save(profile: unknown): Promise<boolean>;
    clear(): Promise<boolean>;
  };

  apps: {
    /** The allow-list of launchable apps for this platform. */
    list(): Promise<LaunchableApp[]>;
    /** Launch an allow-listed app by id. */
    launch(id: string): Promise<AppLaunchResult>;
  };
};
