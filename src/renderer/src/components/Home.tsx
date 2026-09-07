// ---------------------------------------------------------------------------
// Assistive Control — home screen (PHASE 14)
// ---------------------------------------------------------------------------

import InputModeBanner from "./InputModeBanner";

function Card({
  title,
  body,
  action,
  onClick,
  primary,
  disabled,
}: {
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "20px",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <h2 style={{ fontSize: "1.125rem", marginTop: 0 }}>{title}</h2>
      <p style={{ fontSize: "0.9rem", color: "var(--text-soft)", flex: 1 }}>
        {body}
      </p>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          alignSelf: "flex-start",
          padding: "10px 18px",
          borderRadius: "var(--radius-sm)",
          border: primary ? "none" : "1px solid var(--border)",
          background: primary ? "var(--primary)" : "var(--surface)",
          color: primary ? "#fff" : "var(--text)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {action}
      </button>
    </div>
  );
}

export default function Home({
  hasProfile,
  updatedAt,
  onCalibrate,
  onStartControl,
  onSettings,
}: {
  hasProfile: boolean;
  updatedAt: string | null;
  onCalibrate: () => void;
  onStartControl: () => void;
  onSettings: () => void;
}) {
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "32px 24px" }}>
      <h1 style={{ marginBottom: "4px" }}>Assistive Control</h1>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Control your computer using whatever movements work best for you. The app
        learns your strongest, most reliable movements and adapts as they change.
      </p>

      <div style={{ marginTop: "20px" }}>
        <InputModeBanner />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "16px",
          marginTop: "24px",
        }}
      >
        <Card
          title="Start control"
          body={
            hasProfile
              ? "Begin controlling with your saved profile. A quick check adapts it to today's conditions."
              : "Calibrate first to create your personalized profile."
          }
          action="Start"
          primary
          disabled={!hasProfile}
          onClick={onStartControl}
        />
        <Card
          title={hasProfile ? "Recalibrate" : "Calibrate"}
          body="Measure your resting baseline, then test movements to find the most reliable control signals."
          action={hasProfile ? "Recalibrate" : "Calibrate"}
          onClick={onCalibrate}
        />
      </div>

      <div style={{ marginTop: "16px" }}>
        <Card
          title="Settings"
          body="Switching mode, cursor and scroll tuning, and privacy."
          action="Open settings"
          onClick={onSettings}
        />
      </div>

      <p style={{ marginTop: "20px", fontSize: "13px", color: "#64748b" }}>
        {hasProfile
          ? `Saved profile last updated ${updatedAt ? new Date(updatedAt).toLocaleString() : "recently"}.`
          : "No profile yet."}{" "}
        Everything runs locally on this device — nothing is uploaded.
      </p>
    </div>
  );
}
