// ---------------------------------------------------------------------------
// Assistive Control — personalized control mapping
//
// Turns ranked movement results into a conflict-free control mapping driven by
// whatever movements the user actually has (never hard-coded gestures):
//
//   * strongest non-directional movements -> left click / right click / confirm
//   * horizontal directional movements     -> cursor (X)
//   * vertical directional movements        -> scroll (Y)  (cursor falls back
//                                              to vertical only if it got none)
//
// A movement is assigned to at most one role, so one gesture never drives two
// conflicting actions.
// ---------------------------------------------------------------------------

import type {
  MovementResult,
  MovementDirection,
  ControlBinding,
  ControlMapping,
  ControlRole,
  GesturePattern,
} from "../calibration/types";

/** Minimum reliability for a movement to be eligible for any control. */
export const MIN_MAP_SCORE = 25;

function toBinding(
  role: ControlRole,
  movement: MovementResult,
  direction: MovementDirection | null,
  pattern: GesturePattern = "single"
): ControlBinding {
  return {
    role,
    movementName: movement.name,
    signal: movement.bestSignal,
    direction,
    activationThreshold: movement.activationThreshold,
    releaseThreshold: movement.releaseThreshold,
    increases: movement.increases,
    reliability: movement.score,
    pattern,
  };
}

function takeBestWithDirection(
  pool: MovementResult[],
  direction: MovementDirection,
  used: Set<string>
): MovementResult | null {
  for (const m of pool) {
    if (!used.has(m.name) && m.direction === direction) return m;
  }
  return null;
}

/**
 * Build a personalized control mapping from ranked movement results.
 * `movements` may be in any order; it is sorted by reliability internally.
 *
 * Discrete actions (left/right click, confirm) prefer DISTINCT movements, but
 * when the user doesn't have enough of them, the strongest discrete movement is
 * reused via multi-stage patterns (§8): single -> left click, double -> right
 * click, long -> confirm. This guarantees a usable click even for someone with
 * a single reliable movement, without ever hard-coding which movement that is.
 */
export function buildControlMapping(
  movements: MovementResult[]
): ControlMapping {
  const eligible = movements
    .filter((m) => m.score >= MIN_MAP_SCORE)
    .sort((a, b) => b.score - a.score);

  const directional = eligible.filter((m) => m.isDirectional && m.direction);
  const nonDirectional = eligible.filter((m) => !m.isDirectional);

  const used = new Set<string>();

  // --- Discrete actions from non-directional movements ----------------------
  const strongest = nonDirectional[0] ?? null;
  const second = nonDirectional[1] ?? null;
  const third = nonDirectional[2] ?? null;

  let leftClick: ControlBinding | null = null;
  let rightClick: ControlBinding | null = null;
  let confirm: ControlBinding | null = null;

  if (strongest) {
    leftClick = toBinding("leftClick", strongest, null, "single");
    used.add(strongest.name);
  }

  if (second) {
    rightClick = toBinding("rightClick", second, null, "single");
    used.add(second.name);
  } else if (strongest) {
    // Reuse the strongest movement: a double activation = right click.
    rightClick = toBinding("rightClick", strongest, null, "double");
  }

  if (third) {
    confirm = toBinding("confirm", third, null, "single");
    used.add(third.name);
  } else if (strongest) {
    // Reuse the strongest movement: a long activation = confirm.
    confirm = toBinding("confirm", strongest, null, "long");
  }

  // --- Cursor gets horizontal directions first -----------------------------
  const cursor: ControlBinding[] = [];
  for (const dir of ["left", "right"] as MovementDirection[]) {
    const m = takeBestWithDirection(directional, dir, used);
    if (m) {
      cursor.push(toBinding("cursor", m, dir));
      used.add(m.name);
    }
  }

  // --- Scroll gets vertical directions --------------------------------------
  const scroll: ControlBinding[] = [];
  for (const dir of ["up", "down"] as MovementDirection[]) {
    const m = takeBestWithDirection(directional, dir, used);
    if (m) {
      scroll.push(toBinding("scroll", m, dir));
      used.add(m.name);
    }
  }

  // --- Fallback: if cursor got nothing, let it use vertical movements -------
  if (cursor.length === 0) {
    for (const dir of ["up", "down"] as MovementDirection[]) {
      const m = takeBestWithDirection(directional, dir, used);
      if (m) {
        cursor.push(toBinding("cursor", m, dir));
        used.add(m.name);
      }
    }
  }

  return {
    cursor,
    leftClick,
    rightClick,
    scroll,
    confirm,
  };
}

/** Build a control binding from a movement (exported for the switching layer). */
export function bindingFromMovement(
  role: ControlRole,
  movement: MovementResult,
  direction: MovementDirection | null
): ControlBinding {
  return toBinding(role, movement, direction);
}

/**
 * Replace only the binding(s) driven by `targetMovementName` within a role,
 * preserving each binding's direction. For single-binding roles (clicks /
 * confirm) it replaces the role's binding. Returns a new mapping. Used by the
 * adaptive switching manager to heal one degraded direction without disturbing
 * the rest of the mapping.
 */
