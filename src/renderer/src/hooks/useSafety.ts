// ---------------------------------------------------------------------------
// Assistive Control — safety hook
//
// React binding for the main-process safety state machine. Mirrors the live
// SafetyState and exposes arm/disarm/pause/resume/stop actions. The global
// Ctrl+Shift+X emergency stop is handled in main; this hook receives the
// resulting state push, so the UI always reflects reality.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { SafetyState } from "../../../shared/ipc";

const IDLE: SafetyState = {
  armed: false,
  paused: false,
  stopped: false,
  reason: "idle",
};

export type UseSafety = {
  state: SafetyState;
  available: boolean;
  /** true briefly after a global emergency stop, for a UI flash. */
  emergencyFlash: boolean;
  arm: () => void;
  disarm: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export function useSafety(): UseSafety {
  const [state, setState] = useState<SafetyState>(IDLE);
  const [emergencyFlash, setEmergencyFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);

  const api =
    typeof window !== "undefined" ? window.electronAPI?.safety : undefined;

  useEffect(() => {
    if (!api) return;
    let mounted = true;

    api
      .getState()
      .then((s) => {
        if (mounted) setState(s);
      })
      .catch(() => undefined);

    const offState = api.onStateChange((s) => setState(s));
    const offStop = api.onEmergencyStop(() => {
      setEmergencyFlash(true);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setEmergencyFlash(false), 2500);
    });

    return () => {
      mounted = false;
      offState();
      offStop();
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, [api]);

  const arm = useCallback(() => {
    api?.arm().then(setState).catch(() => undefined);
  }, [api]);
  const disarm = useCallback(() => {
    api?.disarm().then(setState).catch(() => undefined);
  }, [api]);
  const pause = useCallback(() => {
    api?.pause().then(setState).catch(() => undefined);
  }, [api]);
  const resume = useCallback(() => {
    api?.resume().then(setState).catch(() => undefined);
  }, [api]);
  const stop = useCallback(() => {
    api?.stop().then(setState).catch(() => undefined);
  }, [api]);

  return { state, available: !!api, emergencyFlash, arm, disarm, pause, resume, stop };
}
