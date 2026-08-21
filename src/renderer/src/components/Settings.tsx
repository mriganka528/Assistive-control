// ---------------------------------------------------------------------------
// Assistive Control — settings (PHASES 16 & 17)
//
// Switching mode (assisted vs automatic), cursor/scroll tuning, recalibration,
// and the local-only privacy statement. Changes are lifted to App, which
// persists them to the local profile.
// ---------------------------------------------------------------------------

import type {
  CalibrationProfile,
  ControlMapping,
  Settings,
  SwitchingMode,
} from "../calibration/types";
import ControlMappingEditor from "./ControlMappingEditor";

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: "block", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </label>
  );
}

export default function SettingsView({
  profile,
  onChangeSettings,
  onChangeControls,
  onRecalibrate,
  onClearProfile,
  onBack,
}: {
  profile: CalibrationProfile;
  onChangeSettings: (patch: Partial<Settings>) => void;
  onChangeControls: (mapping: ControlMapping) => void;
  onRecalibrate: () => void;
  onClearProfile: () => void;
  onBack: () => void;
}) {
  const s = profile.settings;

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "24px" }}>
      <button onClick={onBack} style={{ marginBottom: "16px" }}>
        ← Back
      </button>
      <h1>Settings</h1>

      <section style={{ marginTop: "20px" }}>
        <h2 style={{ fontSize: "18px" }}>Adaptive switching</h2>
        <p style={{ fontSize: "14px", color: "#475569" }}>
          When a control becomes unreliable, the app can find an alternative
          movement.
        </p>
        {(["assisted", "automatic"] as SwitchingMode[]).map((mode) => (
          <label key={mode} style={{ display: "block", marginTop: "8px" }}>
            <input
              type="radio"
              name="switchingMode"
              checked={s.switchingMode === mode}
              onChange={() => onChangeSettings({ switchingMode: mode })}
            />{" "}
            <strong style={{ textTransform: "capitalize" }}>{mode}</strong>
            {" — "}
            {mode === "assisted"
              ? "ask me before switching (recommended)"
              : "switch automatically"}
          </label>
        ))}
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2 style={{ fontSize: "18px" }}>Cursor & scroll</h2>
        <Slider
          label="Cursor speed"
          value={s.cursorSpeed}
          min={4}
          max={30}
          step={1}
          onChange={(v) => onChangeSettings({ cursorSpeed: v })}
        />
        <Slider
          label="Cursor sensitivity"
          value={s.cursorSensitivity}
          min={0.3}
          max={2.5}
          step={0.1}
          onChange={(v) => onChangeSettings({ cursorSensitivity: v })}
        />
        <Slider
          label="Scroll speed"
          value={s.scrollSpeed}
          min={1}
          max={8}
          step={1}
          onChange={(v) => onChangeSettings({ scrollSpeed: v })}
        />
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2 style={{ fontSize: "18px" }}>Your controls</h2>
        <ControlMappingEditor
          movements={profile.movements}
          mapping={profile.controls}
          onChange={onChangeControls}
        />
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2 style={{ fontSize: "18px" }}>Calibration</h2>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onRecalibrate} style={{ padding: "10px 16px" }}>
            Recalibrate
          </button>
          <button
            onClick={onClearProfile}
            style={{
              padding: "10px 16px",
              color: "#b91c1c",
              border: "1px solid #fca5a5",
              background: "#fff",
              borderRadius: "6px",
            }}
          >
            Delete profile
          </button>
        </div>
      </section>

      <section
        style={{
          marginTop: "28px",
          padding: "16px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
        }}
      >
        <h2 style={{ fontSize: "16px", marginTop: 0 }}>Privacy</h2>
        <p style={{ fontSize: "13px", color: "#475569", margin: 0 }}>
          All processing happens locally on this device. No video, images, or
          facial/hand signals are uploaded, stored remotely, or shared, and there
          are no accounts or analytics. Your profile is saved only on this
          computer and can be deleted at any time.
        </p>
      </section>
    </div>
  );
}
