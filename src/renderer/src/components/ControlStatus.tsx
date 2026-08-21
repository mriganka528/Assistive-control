// ---------------------------------------------------------------------------
// Assistive Control — live control status panel (PHASE 15)
//
// Purely presentational. Shows the current runtime state, whether control is
// armed/paused, which movement is driving right now, its live signal level,
// and its Control Confidence (never called "accuracy").
// ---------------------------------------------------------------------------

import type { ControlStatus, RuntimeState } from "../calibration/types";

const STATE_META: Record<RuntimeState, { label: string; color: string }> = {
  READY: { label: "Ready (disarmed)", color: "#64748b" },
  ACTIVE: { label: "Active — controlling", color: "#16a34a" },
  PAUSED: { label: "Paused", color: "#d97706" },
  STOPPED: { label: "Emergency stopped", color: "#dc2626" },
  NO_FACE: { label: "Frozen — subject not visible", color: "#dc2626" },
  LOW_CONFIDENCE: { label: "Frozen — low tracking confidence", color: "#d97706" },
};

const ROLE_LABELS: Record<string, string> = {
  cursor: "Cursor",
  leftClick: "Left click",
  rightClick: "Right click",
  scroll: "Scroll",
  confirm: "Confirm",
};

function Bar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        height: "8px",
        background: "#e2e8f0",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
    </div>
  );
}

export default function ControlStatusPanel({ status }: { status: ControlStatus }) {
  const meta = STATE_META[status.state];
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "16px",
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: meta.color,
            display: "inline-block",
          }}
        />
        <strong style={{ color: meta.color }}>{meta.label}</strong>
      </div>

      <div style={{ marginTop: "14px", fontSize: "14px", color: "#334155" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Active control</span>
          <strong>
            {status.activeRole ? ROLE_LABELS[status.activeRole] ?? status.activeRole : "—"}
          </strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
          <span>Movement</span>
          <strong>{status.activeMovement ?? "—"}</strong>
        </div>
      </div>

      <div style={{ marginTop: "14px" }}>
        <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>
          Signal level {status.activeSignal ? `(${status.activeSignal})` : ""}
        </div>
        <Bar value={status.activeSignalValue * 100} color="#3b82f6" />
      </div>

      <div style={{ marginTop: "12px" }}>
        <div
          style={{
            fontSize: "13px",
            color: "#64748b",
            marginBottom: "4px",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Control confidence</span>
          <span>{status.activeReliability}%</span>
        </div>
        <Bar
          value={status.activeReliability}
          color={status.activeReliability >= 60 ? "#16a34a" : status.activeReliability >= 40 ? "#d97706" : "#dc2626"}
        />
      </div>
    </div>
  );
}
