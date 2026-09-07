// ---------------------------------------------------------------------------
// Assistive Control — adaptive alert (PHASES 11 & 14)
//
// Surfaces control switching to the user:
//   * assisted mode  — shows a proposal with Accept / Keep current
//   * automatic mode — shows a transient note that a switch already happened
// ---------------------------------------------------------------------------

import type { SwitchProposal } from "../calibration/types";

const ROLE_LABELS: Record<string, string> = {
  cursor: "Cursor",
  leftClick: "Left click",
  rightClick: "Right click",
  middleClick: "Middle click",
  scroll: "Scroll",
  confirm: "Confirm",
};

export default function AdaptiveAlert({
  proposal,
  autoNote,
  onAccept,
  onDismiss,
}: {
  proposal: SwitchProposal | null;
  autoNote: string | null;
  onAccept: (proposal: SwitchProposal) => void;
  onDismiss: (proposal: SwitchProposal) => void;
}) {
  if (!proposal && !autoNote) return null;

  if (proposal) {
    const role = ROLE_LABELS[proposal.role] ?? proposal.role;
    return (
      <div
        role="alertdialog"
        aria-label="Control switch suggestion"
        style={{
          border: "1px solid #fca5a5",
          background: "#fef2f2",
          borderRadius: "12px",
          padding: "16px",
        }}
      >
        <strong style={{ color: "#991b1b" }}>
          {role}: a more reliable movement is available
        </strong>
        <p style={{ margin: "8px 0", color: "#7f1d1d", fontSize: "14px" }}>
          {proposal.reason}
        </p>
        <div style={{ fontSize: "13px", color: "#7f1d1d", marginBottom: "12px" }}>
          {proposal.fromMovement} ({proposal.fromReliability}%) →{" "}
          <strong>
            {proposal.toMovement} ({proposal.toReliability}%)
          </strong>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => onAccept(proposal)}
            style={{
              padding: "8px 16px",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Switch to {proposal.toMovement}
          </button>
          <button
            onClick={() => onDismiss(proposal)}
            style={{
              padding: "8px 16px",
              background: "#fff",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Keep current
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        borderRadius: "12px",
        padding: "12px 16px",
        color: "#1e40af",
        fontSize: "14px",
      }}
    >
      {autoNote}
    </div>
  );
}
