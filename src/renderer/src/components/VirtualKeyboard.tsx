// ---------------------------------------------------------------------------
// Assistive Control — on-screen virtual keyboard (§13)
//
// A full on-screen keyboard operated by WHATEVER controls the user has: it is
// just a grid of large DOM buttons driven by the movement-controlled cursor and
// click. It is NOT tied to eye control (or any specific movement) — the spec
// explicitly forbids hard-coding eye control here.
//
// Every key emits a REAL OS key event through the input bridge (nut.js in the
// main process), never a console simulation. Printable characters are sent via
// typeText; editing/navigation keys (backspace, enter, tab, escape, arrows) via
// keyPress. A local preview mirrors what was typed so there is clear feedback
// even before focus is placed in an external app.
//
// Layout has two modes — letters (with Shift for uppercase) and symbols/numbers
// — plus space, backspace, enter, tab, escape and the four arrow keys.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { getInput } from "../control/inputBridge";

type KeyMode = "letters" | "symbols";

const LETTER_ROWS: string[][] = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

const SYMBOL_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["!", "@", "#", "$", "%", "&", "*", "(", ")"],
  ["-", "_", "=", "+", "/", ":", ";", "?"],
  [".", ",", "'", '"', "\\", "|", "~", "`"],
];

// Non-printable keys map to input-bridge keyPress names.
const SPECIAL = {
  backspace: "backspace",
  enter: "enter",
  tab: "tab",
  escape: "escape",
  up: "up",
  down: "down",
  left: "left",
  right: "right",
} as const;

export default function VirtualKeyboard({ onClose }: { onClose?: () => void }) {
  const [mode, setMode] = useState<KeyMode>("letters");
  const [shift, setShift] = useState(false);
  const [preview, setPreview] = useState("");

  const input = getInput();

  const typeChar = (raw: string) => {
    const ch = mode === "letters" && shift ? raw.toUpperCase() : raw;
    void input.typeText(ch);
    setPreview((p) => p + ch);
  };

  const space = () => {
    void input.typeText(" ");
    setPreview((p) => p + " ");
  };

  const special = (name: keyof typeof SPECIAL) => {
    void input.keyPress(SPECIAL[name]);
    if (name === "backspace") setPreview((p) => p.slice(0, -1));
    else if (name === "enter") setPreview((p) => p + "\n");
    else if (name === "tab") setPreview((p) => p + "\t");
    // arrows / escape don't change the local preview
  };

  const rows = mode === "letters" ? LETTER_ROWS : SYMBOL_ROWS;

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "16px",
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "15px" }}>On-screen keyboard</h3>
        {onClose && (
          <button onClick={onClose} style={keyStyle(false, "auto")}>
            Hide
          </button>
        )}
      </div>

      <textarea
        value={preview}
        readOnly
        aria-label="Typed text preview"
        placeholder="Typed keys appear here. Keystrokes are also sent to the system."
        style={{
          width: "100%",
          minHeight: "56px",
          resize: "vertical",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          padding: "8px 10px",
          fontSize: "15px",
          marginBottom: "12px",
          fontFamily: "inherit",
        }}
      />

      {rows.map((row, i) => (
        <div key={i} style={rowStyle}>
          {row.map((k) => (
            <button key={k} onClick={() => typeChar(k)} style={keyStyle(false)}>
              {mode === "letters" && shift ? k.toUpperCase() : k}
            </button>
          ))}
        </div>
      ))}

      {/* Modifier / mode row */}
      <div style={rowStyle}>
        <button
          onClick={() => setShift((s) => !s)}
          aria-pressed={shift}
          style={keyStyle(shift, 1.6)}
        >
          ⇧ Shift
        </button>
        <button
          onClick={() => setMode((m) => (m === "letters" ? "symbols" : "letters"))}
          style={keyStyle(false, 1.6)}
        >
          {mode === "letters" ? "123 #" : "ABC"}
        </button>
        <button onClick={space} style={keyStyle(false, 4)}>
          Space
        </button>
        <button onClick={() => special("backspace")} style={keyStyle(false, 2)}>
          ⌫ Back
        </button>
      </div>

      {/* Editing / navigation row */}
      <div style={rowStyle}>
        <button onClick={() => special("enter")} style={keyStyle(false, 2)}>
          ⏎ Enter
        </button>
        <button onClick={() => special("tab")} style={keyStyle(false)}>
          Tab
        </button>
        <button onClick={() => special("escape")} style={keyStyle(false)}>
          Esc
        </button>
        <button onClick={() => special("left")} style={keyStyle(false)} aria-label="Left arrow">
          ←
        </button>
        <button onClick={() => special("up")} style={keyStyle(false)} aria-label="Up arrow">
          ↑
        </button>
        <button onClick={() => special("down")} style={keyStyle(false)} aria-label="Down arrow">
          ↓
        </button>
        <button onClick={() => special("right")} style={keyStyle(false)} aria-label="Right arrow">
          →
        </button>
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: "6px",
  marginBottom: "6px",
  flexWrap: "wrap",
};

/** Large, high-contrast key. `grow` widens special keys; keeps big hit targets. */
function keyStyle(active: boolean, grow: number | "auto" = 1): React.CSSProperties {
  return {
    flex: grow === "auto" ? "0 0 auto" : `${grow} 1 0`,
    minWidth: "40px",
    minHeight: "48px",
    borderRadius: "8px",
    border: active ? "2px solid #2563eb" : "1px solid #cbd5e1",
    background: active ? "#dbeafe" : "#f8fafc",
    color: "#0f172a",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
  };
}
