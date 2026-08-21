// ---------------------------------------------------------------------------
// Assistive Control — hand feature extraction (PHASE 9)
//
// Converts MediaPipe Hand Landmarker output (21 landmarks) into a set of
// normalized [0,1] signal channels that plug into the SAME reliability system,
// analyzer, and controllers as facial blendshapes. Channel names deliberately
// contain "finger" / "pinch" / "hand" so the analyzer's plausibility priors
// recognize them.
//
// This does NOT replace the face pipeline — hand channels are simply merged
// into the same per-frame signal map. All math here is scale-invariant (uses
// joint angles and palm-relative distances) so it is robust to how far the hand
// is from the camera. Pure and dependency-free for easy testing.
// ---------------------------------------------------------------------------

/** A single normalized landmark (x,y in [0,1] image space; z relative). */
export type Landmark = { x: number; y: number; z?: number };

/** MediaPipe hand landmark indices (21-point model). */
const WRIST = 0;
const THUMB_MCP = 2;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;
const MIDDLE_TIP = 12;
const RING_MCP = 13;
const RING_PIP = 14;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_PIP = 18;
const PINKY_TIP = 20;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function dist2(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Curl of a finger at its middle joint, 0 (straight) .. 1 (fully folded).
 * `b` is the vertex joint (PIP / IP); `a` and `c` are its neighbours.
 * Straight finger => a-b-c collinear => the two vectors from b are opposite
 * (cos ≈ -1); folded => they align (cos ≈ +1). curl = (cos+1)/2.
 */
function jointCurl(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / mag));
  return clamp01((cos + 1) / 2);
}

/** Pinch strength between the thumb tip and a finger tip, 0 (open) .. 1. */
function pinch(
  thumbTip: Landmark,
  fingerTip: Landmark,
  palmWidth: number
): number {
  if (palmWidth < 1e-6) return 0;
  const r = dist2(thumbTip, fingerTip) / palmWidth;
  const CLOSED = 0.25; // tips touching, in palm-width units
  const OPEN = 1.1; // comfortably separated
  return clamp01((OPEN - r) / (OPEN - CLOSED));
}

/**
 * Extract the hand signal channels from one hand's 21 landmarks. Returns an
 * empty object if the landmarks are missing/invalid so callers can simply
 * spread the result into the shared signal map.
 */
export function handFeatures(landmarks: Landmark[] | undefined | null): Record<string, number> {
  if (!landmarks || landmarks.length < 21) return {};

  const wrist = landmarks[WRIST];
  const palmWidth = dist2(landmarks[INDEX_MCP], landmarks[PINKY_MCP]);

  const curlThumb = jointCurl(
    landmarks[THUMB_MCP],
    landmarks[THUMB_IP],
    landmarks[THUMB_TIP]
  );
  const curlIndex = jointCurl(
    landmarks[INDEX_MCP],
    landmarks[INDEX_PIP],
    landmarks[INDEX_TIP]
  );
  const curlMiddle = jointCurl(
    landmarks[MIDDLE_MCP],
    landmarks[MIDDLE_PIP],
    landmarks[MIDDLE_TIP]
  );
  const curlRing = jointCurl(
    landmarks[RING_MCP],
    landmarks[RING_PIP],
    landmarks[RING_TIP]
  );
  const curlPinky = jointCurl(
    landmarks[PINKY_MCP],
    landmarks[PINKY_PIP],
    landmarks[PINKY_TIP]
  );

  // Openness from the four non-thumb fingers (1 = open hand, 0 = fist).
  const openness = clamp01(
    1 - (curlIndex + curlMiddle + curlRing + curlPinky) / 4
  );

  return {
    fingerCurlThumb: curlThumb,
    fingerCurlIndex: curlIndex,
    fingerCurlMiddle: curlMiddle,
    fingerCurlRing: curlRing,
    fingerCurlPinky: curlPinky,
    pinchIndex: pinch(landmarks[THUMB_TIP], landmarks[INDEX_TIP], palmWidth),
    pinchMiddle: pinch(landmarks[THUMB_TIP], landmarks[MIDDLE_TIP], palmWidth),
    handOpenness: openness,
    handFist: clamp01(1 - openness),
    handPosX: clamp01(wrist.x),
    handPosY: clamp01(wrist.y),
  };
}

/** The channel names this extractor can produce (for UI / discovery). */
export const HAND_CHANNELS: string[] = [
  "fingerCurlThumb",
  "fingerCurlIndex",
  "fingerCurlMiddle",
  "fingerCurlRing",
  "fingerCurlPinky",
  "pinchIndex",
  "pinchMiddle",
  "handOpenness",
  "handFist",
  "handPosX",
  "handPosY",
];
