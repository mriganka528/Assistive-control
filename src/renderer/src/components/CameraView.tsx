// ---------------------------------------------------------------------------
// Assistive Control — guided calibration (§1, §2)
//
// Movement-AGNOSTIC enrollment. We do NOT ask the user to perform named
// gestures. Instead:
//
//   Stage A — Baseline: record natural resting behaviour (face + optional hand)
//             so we know what "no deliberate movement" looks like for THIS user.
//
//   Stage B — Discovery: the user simply performs "a movement they can control
//             reliably", several times. We capture repetitions generically
//             ("Movement 1", "Movement 2", …) and let the analyzer decide which
//             signal it actually is. The user is then shown a plain-language
//             label ("Smile", "Look left", "Make a fist") — never a raw channel
//             name — and can add as many movements as they can perform.
//
// Both face blendshapes AND hand/finger features feed the SAME pipeline, so a
// user who can only move a hand, only blink, only one cheek, etc. is fully
// supported. The detect loop runs once and reads recording flags from refs, so
// the camera is never re-acquired mid-capture.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { initializeFaceLandmarker } from "../../../vision/faceLandmarker";
import { initializeHandLandmarker } from "../../../vision/handLandmarker";
import { handFeatures, type Landmark } from "../../../vision/features";
import { BaselineRecorder, MovementRecorder } from "../calibration/recorder";
import type { MovementResult, SignalSample } from "../calibration/types";
import { analyzeMovements } from "../calibration/analyzer";
import { finalizeDiscovery } from "../calibration/labels";

const REPS_PER_MOVEMENT = 4;
const COUNTDOWN_SECONDS = 2;
const RECORD_SECONDS = 2;
const REST_SECONDS = 1;
const BASELINE_MS = 12000;
const MAX_MOVEMENTS = 6;

type LiveSignal = { name: string; score: number };
type Phase = "idle" | "countdown" | "recording" | "rest";
type Stage =
  | "baseline"
  | "baselineRecording"
  | "baselineDone"
  | "discovery"
  | "analyzing"
  | "complete";

export type CalibrationOutput = {
  baselineSamples: SignalSample[];
  baselineDurationMs: number;
  movements: MovementResult[];
  movementSamples: Record<string, SignalSample[]>;
};

