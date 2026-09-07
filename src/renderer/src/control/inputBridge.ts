// ---------------------------------------------------------------------------
// Assistive Control — renderer input bridge
//
// Thin accessor for the OS-input API exposed by the preload script. All OS
// mouse/keyboard actions in the renderer go through here, which forwards to
// the main process (PHASE 5 security model — the renderer never injects input
// directly). When the bridge is absent (e.g. a plain browser dev context) a
// no-op port keeps controllers runnable without touching the OS.
// ---------------------------------------------------------------------------

import type { ElectronAPI, ScreenSize } from "../../../shared/ipc";

export type InputPort = ElectronAPI["input"];

const noopInput: InputPort = {
  getScreenSize: async (): Promise<ScreenSize> => ({ width: 1920, height: 1080 }),
  moveCursorTo: async (): Promise<boolean> => false,
  moveCursorBy: async (): Promise<boolean> => false,
  leftClick: async (): Promise<boolean> => false,
  rightClick: async (): Promise<boolean> => false,
  middleClick: async (): Promise<boolean> => false,
  doubleClick: async (): Promise<boolean> => false,
  scroll: async (): Promise<boolean> => false,
  keyPress: async (): Promise<boolean> => false,
  typeText: async (): Promise<boolean> => false,
  isRealInput: async (): Promise<boolean> => false,
  inputDiagnostics: async () => ({
    real: false,
    status: "not-installed" as const,
    message:
      "Simulation mode: running outside the desktop app, so actions are not sent to the OS.",
    moduleName: "@nut-tree-fork/nut-js",
    hint: "Launch the packaged desktop app to enable real control.",
  }),
};

/** The live input port, or a no-op fallback outside Electron. */
export function getInput(): InputPort {
  if (typeof window !== "undefined" && window.electronAPI) {
    return window.electronAPI.input;
  }
  return noopInput;
}

let cachedScreen: ScreenSize | null = null;

/** Screen size, cached after the first successful lookup. */
export async function getScreenSize(): Promise<ScreenSize> {
  if (cachedScreen) return cachedScreen;
  const size = await getInput().getScreenSize();
  cachedScreen = size;
  return size;
}

/** Force a re-query of the screen size (e.g. resolution changed). */
export function invalidateScreenSize(): void {
  cachedScreen = null;
}