export function replaceRoleBinding(
  mapping: ControlMapping,
  role: ControlRole,
  targetMovementName: string,
  replacement: MovementResult
): ControlMapping {
  const next: ControlMapping = {
    cursor: [...mapping.cursor],
    leftClick: mapping.leftClick,
    rightClick: mapping.rightClick,
    scroll: [...mapping.scroll],
    confirm: mapping.confirm,
  };

  switch (role) {
    case "cursor":
      next.cursor = mapping.cursor.map((b) =>
        b.movementName === targetMovementName
          ? toBinding("cursor", replacement, b.direction)
          : b
      );
      break;
    case "scroll":
      next.scroll = mapping.scroll.map((b) =>
        b.movementName === targetMovementName
          ? toBinding("scroll", replacement, b.direction)
          : b
      );
      break;
    case "leftClick":
      next.leftClick = toBinding("leftClick", replacement, null);
      break;
    case "rightClick":
      next.rightClick = toBinding("rightClick", replacement, null);
      break;
    case "confirm":
      next.confirm = toBinding("confirm", replacement, null);
      break;
  }
  return next;
}

/** All movement names currently assigned to any role. */
export function assignedMovements(mapping: ControlMapping): Set<string> {
  const names = new Set<string>();
  for (const b of mapping.cursor) names.add(b.movementName);
  for (const b of mapping.scroll) names.add(b.movementName);
  if (mapping.leftClick) names.add(mapping.leftClick.movementName);
  if (mapping.rightClick) names.add(mapping.rightClick.movementName);
  if (mapping.confirm) names.add(mapping.confirm.movementName);
  return names;
}

/** How a multi-stage pattern reads to the user (single needs no annotation). */
function patternSuffix(pattern: GesturePattern | undefined): string {
  switch (pattern) {
    case "double":
      return " (twice)";
    case "long":
      return " (hold)";
    default:
      return "";
  }
}

/** Human-readable "Movement -> Role" lines for the UI. */
export function describeMapping(mapping: ControlMapping): string[] {
  const lines: string[] = [];
  for (const b of mapping.cursor) {
    lines.push(`${b.movementName} -> Cursor ${b.direction ?? ""}`.trim());
  }
  if (mapping.leftClick) {
    const b = mapping.leftClick;
    lines.push(`${b.movementName}${patternSuffix(b.pattern)} -> Left Click`);
  }
  if (mapping.rightClick) {
    const b = mapping.rightClick;
    lines.push(`${b.movementName}${patternSuffix(b.pattern)} -> Right Click`);
  }
  for (const b of mapping.scroll) {
    lines.push(`${b.movementName} -> Scroll ${b.direction ?? ""}`.trim());
  }
  if (mapping.confirm) {
    const b = mapping.confirm;
    lines.push(`${b.movementName}${patternSuffix(b.pattern)} -> Confirm`);
  }
  return lines;
}

/**
 * Swap the movement currently bound to a role for another movement
 * (used by the adaptive switching manager). Returns a new mapping.
 */
export function remapRole(
  mapping: ControlMapping,
  role: ControlRole,
  replacement: MovementResult
): ControlMapping {
  const next: ControlMapping = {
    cursor: [...mapping.cursor],
    leftClick: mapping.leftClick,
    rightClick: mapping.rightClick,
    scroll: [...mapping.scroll],
    confirm: mapping.confirm,
  };

  switch (role) {
    case "leftClick":
      next.leftClick = toBinding("leftClick", replacement, null);
      break;
    case "rightClick":
      next.rightClick = toBinding("rightClick", replacement, null);
      break;
    case "confirm":
      next.confirm = toBinding("confirm", replacement, null);
      break;
    case "cursor":
      next.cursor = mapping.cursor.map((b) =>
        toBinding("cursor", replacement, b.direction)
      );
      break;
    case "scroll":
      next.scroll = mapping.scroll.map((b) =>
        toBinding("scroll", replacement, b.direction)
      );
      break;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Manual editing (§22/§26) — the user can always override the auto-mapping.
// These return a NEW mapping so callers can persist it. They never mutate.
// ---------------------------------------------------------------------------

type DiscreteRoleName = "leftClick" | "rightClick" | "confirm";

function cloneMapping(mapping: ControlMapping): ControlMapping {
  return {
    cursor: [...mapping.cursor],
    leftClick: mapping.leftClick,
    rightClick: mapping.rightClick,
    scroll: [...mapping.scroll],
    confirm: mapping.confirm,
  };
}

/**
 * Set (or clear, when `movement` is null) the movement + pattern driving a
 * discrete role. Used by the mapping editor.
 */
export function setDiscreteRole(
  mapping: ControlMapping,
  role: DiscreteRoleName,
  movement: MovementResult | null,
  pattern: GesturePattern = "single"
): ControlMapping {
  const next = cloneMapping(mapping);
  next[role] = movement ? toBinding(role, movement, null, pattern) : null;
  return next;
}

/**
 * Set (or clear) the movement driving ONE direction of a directional role
 * (cursor / scroll). Upserts the binding for that direction; passing null
 * removes it. Used by the mapping editor.
 */
export function setDirectionalBinding(
  mapping: ControlMapping,
  role: "cursor" | "scroll",
  direction: MovementDirection,
  movement: MovementResult | null
): ControlMapping {
  const next = cloneMapping(mapping);
  const list = next[role].filter((b) => b.direction !== direction);
  if (movement) list.push(toBinding(role, movement, direction));
  next[role] = list;
  return next;
}
