// ---------------------------------------------------------------------------
// Assistive Control — preload bridge
//
// Exposes a minimal, typed API on window.electronAPI via the context bridge.
// The renderer never touches Node or ipcRenderer directly (contextIsolation);
// every OS action is a request the main process validates against safety.
// ---------------------------------------------------------------------------

import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc";
import type {
  ElectronAPI,
  ScreenSize,
  SafetyState,
  InputDiagnostics,
  LaunchableApp,
  AppLaunchResult,
} from "../shared/ipc";

const api: ElectronAPI = {
  isElectron: true,

  input: {
    getScreenSize: (): Promise<ScreenSize> =>
      ipcRenderer.invoke(IPC.INPUT_SCREEN_SIZE),
    moveCursorTo: (x: number, y: number): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INPUT_MOVE_TO, x, y),
    moveCursorBy: (dx: number, dy: number): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INPUT_MOVE_BY, dx, dy),
    leftClick: (): Promise<boolean> => ipcRenderer.invoke(IPC.INPUT_LEFT_CLICK),
    rightClick: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INPUT_RIGHT_CLICK),
    middleClick: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INPUT_MIDDLE_CLICK),
    doubleClick: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INPUT_DOUBLE_CLICK),
    scroll: (dx: number, dy: number): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INPUT_SCROLL, dx, dy),
    keyPress: (key: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INPUT_KEY_PRESS, key),
    typeText: (text: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INPUT_TYPE_TEXT, text),
    isRealInput: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INPUT_IS_REAL),
    inputDiagnostics: (): Promise<InputDiagnostics> =>
      ipcRenderer.invoke(IPC.INPUT_DIAGNOSTICS),
  },

  safety: {
    arm: (): Promise<SafetyState> => ipcRenderer.invoke(IPC.SAFETY_ARM),
    disarm: (): Promise<SafetyState> => ipcRenderer.invoke(IPC.SAFETY_DISARM),
    pause: (): Promise<SafetyState> => ipcRenderer.invoke(IPC.SAFETY_PAUSE),
    resume: (): Promise<SafetyState> => ipcRenderer.invoke(IPC.SAFETY_RESUME),
    stop: (): Promise<SafetyState> => ipcRenderer.invoke(IPC.SAFETY_STOP),
    getState: (): Promise<SafetyState> =>
      ipcRenderer.invoke(IPC.SAFETY_GET_STATE),

    onStateChange: (cb: (state: SafetyState) => void): (() => void) => {
      const listener = (_e: unknown, state: SafetyState): void => cb(state);
      ipcRenderer.on(IPC.SAFETY_STATE_CHANGED, listener);
      return () => {
        ipcRenderer.removeListener(IPC.SAFETY_STATE_CHANGED, listener);
      };
    },

    onEmergencyStop: (cb: () => void): (() => void) => {
      const listener = (): void => cb();
      ipcRenderer.on(IPC.SAFETY_EMERGENCY_STOP, listener);
      return () => {
        ipcRenderer.removeListener(IPC.SAFETY_EMERGENCY_STOP, listener);
      };
    },
  },

  profile: {
    load: (): Promise<unknown | null> => ipcRenderer.invoke(IPC.PROFILE_LOAD),
    save: (profile: unknown): Promise<boolean> =>
      ipcRenderer.invoke(IPC.PROFILE_SAVE, profile),
    clear: (): Promise<boolean> => ipcRenderer.invoke(IPC.PROFILE_CLEAR),
  },

  apps: {
    list: (): Promise<LaunchableApp[]> => ipcRenderer.invoke(IPC.APP_LIST),
    launch: (id: string): Promise<AppLaunchResult> =>
      ipcRenderer.invoke(IPC.APP_LAUNCH, id),
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
