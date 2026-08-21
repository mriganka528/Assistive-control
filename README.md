# Assistive Control

A Windows desktop assistive-technology app that lets a person operate their
computer — move the pointer, click, scroll, type, and launch apps — using
whatever small, repeatable movements they can reliably make. Movement is
captured from the webcam with on-device MediaPipe face and hand tracking. The
app is **movement-agnostic**: it never assumes a blink, smile, or gaze. Instead
it *discovers* which movements a given person can perform reliably and maps
those to controls, then adapts as the person's usable movement changes.

Everything runs locally. No video, landmarks, calibration, or profile data ever
leaves the device — there is no backend, no account, and no telemetry.

## How it works

1. **Calibrate.** The app records a short resting baseline, then asks the person
   to try a series of movements. A movement-agnostic analyzer scores each one
   for separability (Cohen's *d* against baseline), consistency, and
   controllability, and keeps the ones that are genuinely reliable — regardless
   of *which* facial or hand movement they are.
2. **Map.** The strongest movements are assigned to controls
   (`movementMapper.ts`): directional movements drive the cursor and scroll;
   discrete movements drive left-click, right-click, and confirm. When a person
   has only one or two reliable movements, a single movement can serve several
   commands through multi-stage patterns — perform it **once**, **twice**, or
   **hold** it.
3. **Control.** The live loop merges face + hand signals each frame and drives a
   safety-gated runtime (`controlRuntime.ts`) that issues real Windows mouse and
   keyboard input.
4. **Adapt.** A reliability monitor tracks each control over a rolling window. If
   a control degrades, the app either proposes a better movement (assisted,
   default) or switches automatically — but it never disables a working control
   just because its confidence dropped, and it never switches when no better
   alternative exists.

## Real input, not simulation

Actions are executed as real OS input through `@nut-tree-fork/nut-js` in the
main process (`inputController.ts`). If the native module can't load on a given
machine, the app falls back to a clearly-labeled simulation mode **and tells the
person why**, with a fix — it never silently pretends to work. The current input
mode (real vs simulation) is shown in-app via the Input Mode banner.

## Privacy

Camera frames, derived signals, calibration data, and the saved profile are all
processed and stored **only on this device**. There is no network activity for
inference; the sole remote fetch is the MediaPipe WASM runtime from a CDN at
startup. No accounts, no cloud, no analytics.

## Tech stack

Electron 43 · React 19 · TypeScript 6 · Vite 7 (via electron-vite 5) ·
MediaPipe Tasks Vision · nut.js (community fork).

The main and preload processes are compiled to CommonJS; the renderer is a Vite
React app. `contextIsolation` is on and `nodeIntegration` is off — the renderer
talks to the main process only through a typed `contextBridge` API
(`src/shared/ipc.ts`, `src/preload/index.ts`).

## Project layout

```
src/
  main/        Electron main: input injection, app launcher, safety, IPC
  preload/     Typed contextBridge API
  shared/      IPC channel + payload types
  vision/      MediaPipe face & hand landmarkers, feature extraction
  renderer/
    src/
      calibration/  baseline recorder, analyzer, profile, types
      control/      per-control controllers, movement->control mapping
      adaptive/     reliability monitor, switching manager, re-baseline
      runtime/      per-frame control orchestrator (safety-gated)
      components/    React screens (Home, CameraView, ControlView, Settings, …)
      hooks/         safety hook
  renderer/public/models/   MediaPipe .task model files (see that README)
```

## Getting started

```bash
npm install
npm run dev        # launch the app in development
```

MediaPipe model files are required. See
[`src/renderer/public/models/README.md`](src/renderer/public/models/README.md)
for what to download and where to put it. The face model is required; the hand
model is optional (the app runs face-only without it, and says so).

## Verifying the build

```bash
npm run typecheck  # type-checks both the main/preload and renderer projects
npm run build      # production build (electron-vite)
```

`npm run typecheck` runs the TypeScript compiler over both tsconfig projects with
`--noEmit`; both must pass with no errors.

See [`ACCEPTANCE.md`](ACCEPTANCE.md) for the full acceptance checklist and how
each requirement is satisfied.

## Safety

Live control is gated behind an explicit **Arm** action and offers
**pause / resume / disarm / emergency-stop** at all times, plus a global
emergency-stop hotkey (`Ctrl+Shift+X`) that works even when the window isn't
focused. Control automatically freezes when the face is lost or tracking
confidence drops, and leaving the control screen always disarms.
