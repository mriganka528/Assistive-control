// ---------------------------------------------------------------------------
// Assistive Control — live control screen (PHASES 14, 15, 18, 19)
//
// Opens the camera, runs face (and optional hand) detection each frame, merges
// the signals, and drives the ControlRuntime. Renders the live status panel,
// adaptive switch alerts, and the mandatory safety controls (arm / pause /
// resume / emergency stop). The runtime enforces the safety gate, face-loss
// watchdog, and confidence freeze; this component just feeds and reflects it.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { initializeFaceLandmarker } from "../../../vision/faceLandmarker";
import {
  initializeHandLandmarker,
  getHandTrackingStatus,
  type HandTrackingStatus,
} from "../../../vision/handLandmarker";
import { handFeatures, type Landmark } from "../../../vision/features";
import { ControlRuntime } from "../runtime/controlRuntime";
import { describeMapping } from "../control/movementMapper";
import { quickRebaseline } from "../adaptive/rebaseline";
import { BaselineRecorder } from "../calibration/recorder";
import { useSafety } from "../hooks/useSafety";
import ControlStatusPanel from "./ControlStatus";
import AdaptiveAlert from "./AdaptiveAlert";
import InputModeBanner from "./InputModeBanner";
import type {
  CalibrationProfile,
  ControlStatus as Status,
  SwitchProposal,
} from "../calibration/types";

const STATUS_THROTTLE_MS = 100;
/** Length of the optional "recheck" resting capture used to re-baseline. */
const RECHECK_MS = 4000;
const ROLE_LABELS: Record<string, string> = {
  cursor: "Cursor",
  leftClick: "Left click",
  rightClick: "Right click",
  middleClick: "Middle click",
  scroll: "Scroll",
  confirm: "Confirm",
};

const INITIAL_STATUS: Status = {
  armed: false,
  paused: false,
  faceVisible: false,
  trackingConfident: false,
  state: "READY",
  activeRole: null,
  activeMovement: null,
  activeSignal: null,
  activeSignalValue: 0,
  activeReliability: 0,
};

