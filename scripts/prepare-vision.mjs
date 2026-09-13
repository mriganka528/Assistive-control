import { cp, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const visionRoot = dirname(require.resolve("@mediapipe/tasks-vision"));
const publicRoot = join(root, "src/renderer/public");

// Always copy WASM from the same package version as the bundled JS API.
const wasmRoot = join(publicRoot, "wasm");
await mkdir(wasmRoot, { recursive: true });
for (const name of await readdir(join(visionRoot, "wasm"))) {
  if (name.endsWith(".js") || name.endsWith(".wasm")) {
    await cp(join(visionRoot, "wasm", name), join(wasmRoot, name));
  }
}

if (process.argv.includes("--require-models")) {
  for (const name of ["face_landmarker.task", "hand_landmarker.task"]) {
    const model = join(publicRoot, "models", name);
    const info = await stat(model).catch(() => null);
    if (!info || info.size < 10_000) {
      throw new Error(
        `${name} is missing or incomplete. Download the models described in ` +
          "src/renderer/public/models/README.md before building a distribution.",
      );
    }
    const bytes = await readFile(model);
    // MediaPipe .task models are ZIP bundles (some have a two-byte prefix).
    if (bytes.indexOf(Buffer.from("PK\x03\x04")) > 8 || !bytes.includes(Buffer.from("PK\x03\x04"))) {
      throw new Error(`${name} is not a MediaPipe model bundle.`);
    }
  }
}

console.log("Local MediaPipe runtime is ready.");
