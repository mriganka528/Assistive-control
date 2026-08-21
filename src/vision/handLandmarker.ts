// ---------------------------------------------------------------------------
// Assistive Control — MediaPipe Hand Landmarker (PHASE 9, §23)
//
// Optional hand tracking that feeds the SAME reliability system as the face.
// If the model file (public/models/hand_landmarker.task) is absent or init
// fails, this returns null and the app continues face-only — hand support is
// strictly additive and never breaks the existing pipeline.
//
// Face-only is graceful but NOT silent (§23): the failure reason is captured in
// a status object the UI reads, so the app can tell the user hand tracking is
// off and exactly how to enable it, instead of failing quietly to the console.
//
// To enable hand tracking, place `hand_landmarker.task` in
// src/renderer/public/models/ — served at `/models/hand_landmarker.task`.
// Download it from the MediaPipe model catalog:
//   https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
// ---------------------------------------------------------------------------

import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const MODEL_PATH = "/models/hand_landmarker.task";
const MODEL_DOWNLOAD_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type HandTrackingReason =
  | "active"
  | "missing-model"
  | "error"
  | "uninitialized";

export type HandTrackingStatus = {
  active: boolean;
  reason: HandTrackingReason;
  /** short human-readable explanation for the UI. */
  message: string;
  /** actionable hint when not active (empty when active). */
  hint: string;
  /** where to get the model, for the UI to show/copy. */
  modelPath: string;
  downloadUrl: string;
};

let handLandmarker: HandLandmarker | null = null;
let initFailed = false;
let status: HandTrackingStatus = {
  active: false,
  reason: "uninitialized",
  message: "Hand tracking has not been initialized yet.",
  hint: "",
  modelPath: MODEL_PATH,
  downloadUrl: MODEL_DOWNLOAD_URL,
};

/** Distinguish a missing model file from other init failures, when possible. */
async function classifyFailure(): Promise<HandTrackingReason> {
  try {
    const res = await fetch(MODEL_PATH, { method: "HEAD" });
    if (res.status === 404) return "missing-model";
    // A tiny/empty file also means the model isn't really there.
    const len = Number(res.headers.get("content-length") ?? "0");
    if (res.ok && len > 0 && len < 10_000) return "missing-model";
    return "error";
  } catch {
    // fetch may be unavailable (e.g. file:// origin) — can't tell, call it error.
    return "error";
  }
}

/**
 * Lazily create the Hand Landmarker. Returns null (once) if the model is
 * missing or initialization fails, so callers can fall back to face-only.
 */
export async function initializeHandLandmarker(): Promise<HandLandmarker | null> {
  if (handLandmarker) return handLandmarker;
  if (initFailed) return null;

  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    status = {
      active: true,
      reason: "active",
      message: "Hand tracking is active.",
      hint: "",
      modelPath: MODEL_PATH,
      downloadUrl: MODEL_DOWNLOAD_URL,
    };
    return handLandmarker;
  } catch (err) {
    initFailed = true;
    const reason = await classifyFailure();
    if (reason === "missing-model") {
      status = {
        active: false,
        reason,
        message:
          "Hand tracking is off because its model file wasn't found. The app is running face-only.",
        hint: `Download hand_landmarker.task and place it in src/renderer/public/models/ (served at ${MODEL_PATH}), then restart.`,
        modelPath: MODEL_PATH,
        downloadUrl: MODEL_DOWNLOAD_URL,
      };
    } else {
      status = {
        active: false,
        reason: "error",
        message:
          "Hand tracking couldn't start, so the app is running face-only.",
        hint: `Confirm the model at ${MODEL_PATH} is valid, then restart. Details: ${
          err instanceof Error ? err.message : String(err)
        }`,
        modelPath: MODEL_PATH,
        downloadUrl: MODEL_DOWNLOAD_URL,
      };
    }
    console.warn(
      "[handLandmarker] hand tracking unavailable — continuing face-only.",
      status.hint,
      err
    );
    return null;
  }
}

export function getHandLandmarker(): HandLandmarker | null {
  return handLandmarker;
}

/** True once hand tracking is active. */
export function isHandTrackingActive(): boolean {
  return handLandmarker !== null;
}

/** Full status for the UI (why hand tracking is on/off and how to enable it). */
export function getHandTrackingStatus(): HandTrackingStatus {
  return status;
}
