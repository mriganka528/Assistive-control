// ---------------------------------------------------------------------------
// Assistive Control — safety state machine (MAIN process)
//
// Single source of truth for whether input injection is allowed. Implements
// the PHASE 13 safety model:
//   * arm / disarm         — explicit control on/off
//   * pause / resume        — temporary hold
//   * emergency stop        — hard stop (global hotkey), requires re-arm
//   * canInject()           — the gate every input action consults
//
// The renderer mirrors this state for the UI; the global Ctrl+Shift+X hotkey
// is registered in index.ts and calls emergencyStop() here.
// ---------------------------------------------------------------------------

import type { SafetyState } from "../shared/ipc";

let state: SafetyState = {
  armed: false,
  paused: false,
  stopped: false,
  reason: "idle",
};

type Listener = (state: SafetyState, emergency: boolean) => void;
const listeners = new Set<Listener>();

function snapshot(): SafetyState {
  return { ...state };
}

function emit(emergency = false): void {
  const s = snapshot();
  for (const l of listeners) {
    try {
      l(s, emergency);
    } catch (err) {
      console.error("[safety] listener error:", err);
    }
  }
}

/** Subscribe to state changes; returns an unsubscribe function. */
export function onChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getState(): SafetyState {
  return snapshot();
}

/** The gate consulted by every mutating input action. */
export function canInject(): boolean {
  return state.armed && !state.paused && !state.stopped;
}

export function arm(): SafetyState {
  state = { armed: true, paused: false, stopped: false, reason: "armed" };
  emit();
  return snapshot();
}

export function disarm(): SafetyState {
  state = { armed: false, paused: false, stopped: false, reason: "disarmed" };
  emit();
  return snapshot();
}

export function pause(): SafetyState {
  if (!state.stopped) {
    state = { ...state, paused: true, reason: "paused" };
    emit();
  }
  return snapshot();
}

export function resume(): SafetyState {
  if (!state.stopped) {
    state = { ...state, paused: false, reason: "armed" };
    emit();
  }
  return snapshot();
}

/** Hard stop. Disarms, sets stopped; requires an explicit arm() to recover. */
export function emergencyStop(): SafetyState {
  state = { armed: false, paused: false, stopped: true, reason: "emergency-stop" };
  emit(true);
  return snapshot();
}

/** Clear a prior emergency stop without arming (returns to idle). */
export function clearStop(): SafetyState {
  state = { armed: false, paused: false, stopped: false, reason: "idle" };
  emit();
  return snapshot();
}
