# Assistive Control — Acceptance & Verification Report

This report maps the project's requirements to their implementation and records
how each was verified. It covers the product concept (movement-agnostic control),
the verbatim spec constraints (§9/§24 real input, §13 no hard-coded eye control,
§17 don't disable a degraded control, §25 local-only), and the full feature set.

## Verification method & environment

Two kinds of verification are used:

- **Static (done here):** TypeScript type-checking of both compiler projects,
  direct code inspection, and file/asset checks. These were performed in a Linux
  build sandbox that **cannot** run native modules (nut.js) or open a camera.
- **Live (your device):** Anything requiring the webcam, real OS input
  injection, or the global hotkey must be exercised on Windows. Those steps are
  marked **Live** below and are ready to run via `npm run dev`.

Static results:

| Check | Command | Result |
|-------|---------|--------|
| Renderer + vision + shared types | `tsc -p tsconfig.app.json --noEmit` | **EXIT 0** |
| Main + preload types | `tsc -p tsconfig.node.json --noEmit` | **EXIT 0** |
| Face model present & valid | `src/renderer/public/models/face_landmarker.task` | 3,758,596 bytes |
| Hand model present & valid | `src/renderer/public/models/hand_landmarker.task` | 7,819,105 bytes (valid TFLite bundle) |

Run both type-checks together with `npm run typecheck`.

## Core principle: movement-agnostic

The system never assumes a specific gesture. Calibration discovers whichever
movements a person can perform reliably (`calibration/analyzer.ts`), scores them
by separability / consistency / controllability, and `control/movementMapper.ts`
assigns *those* movements to controls. There is no `if (blink) click`, no
hard-coded eye/smile/gaze logic anywhere in the control path.

## 25-step acceptance walk-through

Status legend: **✓ Code-verified** (implementing code confirmed + type-checks) ·
**Live** (confirm on Windows with camera + real input).

| # | Step / expected result | Spec | Status |
|---|------------------------|------|--------|
| 1 | App opens to Home; with no profile it guides you to calibrate. | §28 | ✓ Code-verified · Live |
| 2 | Input Mode banner shows **REAL input** when nut.js is loaded; if not, it explains simulation mode and how to fix it (never silent). | §9/§24 | ✓ Code-verified · Live |
| 3 | Starting calibration opens the camera; face tracking runs (plus hand tracking if the hand model is present). | §23 | ✓ Code-verified · Live |
| 4 | A short resting **baseline** is recorded first. | §1 | ✓ Code-verified · Live |
| 5 | You try several movements; each is scored **movement-agnostically** against baseline — no assumed blink/smile/gaze. | §1/§2 | ✓ Code-verified |
| 6 | Only movements that are genuinely reliable are kept and ranked; weak ones are excluded (`MIN_MAP_SCORE`). | §2 | ✓ Code-verified |
| 7 | The control mapping is built from **your** movements (directional → cursor/scroll, discrete → click/confirm), never from fixed gestures. | §2 | ✓ Code-verified |
| 8 | With only one or two reliable movements, one movement covers several commands via **once / twice / hold** patterns. | §8 | ✓ Code-verified |
| 9 | The profile is saved **locally**; Home shows the last-updated time on return. | §25 | ✓ Code-verified · Live |
| 10 | Live Control requires an explicit **Arm** before any input occurs. | Safety | ✓ Code-verified · Live |
| 11 | While armed, the mapped directional movement **moves the real pointer**. | §9/§24 | Live |
| 12 | The mapped discrete movement/pattern issues a **real click** that registers in other Windows apps. | §9/§24 | Live |
| 13 | The mapped movement **scrolls** the active window. | §9/§24 | Live |
| 14 | The mapped movement/pattern sends a real **Enter/confirm**. | §9/§24 | Live |
| 15 | The **virtual keyboard** opens and types into any external field; it is driven by the person's mapped movements, **not** hard-coded eye control. | §13 | ✓ Code-verified · Live |
| 16 | The **app launcher** opens an allow-listed application; the renderer can only pass an id, never a raw command. | §14 | ✓ Code-verified · Live |
| 17 | **Pause** halts input; **Resume** restores it. | Safety | ✓ Code-verified · Live |
| 18 | **Emergency stop** halts immediately; the global **Ctrl+Shift+X** works even when the window is not focused. | Safety | ✓ Code-verified · Live |
| 19 | Losing the face **freezes** control after the grace period, then recovers when the face returns. | Safety | ✓ Code-verified · Live |
| 20 | Low tracking confidence **freezes** control. | Safety | ✓ Code-verified · Live |
| 21 | When a control's reliability drops, the control **keeps working** — it is **not disabled** just because confidence fell. | §17 | ✓ Code-verified · Live |
| 22 | In **assisted** mode (default), a degraded control raises a **switch proposal**; accepting it swaps in a more reliable movement. | §15/§16 | ✓ Code-verified · Live |
| 23 | In **automatic** mode, a degraded control switches without prompting **only when a better alternative exists**. | §16/§17 | ✓ Code-verified · Live |
| 24 | When **no better alternative** exists, the current movement is **kept active** (no switch, no disable). | §18 | ✓ Code-verified |
| 25 | **Editable mapping** in Settings lets you reassign any movement to any control, choose its pattern, or set it to None; changes persist locally. | §22/§26 | ✓ Code-verified · Live |

## Where each requirement lives

| Requirement | Implementation |
|-------------|----------------|
| Movement-agnostic discovery & scoring (§1/§2) | `renderer/src/calibration/analyzer.ts`, `recorder.ts` |
| Personalized mapping, no hard-coded gestures (§2) | `renderer/src/control/movementMapper.ts` |
| Multi-stage single/double/long patterns (§8) | `control/discreteController.ts`, `control/gestureEngine.ts`, `movementMapper.ts` |
| Real OS input; simulation is a labeled fallback only (§9/§24) | `main/inputController.ts`, `main/index.ts`, `renderer/src/components/InputModeBanner.tsx` |
| Virtual keyboard, not eye-hardcoded (§13) | `renderer/src/components/VirtualKeyboard.tsx` |
| Application launching, allow-listed (§14) | `main/appLauncher.ts`, `renderer/src/components/AppLauncher.tsx` |
| Reliability tracked over a time window (§15) | `renderer/src/adaptive/reliabilityMonitor.ts` |
| Assisted (default) vs automatic switching (§16) | `renderer/src/adaptive/switchingManager.ts`, `calibration/types.ts` (`DEFAULT_SETTINGS`) |
| Never disable a degraded control (§17) | `runtime/controlRuntime.ts` (controllers never gate on reliability), `switchingManager.ts` (replace-only) |
| No alternative → keep current (§18) | `switchingManager.ts` (`if (!alt) continue` + `minImprovement` gate) |
| Editable control mapping (§22/§26) | `renderer/src/components/ControlMappingEditor.tsx`, `movementMapper.ts` (`setDiscreteRole`, `setDirectionalBinding`) |
| Hand model path + graceful, non-silent fallback (§23) | `vision/handLandmarker.ts`, `ControlView.tsx`, `public/models/README.md` |
| Local-only, no backend/auth/cloud/telemetry (§25) | `renderer/src/calibration/profile.ts`, IPC surface in `shared/ipc.ts`; no network calls except MediaPipe WASM load |
| Mandatory safety model | `main/safety.ts`, `renderer/src/hooks/useSafety.ts`, `runtime/controlRuntime.ts` |

## Notes on the two dead-but-kept files

`control/clickController.ts` and `control/keyboardController.ts` were superseded
by `control/discreteController.ts` (which owns left/right click and confirm via
the tap-pattern engine). They are intentionally left in the tree but are **not
imported** by the runtime. Do not rewire them; the discrete controller is the
single source of truth for discrete actions.

## What still needs your device

The sandbox proves the code compiles and the logic is wired correctly, but the
following are inherently runtime behaviors to confirm on Windows via
`npm run dev` (and `npm run build` for a production bundle): camera capture,
real mouse/keyboard/scroll injection landing in other apps, the global
emergency-stop hotkey, and live adaptive switching under real signal
degradation. Steps 11–14 above are the ones that can only be judged live.
