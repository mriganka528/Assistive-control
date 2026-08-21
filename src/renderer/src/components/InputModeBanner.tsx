// ---------------------------------------------------------------------------
// Assistive Control — REAL vs SIMULATION input banner (§9 / §24)
//
// The spec forbids a "simulation-only" final mode and forbids declaring the
// project done while actions are merely logged. This banner makes the current
// mode UNMISTAKABLE: a calm green confirmation when real OS control is active,
// or a loud amber/red warning (with the exact fix) when the app is only
// simulating input. It queries the main process once on mount; the nut.js load
// result can't change without an app restart, but a Recheck button is offered
// so the user can re-query after installing the module.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { getInput } from "../control/inputBridge";
import type { InputDiagnostics } from "../../../shared/ipc";

export default function InputModeBanner() {
  const [diag, setDiag] = useState<InputDiagnostics | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = async () => {
    setChecking(true);
    try {
      const d = await getInput().inputDiagnostics();
      setDiag(d);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (!diag) return null;

  const palette = diag.real
    ? { bg: "#dcfce7", border: "#16a34a", fg: "#14532d", dot: "#16a34a" }
    : diag.status === "load-error"
      ? { bg: "#fee2e2", border: "#dc2626", fg: "#7f1d1d", dot: "#dc2626" }
      : { bg: "#fef3c7", border: "#d97706", fg: "#78350f", dot: "#d97706" };

  const title = diag.real ? "REAL CONTROL ACTIVE" : "SIMULATION MODE";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        border: `2px solid ${palette.border}`,
        background: palette.bg,
        color: palette.fg,
        borderRadius: "12px",
        padding: "14px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "14px",
          height: "14px",
          borderRadius: "50%",
          background: palette.dot,
          marginTop: "4px",
          flex: "0 0 auto",
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "0.02em" }}>
          {title}
        </div>
        <div style={{ fontSize: "13px", marginTop: "3px" }}>{diag.message}</div>
        {!diag.real && diag.hint && (
          <div
            style={{
              fontSize: "12.5px",
              marginTop: "8px",
              padding: "8px 10px",
              background: "rgba(255,255,255,0.55)",
              borderRadius: "8px",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              whiteSpace: "pre-wrap",
            }}
          >
            {diag.hint}
          </div>
        )}
      </div>
      {!diag.real && (
        <button
          onClick={refresh}
          disabled={checking}
          style={{
            flex: "0 0 auto",
            padding: "8px 12px",
            borderRadius: "8px",
            border: `1px solid ${palette.border}`,
            background: "#fff",
            color: palette.fg,
            cursor: checking ? "default" : "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {checking ? "Checking…" : "Recheck"}
        </button>
      )}
    </div>
  );
}
