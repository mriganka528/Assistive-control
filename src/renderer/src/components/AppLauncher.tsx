// ---------------------------------------------------------------------------
// Assistive Control — app launcher panel (§14)
//
// Big, high-contrast buttons that open everyday apps (browser, notepad,
// calculator, code editor, files). Targets are deliberately large so they're
// easy to hit with movement-driven cursor control. Launch outcomes are shown
// inline and cleared after a moment. The catalog is provided by the main
// process; unavailable apps are shown disabled rather than hidden, so the set
// of options stays stable and predictable.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { getApps } from "../control/appsBridge";
import type { LaunchableApp } from "../../../shared/ipc";

export default function AppLauncher() {
  const [apps, setApps] = useState<LaunchableApp[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getApps()
      .list()
      .then((list) => {
        if (!cancelled) setApps(list);
      });
    return () => {
      cancelled = true;
      if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    };
  }, []);

  const flash = (message: string) => {
    setNote(message);
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 3500);
  };

  const launch = async (app: LaunchableApp) => {
    if (busy) return;
    setBusy(app.id);
    try {
      const result = await getApps().launch(app.id);
      flash(result.message);
    } catch {
      flash(`Couldn't open ${app.label}.`);
    } finally {
      setBusy(null);
    }
  };

  if (apps.length === 0) return null;

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "16px",
        background: "#fff",
      }}
    >
      <h3 style={{ marginTop: 0, fontSize: "15px" }}>Open an app</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
        }}
      >
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => launch(app)}
            disabled={!app.available || busy !== null}
            title={
              app.available
                ? `Open ${app.label}`
                : `${app.label} isn't available on this system`
            }
            style={{
              padding: "16px 12px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              background: app.available ? "#f8fafc" : "#f1f5f9",
              color: app.available ? "#0f172a" : "#94a3b8",
              fontSize: "15px",
              fontWeight: 600,
              cursor: app.available && !busy ? "pointer" : "not-allowed",
              minHeight: "56px",
            }}
          >
            {busy === app.id ? "Opening…" : app.label}
          </button>
        ))}
      </div>
      {note && (
        <div
          role="status"
          aria-live="polite"
          style={{ marginTop: "10px", fontSize: "13px", color: "#475569" }}
        >
          {note}
        </div>
      )}
    </div>
  );
}
