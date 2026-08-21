// ---------------------------------------------------------------------------
// Assistive Control — adaptive switching manager (PHASE 11)
//
// Decides what to do when a control's movement degrades:
//   * assisted   (default) — surface a SwitchProposal for the user to accept
//   * automatic            — apply the remap immediately and report it
//
// It walks the current mapping, asks the reliability monitor which bound
// movements are sustainedly degraded, finds a better alternative, and (subject
// to a per-role cooldown and a minimum-improvement margin) emits decisions.
// Applying a proposal reuses the mapper's precise per-binding replacement so a
// single degraded direction is healed without disturbing the rest.
// ---------------------------------------------------------------------------

import type {
  ControlBinding,
  ControlMapping,
  ControlRole,
  MovementResult,
  SwitchingMode,
  SwitchProposal,
} from "../calibration/types";
import { ReliabilityMonitor } from "./reliabilityMonitor";
import { findAlternative } from "./alternativeSelector";
import {
  assignedMovements,
  replaceRoleBinding,
} from "../control/movementMapper";

export type SwitchDecision =
  | { kind: "propose"; proposal: SwitchProposal }
  | { kind: "auto"; proposal: SwitchProposal; mapping: ControlMapping };

export type SwitchingConfig = {
  /** alternative must beat the current live reliability by at least this. */
  minImprovement: number;
  /** minimum gap between actions on the same role+movement (ms). */
  proposalCooldownMs: number;
};

export const DEFAULT_SWITCHING_CONFIG: SwitchingConfig = {
  minImprovement: 10,
  proposalCooldownMs: 8000,
};

export type EvaluateParams = {
  now: number;
  mapping: ControlMapping;
  movements: MovementResult[];
  monitor: ReliabilityMonitor;
  /** live reliability per movement (defaults to calibrated score if absent). */
  liveHealth?: Map<string, number>;
};

type RoleBinding = { role: ControlRole; binding: ControlBinding };

function collectBindings(mapping: ControlMapping): RoleBinding[] {
  const out: RoleBinding[] = [];
  for (const b of mapping.cursor) out.push({ role: "cursor", binding: b });
  for (const b of mapping.scroll) out.push({ role: "scroll", binding: b });
  if (mapping.leftClick) out.push({ role: "leftClick", binding: mapping.leftClick });
  if (mapping.rightClick) out.push({ role: "rightClick", binding: mapping.rightClick });
  if (mapping.confirm) out.push({ role: "confirm", binding: mapping.confirm });
  return out;
}

export class SwitchingManager {
  private mode: SwitchingMode;
  private cfg: SwitchingConfig;
  private lastActionAt = new Map<string, number>();

  constructor(
    mode: SwitchingMode = "assisted",
    cfg: SwitchingConfig = DEFAULT_SWITCHING_CONFIG
  ) {
    this.mode = mode;
    this.cfg = cfg;
  }

  setMode(mode: SwitchingMode): void {
    this.mode = mode;
  }

  getMode(): SwitchingMode {
    return this.mode;
  }

  setConfig(patch: Partial<SwitchingConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  /** Clear the cooldown memory (e.g. after a recalibration). */
  reset(): void {
    this.lastActionAt.clear();
  }

  private liveScore(
    name: string,
    liveHealth: Map<string, number> | undefined,
    fallback: number
  ): number {
    const v = liveHealth?.get(name);
    return typeof v === "number" ? v : fallback;
  }

  /**
   * Evaluate the mapping and return switching decisions. In automatic mode the
   * returned `mapping` on each "auto" decision is already updated (and decisions
   * compose across multiple degraded bindings in one pass).
   */
  evaluate(params: EvaluateParams): SwitchDecision[] {
    const { now, movements, monitor, liveHealth } = params;
    let working = params.mapping;
    const decisions: SwitchDecision[] = [];

    for (const { role, binding } of collectBindings(params.mapping)) {
      const name = binding.movementName;
      if (!monitor.isDegraded(name, now)) continue;

      const currentScore = this.liveScore(name, liveHealth, binding.reliability);

      const exclude = assignedMovements(working);
      const alt = findAlternative({
        role,
        direction: binding.direction,
        movements,
        excludeNames: exclude,
        liveHealth,
      });
      if (!alt) continue;

      const altScore = this.liveScore(alt.name, liveHealth, alt.score);
      if (altScore < currentScore + this.cfg.minImprovement) continue;

      const key = `${role}:${name}`;
      const last = this.lastActionAt.get(key) ?? Number.NEGATIVE_INFINITY;
      if (now - last < this.cfg.proposalCooldownMs) continue;
      this.lastActionAt.set(key, now);

      const proposal: SwitchProposal = {
        role,
        fromMovement: name,
        toMovement: alt.name,
        fromReliability: Math.round(currentScore),
        toReliability: Math.round(altScore),
        reason: `${name} control confidence dropped to ${Math.round(
          currentScore
        )}. ${alt.name} is more reliable right now (${Math.round(altScore)}).`,
      };

      if (this.mode === "automatic") {
        working = replaceRoleBinding(working, role, name, alt);
        decisions.push({ kind: "auto", proposal, mapping: working });
      } else {
        decisions.push({ kind: "propose", proposal });
      }
    }

    return decisions;
  }

  /** Apply an accepted proposal (assisted mode) to produce a new mapping. */
  apply(
    mapping: ControlMapping,
    proposal: SwitchProposal,
    movements: MovementResult[]
  ): ControlMapping {
    const replacement = movements.find((m) => m.name === proposal.toMovement);
    if (!replacement) return mapping;
    return replaceRoleBinding(
      mapping,
      proposal.role,
      proposal.fromMovement,
      replacement
    );
  }
}
