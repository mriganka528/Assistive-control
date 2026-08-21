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
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "20px",
        background: "#fff",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <h2 style={{ fontSize: "18px", marginTop: 0 }}>{title}</h2>
      <p style={{ fontSize: "14px", color: "#475569" }}>{body}</p>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          padding: "10px 18px",
          borderRadius: "8px",
          border: primary ? "none" : "1px solid #cbd5e1",
          background: primary ? "#2563eb" : "#fff",
          color: primary ? "#fff" : "#0f172a",
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
          gridTemplateColumns: "1fr 1fr",
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