export default function CameraView({
  onComplete,
  onExit,
}: {
  onComplete?: (output: CalibrationOutput) => void;
  onExit?: () => void;
} = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastLivePush = useRef(0);

  const baselineRecorderRef = useRef(new BaselineRecorder());
  const movementRecorderRef = useRef(new MovementRecorder());
  // The detect loop reads these each frame so it can run once (no camera churn).
  const baselineActiveRef = useRef(false);
  const recordingActiveRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [subjectVisible, setSubjectVisible] = useState(false);
  const [handAvailable, setHandAvailable] = useState(false);
  const [error, setError] = useState("");
  const [liveSignals, setLiveSignals] = useState<LiveSignal[]>([]);

  const [stage, setStage] = useState<Stage>("baseline");
  const [baselineSamples, setBaselineSamples] = useState<SignalSample[]>([]);

  // Captured discovery slots (each is one movement's concatenated repetitions).
  const [slots, setSlots] = useState<SignalSample[][]>([]);
  const [isRecordingSlot, setIsRecordingSlot] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [currentRep, setCurrentRep] = useState(0);
  const [phaseMessage, setPhaseMessage] = useState("");

  const [movementResults, setMovementResults] = useState<MovementResult[]>([]);
  const [movementSamples, setMovementSamples] = useState<
    Record<string, SignalSample[]>
  >({});

  // -------------------------------------------------------------------------
  // Camera + MediaPipe (face + optional hand). Runs once.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (stopped) return;
        setCameraReady(true);

        const face = await initializeFaceLandmarker();
        const hand = await initializeHandLandmarker();
        setHandAvailable(hand !== null);

        const detect = () => {
          if (stopped || !videoRef.current || videoRef.current.readyState < 2) {
            animationRef.current = requestAnimationFrame(detect);
            return;
          }

          const timestamp = performance.now();
          const signalMap: Record<string, number> = {};

          const faceResult = face.detectForVideo(videoRef.current, timestamp);
          const hasFace = faceResult.faceLandmarks.length > 0;
          if (hasFace && faceResult.faceBlendshapes.length > 0) {
            for (const cat of faceResult.faceBlendshapes[0].categories) {
              if (cat.categoryName === "_neutral") continue;
              signalMap[cat.categoryName] = cat.score;
            }
          }

          let hasHand = false;
          if (hand) {
            try {
              const handResult = hand.detectForVideo(videoRef.current, timestamp);
              const landmarks = handResult.landmarks?.[0] as
                | Landmark[]
                | undefined;
              if (landmarks && landmarks.length >= 21) {
                hasHand = true;
                Object.assign(signalMap, handFeatures(landmarks));
              }
            } catch {
              // transient hand-detection hiccup — ignore this frame
            }
          }

          setSubjectVisible(hasFace || hasHand);

          // Throttled live signal monitor (top movers).
          if (timestamp - lastLivePush.current > 120) {
            lastLivePush.current = timestamp;
            const arr = Object.entries(signalMap)
              .map(([name, score]) => ({ name, score }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 12);
            setLiveSignals(arr);
          }

          if (
            baselineActiveRef.current &&
            baselineRecorderRef.current.isRecording()
          ) {
            baselineRecorderRef.current.addSample(signalMap);
          }
          if (
            recordingActiveRef.current &&
            movementRecorderRef.current.isRecording()
          ) {
            movementRecorderRef.current.addSample(signalMap);
          }

          animationRef.current = requestAnimationFrame(detect);
        };

        detect();
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Unable to access camera."
        );
      }
    }

    start();

    return () => {
      stopped = true;
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Stage A — baseline
  // -------------------------------------------------------------------------
  const startBaseline = () => {
    baselineRecorderRef.current.start(BASELINE_MS);
    baselineActiveRef.current = true;
    setBaselineSamples([]);
    setStage("baselineRecording");
    setTimeout(() => {
      const samples = baselineRecorderRef.current.stop();
      baselineActiveRef.current = false;
      setBaselineSamples(samples);
      setStage("baselineDone");
    }, BASELINE_MS);
  };

  // -------------------------------------------------------------------------
  // Stage B — generic voluntary-movement discovery
  // -------------------------------------------------------------------------
  const recordMovementSlot = async () => {
    if (isRecordingSlot) return;
    setIsRecordingSlot(true);
    setStage("discovery");
    const slotNumber = slots.length + 1;
    const collected: SignalSample[] = [];

    for (let repetition = 1; repetition <= REPS_PER_MOVEMENT; repetition++) {
      setCurrentRep(repetition);

      // Countdown
      setPhase("countdown");
      for (let second = COUNTDOWN_SECONDS; second > 0; second--) {
        setCountdown(second);
        setPhaseMessage(
          repetition === 1
            ? `Movement ${slotNumber}: when you're ready, get set to perform a movement you can control reliably…`
            : `Movement ${slotNumber}: do the SAME movement again…`
        );
        await wait(1000);
      }

      // Record
      movementRecorderRef.current.start();
      recordingActiveRef.current = true;
      setPhase("recording");
      setPhaseMessage("Perform your movement now.");
      await wait(RECORD_SECONDS * 1000);
      recordingActiveRef.current = false;
      collected.push(...movementRecorderRef.current.stop());

      // Rest (between reps only)
      if (repetition < REPS_PER_MOVEMENT) {
        setPhase("rest");
        setPhaseMessage("Relax…");
        await wait(REST_SECONDS * 1000);
      }
    }

    setPhase("idle");
    setPhaseMessage("");
    setSlots((prev) => [...prev, collected]);
    setIsRecordingSlot(false);
  };

  const restartDiscovery = () => {
    setSlots([]);
    setMovementResults([]);
    setMovementSamples({});
    setStage("baselineDone");
  };

  const finishDiscovery = async () => {
    if (slots.length === 0) return;
    setStage("analyzing");
    await wait(250); // let the "analyzing" UI paint

    const temp: Record<string, SignalSample[]> = {};
    slots.forEach((slotSamples, i) => {
      temp[`Movement ${i + 1}`] = slotSamples;
    });

    const raw = analyzeMovements(baselineSamples, temp);
    const { movements, movementSamples: finalSamples } = finalizeDiscovery(
      raw,
      temp
    );

    setMovementResults(movements);
    setMovementSamples(finalSamples);
    setStage("complete");
  };

  const totalMovementSamples = Object.values(movementSamples).reduce(
    (n, arr) => n + arr.length,
    0
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "24px",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      {onExit && (
        <button onClick={onExit} style={{ alignSelf: "flex-start" }}>
          ← Home
        </button>
      )}

      <h1 style={{ margin: 0 }}>Set up your controls</h1>
      <p style={{ marginTop: 0, color: "#475569" }}>
        We'll learn the movements <em>you</em> can make — no specific gesture is
        required.
      </p>

      {error && (
        <div
          style={{
            padding: "12px",
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: "8px",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(400px, 2fr) minmax(300px, 1fr)",
          gap: "20px",
        }}
      >
        {/* CAMERA + FLOW */}
        <div>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "100%",
              borderRadius: "12px",
              background: "#111",
              transform: "scaleX(-1)",
            }}
          />

          <div style={{ marginTop: "12px", fontSize: "14px", color: "#475569" }}>
            <strong>Camera:</strong> {cameraReady ? "ready" : "starting…"}
            {"   "}
            <strong>Tracking:</strong>{" "}
            {subjectVisible ? "you're detected" : "position yourself in view"}
            {"   "}
            <strong>Hand tracking:</strong>{" "}
            {handAvailable ? "on" : "face only"}
          </div>

          <div
            style={{
              marginTop: "20px",
              padding: "20px",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#fff",
            }}
          >
            {/* Stage A: baseline */}
            {stage === "baseline" && (
              <>
                <h2 style={{ marginTop: 0 }}>Step 1 — Relax</h2>
                <p>
                  First we watch you at rest for about {BASELINE_MS / 1000}{" "}
                  seconds so we know your natural resting state. Just relax and
                  breathe normally — you don't need to do anything.
                </p>
                <button
                  onClick={startBaseline}
                  disabled={!cameraReady}
                  style={primaryBtn}
                >
                  Start
                </button>
              </>
            )}

            {stage === "baselineRecording" && (
              <>
                <h2 style={{ marginTop: 0 }}>Watching you relax…</h2>
                <p>Stay relaxed. Don't try to do anything special.</p>
                <div style={barTrack}>
                  <div style={{ ...barFill, animation: "none", width: "100%" }} />
                </div>
                <p style={{ color: "#64748b" }}>Recording your resting state…</p>
              </>
            )}

            {/* Stage B: discovery */}
            {(stage === "baselineDone" ||
              stage === "discovery" ||
              stage === "analyzing") && (
              <>
                <h2 style={{ marginTop: 0 }}>Step 2 — Show us your movements</h2>
                <p style={{ color: "#475569" }}>
                  When you're ready, perform a movement you can control reliably
                  — anything at all (a blink, a small head turn, a finger, a
                  smile). We'll ask you to repeat it a few times, then you can
                  add more movements.
                </p>

                {slots.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <strong>Captured so far:</strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
                      {slots.map((_, i) => (
                        <li key={i}>Movement {i + 1} ✓</li>
                      ))}
                    </ul>
                  </div>
                )}

                {isRecordingSlot ? (
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "10px",
                      background: "#f1f5f9",
                      textAlign: "center",
                    }}
                  >
                    <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
                      Recording movement {slots.length + 1} · repetition{" "}
                      {currentRep} / {REPS_PER_MOVEMENT}
                    </p>
                    {phase === "countdown" && (
                      <div style={{ fontSize: "44px", fontWeight: 700 }}>
                        {countdown}
                      </div>
                    )}
                    {phase === "recording" && (
                      <div style={{ fontSize: "20px", color: "#dc2626" }}>
                        ● Recording — {phaseMessage}
                      </div>
                    )}
                    {phase === "rest" && (
                      <div style={{ fontSize: "18px", color: "#2563eb" }}>
                        {phaseMessage}
                      </div>
                    )}
                    {phase === "countdown" && (
                      <p style={{ margin: "8px 0 0", color: "#64748b" }}>
                        {phaseMessage}
                      </p>
                    )}
                  </div>
                ) : stage !== "analyzing" ? (
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      onClick={recordMovementSlot}
                      disabled={!cameraReady || slots.length >= MAX_MOVEMENTS}
                      style={primaryBtn}
                    >
                      {slots.length === 0
                        ? "Record a movement"
                        : "Record another movement"}
                    </button>
                    <button
                      onClick={finishDiscovery}
                      disabled={slots.length === 0}
                      style={{
                        ...primaryBtn,
                        background: slots.length === 0 ? "#94a3b8" : "#16a34a",
                      }}
                    >
                      Finish &amp; analyze ({slots.length})
                    </button>
                    {slots.length > 0 && (
                      <button onClick={restartDiscovery} style={ghostBtn}>
                        Start over
                      </button>
                    )}
                  </div>
                ) : (
                  <p style={{ fontWeight: 600 }}>Analyzing your movements…</p>
                )}

                {slots.length >= MAX_MOVEMENTS && !isRecordingSlot && (
                  <p style={{ color: "#64748b", marginTop: "10px" }}>
                    That's plenty of movements to work with.
                  </p>
                )}
              </>
            )}

            {/* Complete */}
            {stage === "complete" && (
              <div>
                <h2 style={{ marginTop: 0 }}>Here's what we found</h2>
                {movementResults.length === 0 ? (
                  <p>
                    We couldn't detect a reliable movement. Try again in good
                    lighting, and hold each movement clearly for a moment.
                  </p>
                ) : (
                  <>
                    <p style={{ color: "#475569" }}>
                      These are the movements you can control, strongest first.
                      We'll automatically turn them into cursor, click and scroll
                      controls — you can fine-tune the mapping afterwards.
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        marginTop: "12px",
                      }}
                    >
                      {movementResults.map((m, index) => (
                        <div
                          key={m.name}
                          style={{
                            padding: "12px",
                            border: "1px solid #e2e8f0",
                            borderRadius: "10px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "6px",
                            }}
                          >
                            <strong>
                              {index + 1}. {m.name}
                            </strong>
                            <strong>{m.score}%</strong>
                          </div>
                          <div style={barTrack}>
                            <div style={{ ...barFill, width: `${m.score}%` }} />
                          </div>
                          <p
                            style={{
                              marginTop: "6px",
                              marginBottom: 0,
                              fontSize: "12px",
                              color: "#94a3b8",
                            }}
                          >
                            Control confidence · {m.direction ? "directional" : "on/off"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div
                  style={{
                    marginTop: "16px",
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={() =>
                      onComplete?.({
                        baselineSamples,
                        baselineDurationMs: BASELINE_MS,
                        movements: movementResults,
                        movementSamples,
                      })
                    }
                    disabled={!onComplete || movementResults.length === 0}
                    style={{
                      ...primaryBtn,
                      background:
                        !onComplete || movementResults.length === 0
                          ? "#94a3b8"
                          : "#2563eb",
                    }}
                  >
                    Save profile &amp; continue
                  </button>
                  <button onClick={restartDiscovery} style={ghostBtn}>
                    Redo movements
                  </button>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    {totalMovementSamples} samples recorded
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LIVE SIGNAL MONITOR (secondary; users never pick channels by name) */}
        <div
          style={{
            maxHeight: "600px",
            overflowY: "auto",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "16px",
            background: "#fff",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Live signal activity</h3>
          {!subjectVisible && (
            <p style={{ color: "#64748b" }}>
              Position your face or hand in front of the camera.
            </p>
          )}
          {liveSignals.map((signal) => (
            <div key={signal.name} style={{ padding: "5px 0" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "#475569",
                }}
              >
                <span>{signal.name}</span>
                <span>{signal.score.toFixed(2)}</span>
              </div>
              <div style={{ ...barTrack, height: "5px" }}>
                <div
                  style={{
                    ...barFill,
                    width: `${Math.round(signal.score * 100)}%`,
                    background: "#60a5fa",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const primaryBtn: React.CSSProperties = {
  padding: "12px 20px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "15px",
};

const ghostBtn: React.CSSProperties = {
  padding: "12px 16px",
  background: "#fff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  cursor: "pointer",
};

const barTrack: React.CSSProperties = {
  height: "8px",
  background: "#e2e8f0",
  borderRadius: "8px",
  overflow: "hidden",
};

const barFill: React.CSSProperties = {
  height: "100%",
  background: "#22c55e",
};
