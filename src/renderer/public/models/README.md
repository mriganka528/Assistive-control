# MediaPipe model files

Assistive Control uses two on-device MediaPipe models. They are loaded from this
folder at runtime and served by Vite at `/models/…`, so **the files must live
here**: `src/renderer/public/models/`.

| File | Purpose | Required? | Approx size |
|------|---------|-----------|-------------|
| `face_landmarker.task` | Face landmarks + blendshapes (eyes, brows, mouth, jaw, head pose). Drives the core face-based controls. | **Yes** | ~3.6 MB |
| `hand_landmarker.task` | Hand/finger landmarks. Adds optional hand movements as extra controls. | No (app runs face-only without it) | ~7.5 MB |

Everything runs locally — these files are never uploaded and the app makes no
network calls for inference. `npm run dev` and `npm run build` copy the matching
WASM runtime from the installed MediaPipe package into `public/wasm/`. Packaged
apps include that runtime and both models, and load them from a secure local
`app://` origin without an internet connection.

## Downloading the models

The models come from Google's public MediaPipe model catalog. Download each file
and save it in this folder with the exact filename above.

**Face Landmarker** → save as `face_landmarker.task`

```
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

**Hand Landmarker** → save as `hand_landmarker.task`

```
https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
```

Example (PowerShell / any shell with `curl`):

```
curl -L -o face_landmarker.task "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
curl -L -o hand_landmarker.task "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
```

Run those from inside `src/renderer/public/models/`, then restart the app.

## If a model is missing

- **`face_landmarker.task` missing** → face detection can't start; core controls
  won't work. Download it as above.
- **`hand_landmarker.task` missing** → the app keeps working **face-only**. It is
  not silent about this: the Live Control screen shows a notice explaining hand
  tracking is off and pointing back to this file. Add the file and restart to
  enable hand movements as additional controls.

## Note for contributors

Production builds require both model files so the distributed app includes
hand tracking. Development still supports face-only use without the hand model.

These `.task` files are binary and large. If you use Git LFS, make sure they are
pulled (`git lfs pull`) — a repository that stores only the LFS pointer will
appear to have the files but they'll be a few hundred bytes, which the app
detects as a missing model.
