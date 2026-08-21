// ---------------------------------------------------------------------------
// Assistive Control — alternative movement selection (PHASE 11 support)
//
// When a control degrades, find the best available movement to take it over.
// Selection is movement-agnostic: it respects only the role's directionality
// (a directional binding needs a same-direction movement; a click/confirm
// prefers a non-directional movement) and prefers whichever candidate has the
// best LIVE reliability, falling back to the calibrated score.
// ---------------------------------------------------------------------------

import type {
  ControlRole,
  MovementDirection,
  MovementResult,
} from "../calibration/types";
import { MIN_MAP_SCORE } from "../control/movementMapper";

export type AlternativeQuery = {
  role: ControlRole;
  /** direction the replacement must satisfy (for cursor/scroll bindings). */
  direction: MovementDirection | null;
  movements: MovementResult[];
  /** movement names to skip (already assigned elsewhere, incl. the degraded one). */
  excludeNames: Set<string>;
  /** minimum eligibility score. */
  minScore?: number;
  /** optional live reliability per movement to prefer healthier candidates. */
  liveHealth?: Map<string, number>;
};

function rank(m: MovementResult, liveHealth?: Map<string, number>): number {
  const live = liveHealth?.get(m.name);
  return typeof live === "number" ? live : m.score;
}

/**
 * Find the best alternative movement for a role/direction, or null if none
 * qualifies. Directional roles require a matching direction; non-directional
 * roles prefer non-directional movements but will accept a directional one as a
 * fallback (its signal can still drive a discrete action).
 */
export function findAlternative(q: AlternativeQuery): MovementResult | null {
  const min = q.minScore ?? MIN_MAP_SCORE;
  const pool = q.movements.filter(
    (m) => !q.excludeNames.has(m.name) && m.score >= min
  );

  const wantDirectional = q.role === "cursor" || q.role === "scroll";

  if (wantDirectional || q.direction) {
    const dir = q.direction;
    const matches = pool.filter(
      (m) => m.isDirectional && m.direction === dir
    );
    return best(matches, q.liveHealth);
  }

  // Non-directional role: prefer non-directional movements first.
  const nonDir = pool.filter((m) => !m.isDirectional);
  const chosen = best(nonDir, q.liveHealth);
  if (chosen) return chosen;
  return best(pool, q.liveHealth);
}

function best(
  pool: MovementResult[],
  liveHealth?: Map<string, number>
): MovementResult | null {
  let winner: MovementResult | null = null;
  let winnerRank = -Infinity;
  for (const m of pool) {
    const r = rank(m, liveHealth);
    if (r > winnerRank) {
      winner = m;
      winnerRank = r;
    }
  }
  return winner;
}