export default function ControlView({
  profile,
  onProfileChange,
  onExit,
}: {
  profile: CalibrationProfile;
  onProfileChange: (profile: CalibrationProfile) => void;
  onExit: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Timer handle for the detection loop. We drive it with setTimeout rather
  // than requestAnimationFrame: rAF is suspended by the OS/compositor whenever
  // the window is minimized or hidden, which froze the real cursor the moment
  // the user switched to another app. A timer keeps firing in the background
  // (with backgroundThrottling disabled in the main process), so control keeps
  // working while the app is minimized — the whole point of the tool.
  const loopTimer = useRef<number | null>(null);
  const runtimeRef = useRef<ControlRuntime | null>(null);
  const lastStatusPush = useRef(0);
  const proposalShown = useRef(false);
  const autoNoteTimer = useRef<number | null>(null);
  // Latest onProfileChange, so the long-lived detect loop never calls a stale one.
  const onProfileChangeRef = useRef(onProfileChange);
  // Active quick-recheck capture (Phase 12), or null when not rechecking.
  const recheckRef = useRef<{ recorder: BaselineRecorder; until: number } | null>(
    null
  );

  const [cameraReady, setCameraReady] = useState(false);
  const [handActive, setHandActive] = useState(false);
  const [handStatus, setHandStatus] = useState<HandTrackingStatus | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>(INITIAL_STATUS);
  const [proposal, setProposal] = useState<SwitchProposal | null>(null);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);

  const safety = useSafety();
  const autoArmed = useRef(false);

  // Create the runtime once, and keep it in sync with the profile prop.
  if (runtimeRef.current === null) {
    runtimeRef.current = new ControlRuntime(profile);
  }
  useEffect(() => {
    runtimeRef.current?.setProfile(profile);
  }, [profile]);

  useEffect(() => {
    onProfileChangeRef.current = onProfileChange;
  }, [onProfileChange]);

  // Mirror safety state into the runtime gate.
  useEffect(() => {
    runtimeRef.current?.setSafety(safety.state);
  }, [safety.state]);

  // Auto-arm as soon as the camera is live (§ assistive intent): the user
  // shouldn't have to click "Arm" — control is the whole point of the screen.
  // We arm only once on entry and never fight a later emergency stop / pause.
  useEffect(() => {
    if (
      cameraReady &&
      safety.available &&
      !autoArmed.current &&
      !safety.state.armed &&
      !safety.state.stopped
    ) {
      autoArmed.current = true;
      safety.arm();
    }
  }, [cameraReady, safety.available, safety.state.armed, safety.state.stopped, safety]);

  // Camera + detection loop.
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
        setHandActive(hand !== null);
        setHandStatus(getHandTrackingStatus());

        // ~60fps target. setTimeout keeps firing while minimized (unlike rAF),
        // and the runtime is frame-time aware so an occasionally longer gap
        // doesn't make the cursor lurch.
        const FRAME_MS = 16;
        const scheduleNext = () => {
          if (stopped) return;
          loopTimer.current = window.setTimeout(detect, FRAME_MS);
        };

        const detect = () => {
          if (stopped) return;
          if (!videoRef.current || videoRef.current.readyState < 2) {
            scheduleNext();
            return;
          }
          const timestamp = performance.now();
          const signals: Record<string, number> = {};

          const faceResult = face.detectForVideo(videoRef.current, timestamp);
          const hasFace = faceResult.faceLandmarks.length > 0;
          if (hasFace && faceResult.faceBlendshapes.length > 0) {
            for (const c of faceResult.faceBlendshapes[0].categories) {
              if (c.categoryName === "_neutral") continue;
              signals[c.categoryName] = c.score;
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
                Object.assign(signals, handFeatures(landmarks));
              }
            } catch {
              // hand detection hiccup — ignore this frame
            }
          }

          const subjectVisible = hasFace || hasHand;

          // Phase 12 — optional quick re-baseline: gather a short resting
          // capture, then shift thresholds by the measured drift.
          const recheck = recheckRef.current;
          if (recheck) {
            if (timestamp < recheck.until) {
              if (subjectVisible) recheck.recorder.addSample(signals);
            } else {
              const samples = recheck.recorder.stop();
              recheckRef.current = null;
              const rt = runtimeRef.current;
              if (rt && samples.length > 0) {
                const adjusted = quickRebaseline(rt.getProfile(), samples, RECHECK_MS);
                rt.setProfile(adjusted);
                onProfileChangeRef.current(adjusted);
                rt.markProfileSaved();
              }
              setRechecking(false);
              setAutoNote("Adapted to current lighting and position.");
              if (autoNoteTimer.current !== null)
                window.clearTimeout(autoNoteTimer.current);
              autoNoteTimer.current = window.setTimeout(
                () => setAutoNote(null),
                4000
              );
            }
          }

          const runtime = runtimeRef.current;
          if (runtime) {
            const { status: st, decisions } = runtime.frame({
              timestamp,
              faceVisible: subjectVisible,
              trackingConfidence: subjectVisible ? 1 : 0,
              signals,
            });

            if (timestamp - lastStatusPush.current >= STATUS_THROTTLE_MS) {
              lastStatusPush.current = timestamp;
              setStatus(st);
            }

            for (const d of decisions) {
              if (d.kind === "propose" && !proposalShown.current) {
                proposalShown.current = true;
                setProposal(d.proposal);
              } else if (d.kind === "auto") {
                const role = ROLE_LABELS[d.proposal.role] ?? d.proposal.role;
                setAutoNote(
                  `Switched ${role} to ${d.proposal.toMovement} (more reliable).`
                );
                if (autoNoteTimer.current !== null)
                  window.clearTimeout(autoNoteTimer.current);
                autoNoteTimer.current = window.setTimeout(
                  () => setAutoNote(null),
                  4000
                );
                onProfileChangeRef.current(runtime.getProfile());
                runtime.markProfileSaved();
              }
            }
          }

          scheduleNext();
        };

        detect();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to access camera.");
      }
    }

    start();

    return () => {
      stopped = true;
      if (loopTimer.current !== null) window.clearTimeout(loopTimer.current);
      if (autoNoteTimer.current !== null) window.clearTimeout(autoNoteTimer.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      // Leaving control always disarms, so no input continues in the background.
      safety.disarm();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptProposal = (p: SwitchProposal) => {
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.applyProposal(p);
      onProfileChange(runtime.getProfile());
      runtime.markProfileSaved();
    }
    proposalShown.current = false;
    setProposal(null);
  };
  const dismissProposal = () => {
    proposalShown.current = false;
    setProposal(null);
  };

  const startRecheck = () => {
    if (recheckRef.current) return;
    const recorder = new BaselineRecorder();
    recorder.start(RECHECK_MS);
    recheckRef.current = { recorder, until: performance.now() + RECHECK_MS };
    setRechecking(true);
    setAutoNote("Rechecking… relax and stay still for a moment.");
  };

  const mappingLines = describeMapping(profile.controls);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button onClick={onExit}>← Home</button>
        <h1 style={{ margin: 0, fontSize: "1.375rem" }}>Live Control</h1>
        <span style={{ fontSize: "13px", color: "var(--text-faint)" }}>
          {handActive ? "Face + hand tracking" : "Face tracking"}
        </span>
      </div>

      <div style={{ marginTop: "12px" }}>
        <InputModeBanner />
      </div>

      {handStatus && !handStatus.active && handStatus.reason !== "uninitialized" && (
        <div
          role="status"
          style={{
            marginTop: "12px",
            padding: "12px 14px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#78350f",
          }}
        >
          <strong>Hand tracking is off — running face-only.</strong>{" "}
          {handStatus.message}
          {handStatus.hint && (
            <div style={{ marginTop: "6px", color: "#92400e" }}>
              {handStatus.hint}
            </div>
          )}
          <div style={{ marginTop: "6px", color: "#a16207", fontSize: "12px" }}>
            Face-only control still works fully — this only means hand movements
            aren’t available as extra controls.
          </div>
        </div>
      )}

      {safety.emergencyFlash && (
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            background: "#dc2626",
            color: "#fff",
            borderRadius: "8px",
            fontWeight: 600,
          }}
        >
          EMERGENCY STOP — control halted. Re-arm to resume.
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: "12px",
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
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "20px",
          marginTop: "16px",
          alignItems: "start",
        }}
      >
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
          <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-faint)" }}>
            Camera: {cameraReady ? "ready" : "starting…"}
          </div>

          {/* Minimal controls — the app arms itself; the user only ever needs
              a quick pause and the emergency stop. Everything else is automatic. */}
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {safety.state.armed && !safety.state.paused && (
              <button onClick={safety.pause} style={btn}>
                Pause
              </button>
            )}
            {(safety.state.paused || safety.state.stopped || !safety.state.armed) && (
              <button
                onClick={safety.state.stopped ? safety.arm : safety.resume}
                style={{ ...btn, background: "#16a34a", color: "#fff" }}
              >
                {safety.state.stopped ? "Re-arm" : "Resume"}
              </button>
            )}
            <button
              onClick={safety.stop}
              style={{ ...btn, background: "#dc2626", color: "#fff" }}
            >
              Emergency stop
            </button>
            <button onClick={startRecheck} disabled={rechecking} style={btn}>
              {rechecking ? "Rechecking…" : "Recheck (adapt to now)"}
            </button>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-faint)", marginTop: "8px" }}>
            Control arms automatically. Real mouse and keyboard across your whole
            computer. Emergency stop: Ctrl+Shift+X (works even when this window
            isn't focused).
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <ControlStatusPanel status={status} />

          <AdaptiveAlert
            proposal={proposal}
            autoNote={autoNote}
            onAccept={acceptProposal}
            onDismiss={dismissProposal}
          />

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "16px",
              background: "var(--surface)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: "15px" }}>Your controls</h3>
            {mappingLines.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--text-faint)" }}>
                No controls mapped. Try recalibrating.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px" }}>
                {mappingLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  cursor: "pointer",
};
