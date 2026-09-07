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

  const CURSOR_DIRS: MovementDirection[] = ["left", "right", "up", "down"];
  const discreteRoles: DiscreteRoleName[] = [
    "leftClick",
    "rightClick",
    "middleClick",
    "confirm",
  ];
  const PATTERNS: GesturePattern[] = ["single", "double", "long"];

  // Pattern bookkeeping so one movement can drive several clicks (§8): single ->
  // left, double -> right, long -> middle, etc.
  const discrete: Record<DiscreteRoleName, ControlBinding | null> = {
    leftClick: null,
    rightClick: null,
    middleClick: null,
    confirm: null,
  };
  const patternsUsed = new Map<string, Set<GesturePattern>>();
  const take = (name: string, p: GesturePattern) => {
    let set = patternsUsed.get(name);
    if (!set) {
      set = new Set();
      patternsUsed.set(name, set);
    }
    set.add(p);
  };
  const freePattern = (name: string): GesturePattern | null => {
    const set = patternsUsed.get(name);
    for (const p of PATTERNS) if (!set || !set.has(p)) return p;
    return null;
  };

  const cursor: ControlBinding[] = [];
  const scroll: ControlBinding[] = [];

  // ==========================================================================
  // Allocation priority. The hard requirement is that EVERY function is usable:
  // all four cursor directions, plus left/right/middle click. The tricky part
  // is that a cursor direction needs its OWN movement (it can't share), whereas
  // clicks are cheap — one movement covers up to three via single/double/long.
  // So we:
  //   1. secure ONE movement for clicks (kept aside; it will cover every click
  //      via patterns), so clicks never starve the cursor of movements;
  //   2. fill all four cursor directions — natural direction first, then any
  //      leftover movement, so up/down are never left empty;
  //   3. expand clicks onto their own distinct movements when spares exist
  //      (nicer than triple-tapping one movement);
  //   4. cover any still-empty click by pattern-sharing the reserved movement;
  //   5. give scroll any vertical movement that remains.
  // ==========================================================================

  // Step 1 — reserve one movement for clicks (non-directional preferred, but
  // fall back to the strongest movement of any kind so clicks are always
  // reachable even for a user whose only movements are directional).
  const clickReserve: MovementResult | undefined =
    nonDirectional[0] ?? eligible[0] ?? undefined;
  if (clickReserve) used.add(clickReserve.name);

  // Step 2 — fill all four cursor directions.
  const cursorPending: MovementDirection[] = [];
  for (const dir of CURSOR_DIRS) {
    const m = takeBestWithDirection(directional, dir, used);
    if (m) {
      cursor.push(toBinding("cursor", m, dir));
      used.add(m.name);
    } else {
      cursorPending.push(dir);
    }
  }
  // Backfill empty directions from any leftover movement (strongest first).
  for (const dir of cursorPending) {
    const m = eligible.find((x) => !used.has(x.name));
    if (m) {
      cursor.push(toBinding("cursor", m, dir));
      used.add(m.name);
    }
  }

  // Step 3 — expand clicks onto their own distinct spare movements when any
  // remain free (a dedicated single tap per click is nicer than double/long on
  // one movement). `used` already covers the reserve + every cursor movement,
  // so anything still free here is a genuine spare.
  for (const role of discreteRoles) {
    if (discrete[role]) continue;
    const spare = eligible.find((m) => !used.has(m.name));
    if (!spare) break;
    discrete[role] = toBinding(role, spare, null, "single");
    used.add(spare.name);
    take(spare.name, "single");
  }

  // Step 4 — cover any remaining click by reusing a click movement's spare
  // pattern (single -> double -> long). The reserved movement guarantees this
  // always succeeds when the user has at least one movement at all.
  const clickMovements = (): MovementResult[] => {
    const names = new Set(patternsUsed.keys());
    if (clickReserve) names.add(clickReserve.name);
    return [...nonDirectional, ...directional].filter((m) => names.has(m.name));
  };
  for (const role of discreteRoles) {
    if (discrete[role]) continue;
    for (const m of clickMovements()) {
      const p = freePattern(m.name);
      if (!p) continue;
      discrete[role] = toBinding(role, m, null, p);
      take(m.name, p);
      break;
    }
  }

  // Step 5 — scroll gets whatever vertical directions remain unused.
  for (const dir of ["up", "down"] as MovementDirection[]) {
    const m = takeBestWithDirection(directional, dir, used);
    if (m) {
      scroll.push(toBinding("scroll", m, dir));
      used.add(m.name);
    }
  }

  return {
    cursor,
    leftClick: discrete.leftClick,
    rightClick: discrete.rightClick,
    middleClick: discrete.middleClick,
    scroll,
    confirm: discrete.confirm,
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
  const next: ControlMapping = cloneMapping(mapping);

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
    case "middleClick":
      next.middleClick = toBinding("middleClick", replacement, null);
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
  if (mapping.middleClick) names.add(mapping.middleClick.movementName);
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
  if (mapping.middleClick) {
    const b = mapping.middleClick;
    lines.push(`${b.movementName}${patternSuffix(b.pattern)} -> Middle Click`);
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
  const next: ControlMapping = cloneMapping(mapping);

  switch (role) {
    case "leftClick":
      next.leftClick = toBinding("leftClick", replacement, null);
      break;
    case "rightClick":
      next.rightClick = toBinding("rightClick", replacement, null);
      break;
    case "middleClick":
      next.middleClick = toBinding("middleClick", replacement, null);
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

type DiscreteRoleName =
  | "leftClick"
  | "rightClick"
  | "middleClick"
  | "confirm";

function cloneMapping(mapping: ControlMapping): ControlMapping {
  return {
    cursor: [...mapping.cursor],
    leftClick: mapping.leftClick,
    rightClick: mapping.rightClick,
    middleClick: mapping.middleClick,
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
