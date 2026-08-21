// ---------------------------------------------------------------------------
// Assistive Control — human-friendly movement labels + discovery finalization
//
// Calibration discovers movements GENERICALLY: the user simply performs "a
// movement they can control reliably" several times, and the analyzer decides
// which signal channel it actually is. This module converts the analyzer's
// technical channel (e.g. "mouthSmileLeft", "eyeLookInLeft", "handFist") into a
// plain-language label the user sees ("Smile", "Look left", "Make a fist"), so
// nobody ever needs to know MediaPipe channel names (spec §1/§2).
//
// It also finalizes a batch of discovered movements: two discovery slots that
// turn out to be the SAME control (same friendly label) are merged, keeping the
// stronger result and pooling their samples for better statistics.
// ---------------------------------------------------------------------------

import type {
  MovementResult,
  MovementDirection,
  SignalSample,
} from "./types";

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** Which side of the face a channel refers to, if any ("left" | "right" | ""). */
function side(channel: string): "left" | "right" | "" {
  const c = channel.toLowerCase();
  if (c.includes("left")) return "left";
  if (c.includes("right")) return "right";
  return "";
}

const FINGER_NAMES: Record<string, string> = {
  thumb: "Thumb",
  index: "Index finger",
  middle: "Middle finger",
  ring: "Ring finger",
  pinky: "Little finger",
};

function fingerLabel(channel: string, increases: boolean): string | null {
  const c = channel.toLowerCase();
  for (const key of Object.keys(FINGER_NAMES)) {
    if (c.includes(key)) {
      const action = increases ? "bend" : "straighten";
      return `${FINGER_NAMES[key]} ${action}`;
    }
  }
  return null;
}

/**
 * A plain-language name for a discovered movement, derived from its chosen
 * signal, direction and whether it drives the signal up or down. Never exposes
 * raw channel names to the user.
 */
export function describeMovement(result: MovementResult): string {
  const c = result.bestSignal.toLowerCase();
  const dir = result.direction;
  const up = result.increases;
  const sd = side(result.bestSignal);

  switch (result.family) {
    case "eye-blink":
      return sd ? `${cap(sd)}-eye blink` : "Blink";

    case "eye-look":
      return dir ? `Look ${dir}` : "Eye movement";

    case "brow":
      if (/browdown/.test(c)) return "Lower eyebrows";
      if (/brow/.test(c)) return "Raise eyebrows";
      return "Eyebrow movement";

    case "mouth":
      if (/mouthsmile/.test(c)) return "Smile";
      if (/mouthfrown/.test(c)) return "Frown";
      if (/mouthpucker|mouthfunnel/.test(c)) return "Pucker lips";
      if (/mouthleft/.test(c)) return "Mouth to the left";
      if (/mouthright/.test(c)) return "Mouth to the right";
      if (/mouthclose/.test(c)) return "Close lips";
      if (/mouthstretch|mouthdimple/.test(c)) return "Stretch mouth";
      if (/nosesneer/.test(c)) return "Scrunch nose";
      return "Mouth movement";

    case "cheek":
      if (/cheekpuff/.test(c)) return "Puff cheeks";
      if (/cheeksquint/.test(c))
        return sd ? `${cap(sd)} cheek raise` : "Cheek raise";
      return "Cheek movement";

    case "jaw":
      if (/jawopen/.test(c)) return "Open mouth";
      if (/jawleft/.test(c)) return "Jaw to the left";
      if (/jawright/.test(c)) return "Jaw to the right";
      if (/jawforward/.test(c)) return "Jaw forward";
      return "Jaw movement";

    case "head":
      return dir ? `Head ${dir}` : "Head movement";

    case "hand": {
      const finger = fingerLabel(c, up);
      if (/pinch/.test(c)) {
        if (/index/.test(c)) return "Pinch (index finger)";
        if (/middle/.test(c)) return "Pinch (middle finger)";
        return "Pinch";
      }
      if (/handopenness/.test(c)) return up ? "Open hand" : "Close hand";
      if (/handfist/.test(c)) return up ? "Make a fist" : "Open hand";
      if (/handposx|handposy/.test(c))
        return dir ? `Move hand ${dir}` : "Move hand";
      if (finger) return finger;
      return "Hand movement";
    }

    case "generic":
    default:
      return dir ? `${cap(dir)} movement` : "Custom movement";
  }
}

/**
 * Turn the analyzer's raw results (keyed by temporary "Movement N" names) into
 * final, user-facing movements. Discovery slots that resolve to the same
 * friendly label are merged: the higher-scoring result is kept and both slots'
 * samples are pooled (more data → better baseline/threshold statistics).
 *
 * @param raw       Results from analyzeMovements, named by their temp slot key.
 * @param collected The temp-keyed samples that were analyzed.
 * @returns movements renamed to friendly labels + samples re-keyed to match.
 */
export function finalizeDiscovery(
  raw: MovementResult[],
  collected: Record<string, SignalSample[]>
): { movements: MovementResult[]; movementSamples: Record<string, SignalSample[]> } {
  const order: string[] = [];
  const groups = new Map<string, MovementResult[]>();

  for (const r of raw) {
    const label = describeMovement(r);
    if (!groups.has(label)) {
      groups.set(label, []);
      order.push(label);
    }
    groups.get(label)!.push(r);
  }

  const movements: MovementResult[] = [];
  const movementSamples: Record<string, SignalSample[]> = {};

  for (const label of order) {
    const group = groups.get(label)!;
    let rep = group[0];
    for (const g of group) if (g.score > rep.score) rep = g;

    const pooled: SignalSample[] = [];
    for (const g of group) {
      const s = collected[g.name];
      if (s) pooled.push(...s);
    }

    movements.push({ ...rep, name: label });
    movementSamples[label] = pooled;
  }

  movements.sort((a, b) => b.score - a.score);
  return { movements, movementSamples };
}

/** Direction word helper (kept here so UI code can share it if needed). */
export function directionWord(dir: MovementDirection | null): string {
  return dir ?? "";
}
