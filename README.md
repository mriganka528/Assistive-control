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
processed and stored **only on this device**. Both tracking models and the
MediaPipe WASM runtime are bundled locally, so tracking also works offline.
No accounts, no cloud, no analytics.

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

## Build a standalone Windows EXE

On a Windows x64 build machine with Node.js installed:

```bash
npm install
npm run dist:win
```

The build checks the types, copies the matching MediaPipe WASM runtime, verifies
both model files, and packages the application using electron-builder 26.0.12.
The packaging tool is downloaded by `npx` on first use. The model files must be
downloaded before building, as described in the models README above.

Copy either of these files from `release/` to the other PC:

- **`Assistive-Control-Portable-x64.exe`**: double-click to run without installing.
  At startup it extracts its bundled files to a temporary directory.
- **`Assistive-Control-Setup-x64.exe`**: install for the current Windows user,
  with desktop and Start menu shortcuts.

The receiving PC needs **Windows 10/11, 64-bit Intel or AMD**, a working webcam,
and permission for desktop apps to access the camera. It does **not** need Node.js,
npm, the source project, separately installed model files, or an internet
connection. Electron, the native input module and its Visual C++ DLLs, and both
tracking models are included. Profiles are stored separately for each Windows
user under `%APPDATA%/assistive-control`.

These are unsigned builds; Windows may show an unknown-publisher or SmartScreen
prompt. The EXE inside `release/win-unpacked/` requires that entire folder;
use the top-level portable or setup EXE when sharing a single file.

## Showcase website

The standalone Next.js product site lives in
[`showcase-website/`](showcase-website/README.md). It includes downloads,
application screenshots, and setup guidance. For Vercel, set the project's
**Root Directory** to **`showcase-website`** and use the **Next.js** preset.

## Safety

Live Control arms automatically when its camera is ready. Learn **Pause** and
**Emergency stop** before starting a session. The global emergency-stop hotkey
(`Ctrl+Shift+X`) works even when the window isn't focused. Control automatically
freezes when the face is lost or tracking confidence drops, and leaving the
control screen always disarms.
