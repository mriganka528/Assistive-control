// ---------------------------------------------------------------------------
// Assistive Control — application shell / screen router (PHASE 14)
//
// Owns the loaded profile and routes between Home, Calibration, live Control,
// and Settings. All persistence is local (via the preload bridge); nothing is
// uploaded. Calibration produces a profile; Control may adapt it (auto-switch
// or quick re-baseline) and lift the change back here to be saved.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import Home from "./components/Home";
import CameraView from "./components/CameraView";
import ControlView from "./components/ControlView";
import SettingsView from "./components/Settings";
import {
  buildProfile,
  loadProfile,
  saveProfile,
  clearProfile,
} from "./calibration/profile";
import type {
  CalibrationProfile,
  ControlMapping,
  MovementResult,
  Settings,
  SignalSample,
} from "./calibration/types";

type Screen = "home" | "calibrate" | "control" | "settings";

type CalibrationOutput = {
  baselineSamples: SignalSample[];
  baselineDurationMs: number;
  movements: MovementResult[];
  movementSamples: Record<string, SignalSample[]>;
};

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [profile, setProfile] = useState<CalibrationProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadProfile().then((p) => {
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCalibrationComplete = (out: CalibrationOutput) => {
    const built = buildProfile({
      baselineSamples: out.baselineSamples,
      baselineDurationMs: out.baselineDurationMs,
      movements: out.movements,
      movementSamples: out.movementSamples,
      previous: profile, // preserve createdAt + user tunables on recalibration
    });
    setProfile(built);
    void saveProfile(built);
    setScreen("home");
  };

  // Called by ControlView when the profile adapts (auto-switch / re-baseline).
  const handleProfileChange = (updated: CalibrationProfile) => {
    setProfile(updated);
    void saveProfile(updated);
  };

  const handleChangeSettings = (patch: Partial<Settings>) => {
    if (!profile) return;
    const updated: CalibrationProfile = {
      ...profile,
      settings: { ...profile.settings, ...patch },
    };
    setProfile(updated);
    void saveProfile(updated);
  };

  // Manual control-mapping override (§22/§26): persist the edited mapping.
  const handleChangeControls = (controls: ControlMapping) => {
    if (!profile) return;
    const updated: CalibrationProfile = {
      ...profile,
      controls,
      updatedAt: new Date().toISOString(),
    };
    setProfile(updated);
    void saveProfile(updated);
  };

  const handleClearProfile = () => {
    void clearProfile();
    setProfile(null);
    setScreen("home");
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#475569" }}>
        Loading…
      </div>
    );
  }

  if (screen === "calibrate") {
    return (
      <CameraView
        onComplete={handleCalibrationComplete}
        onExit={() => setScreen("home")}
      />
    );
  }

  if (screen === "control") {
    if (!profile) {
      // Guard: control requires a profile.
      setScreen("home");
      return null;
    }
    return (
      <ControlView
        profile={profile}
        onProfileChange={handleProfileChange}
        onExit={() => setScreen("home")}
      />
    );
  }

  if (screen === "settings") {
    if (!profile) {
      setScreen("home");
      return null;
    }
    return (
      <SettingsView
        profile={profile}
        onChangeSettings={handleChangeSettings}
        onChangeControls={handleChangeControls}
        onRecalibrate={() => setScreen("calibrate")}
        onClearProfile={handleClearProfile}
        onBack={() => setScreen("home")}
      />
    );
  }

  return (
    <Home
      hasProfile={profile !== null}
      updatedAt={profile?.updatedAt ?? null}
      onCalibrate={() => setScreen("calibrate")}
      onStartControl={() => setScreen("control")}
      onSettings={() => setScreen("settings")}
    />
  );
}

export default App;
