// ---------------------------------------------------------------------------
// Assistive Control — renderer apps bridge (§14)
//
// Thin accessor for the app-launching API exposed by preload. Outside Electron
// (e.g. a plain browser dev context) it returns an empty catalog and a friendly
// "not available" result, so the UI stays runnable without the desktop shell.
// ---------------------------------------------------------------------------

import type { ElectronAPI, LaunchableApp, AppLaunchResult } from "../../../shared/ipc";

export type AppsPort = ElectronAPI["apps"];

const noopApps: AppsPort = {
  list: async (): Promise<LaunchableApp[]> => [],
  launch: async (): Promise<AppLaunchResult> => ({
    ok: false,
    message: "App launching is only available in the desktop app.",
  }),
};

/** The live apps port, or a no-op fallback outside Electron. */
export function getApps(): AppsPort {
  if (typeof window !== "undefined" && window.electronAPI) {
    return window.electronAPI.apps;
  }
  return noopApps;
}
