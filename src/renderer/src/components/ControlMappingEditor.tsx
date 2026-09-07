// ---------------------------------------------------------------------------
// Assistive Control — editable control mapping (§22/§26)
//
// Shows the current Movement -> Control assignments and lets the user reassign
// them by hand. This is the manual override the spec requires: the automatic
// mapping is only a starting point, and the user can always choose which of
// THEIR movements drives each control (or clear a control entirely). Directional
// controls (cursor, scroll) are edited per-direction; discrete controls (clicks,
// confirm) also let the user pick the activation pattern (single/double/long)
// so one movement can serve multiple commands (§8).
//
// Every change is lifted to the parent, which rebuilds the runtime mapping and
// persists it to the local profile. Nothing is mutated in place.
// ---------------------------------------------------------------------------

import {
  setDiscreteRole,
  setDirectionalBinding,
} from "../control/movementMapper";
import type {
  ControlMapping,
  MovementResult,
  MovementDirection,
  GesturePattern,
} from "../calibration/types";

type DiscreteRoleName = "leftClick" | "rightClick" | "middleClick" | "confirm";

const DISCRETE_LABELS: Record<DiscreteRoleName, string> = {
  leftClick: "Left click",
  rightClick: "Right click",
  middleClick: "Middle click",
  confirm: "Confirm (Enter)",
};

const PATTERN_LABELS: Record<GesturePattern, string> = {
  single: "Once",
  double: "Twice",
  long: "Hold",
};

export default function ControlMappingEditor({
  movements,
  mapping,
  onChange,
}: {
  movements: MovementResult[];
  mapping: ControlMapping;
  onChange: (mapping: ControlMapping) => void;
}) {
  const byName = (name: string): MovementResult | null =>
    movements.find((m) => m.name === name) ?? null;

  const option = (m: MovementResult) => (
    <option key={m.name} value={m.name}>
      {m.name} ({Math.round(m.score)}%)
    </option>
  );

  const directionalRow = (
    role: "cursor" | "scroll",
    direction: MovementDirection,
    label: string
  ) => {
    const current = mapping[role].find((b) => b.direction === direction) ?? null;
    return (
      <div key={`${role}-${direction}`} style={rowStyle}>
        <span style={labelStyle}>{label}</span>
        <select
          value={current?.movementName ?? ""}
          onChange={(e) =>
            onChange(
              setDirectionalBinding(mapping, role, direction, byName(e.target.value))
            )
          }
          style={selectStyle}
        >
          <option value="">— None —</option>
          {movements.map(option)}
        </select>
      </div>
    );
  };

  const discreteRow = (role: DiscreteRoleName) => {
    const current = mapping[role];
    const pattern: GesturePattern = current?.pattern ?? "single";
    return (
      <div key={role} style={rowStyle}>
        <span style={labelStyle}>{DISCRETE_LABELS[role]}</span>
        <select
          value={current?.movementName ?? ""}
          onChange={(e) =>
            onChange(setDiscreteRole(mapping, role, byName(e.target.value), pattern))
          }
          style={selectStyle}
        >
          <option value="">— None —</option>
          {movements.map(option)}
        </select>
        <select
          value={pattern}
          disabled={!current}
          onChange={(e) =>
            onChange(
              setDiscreteRole(
                mapping,
                role,
                current ? byName(current.movementName) : null,
                e.target.value as GesturePattern
              )
            )
          }
          style={{ ...selectStyle, flex: "0 0 110px" }}
          title="How the movement is performed to trigger this control"
        >
          {(["single", "double", "long"] as GesturePattern[]).map((p) => (
            <option key={p} value={p}>
              {PATTERN_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
    );
  };

  if (movements.length === 0) {
    return (
      <p style={{ fontSize: "14px", color: "#64748b" }}>
        No movements found yet. Calibrate first to create controls you can edit.
      </p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: "14px", color: "#475569", marginTop: 0 }}>
        Assign any of your movements to each control, or set it to “None”. These
        choices override the automatic mapping and are saved on this device.
      </p>

      <h3 style={groupStyle}>Pointer</h3>
      {directionalRow("cursor", "left", "Move left")}
      {directionalRow("cursor", "right", "Move right")}
      {directionalRow("cursor", "up", "Move up")}
      {directionalRow("cursor", "down", "Move down")}

      <h3 style={groupStyle}>Scroll</h3>
      {directionalRow("scroll", "up", "Scroll up")}
      {directionalRow("scroll", "down", "Scroll down")}

      <h3 style={groupStyle}>Clicks & confirm</h3>
      {discreteRow("leftClick")}
      {discreteRow("rightClick")}
      {discreteRow("middleClick")}
      {discreteRow("confirm")}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginBottom: "8px",
};

const labelStyle: React.CSSProperties = {
  flex: "0 0 120px",
  fontSize: "14px",
  color: "#0f172a",
};

const selectStyle: React.CSSProperties = {
  flex: "1 1 auto",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  fontSize: "14px",
  minHeight: "40px",
};

const groupStyle: React.CSSProperties = {
  fontSize: "15px",
  margin: "18px 0 8px",
};
