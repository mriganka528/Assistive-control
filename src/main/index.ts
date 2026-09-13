import {
  app,
  BrowserWindow,
  session,
  ipcMain,
  globalShortcut,
  powerSaveBlocker,
  protocol,
  net,
} from "electron";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";

import { IPC } from "../shared/ipc";
import * as safety from "./safety";
import { listApps, launchApp } from "./appLauncher";
import {
  getScreenSize,
  moveCursorTo,
  moveCursorBy,
  leftClick,
  rightClick,
  middleClick,
  doubleClick,
  scroll,
  keyPress,
  typeText,
  isRealInput,
  inputDiagnostics,
} from "./inputController";

// A secure local origin lets MediaPipe fetch bundled models/WASM and keeps
// camera APIs available without a web server or internet connection.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function registerLocalAssets(): void {
  const rendererRoot = resolve(__dirname, "../renderer");
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    if (url.host !== "local" || !["GET", "HEAD"].includes(request.method)) {
      return new Response("Not found", { status: 404 });
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const asset = resolve(rendererRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
    const relativePath = relative(rendererRoot, asset);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(asset).href, { method: request.method });
  });
}

// ---------------------------------------------------------------------------
// Profile storage (local JSON in the OS userData directory — never uploaded)
// ---------------------------------------------------------------------------

function profilePath(): string {
  return join(app.getPath("userData"), "profile.json");
}

async function loadProfileFile(): Promise<unknown | null> {
  try {
    const text = await fs.readFile(profilePath(), "utf-8");
    return JSON.parse(text);
  } catch {
    return null; // no profile yet, or unreadable
  }
}

async function saveProfileFile(profile: unknown): Promise<boolean> {
  try {
    await fs.writeFile(profilePath(), JSON.stringify(profile, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("[main] failed to save profile:", err);
    return false;
  }
}

async function clearProfileFile(): Promise<boolean> {
  try {
    await fs.unlink(profilePath());
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// IPC wiring
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  // Input controller
  ipcMain.handle(IPC.INPUT_SCREEN_SIZE, () => getScreenSize());
  ipcMain.handle(IPC.INPUT_MOVE_TO, (_e, x: number, y: number) =>
    moveCursorTo(x, y)
  );
  ipcMain.handle(IPC.INPUT_MOVE_BY, (_e, dx: number, dy: number) =>
    moveCursorBy(dx, dy)
  );
  ipcMain.handle(IPC.INPUT_LEFT_CLICK, () => leftClick());
  ipcMain.handle(IPC.INPUT_RIGHT_CLICK, () => rightClick());
  ipcMain.handle(IPC.INPUT_MIDDLE_CLICK, () => middleClick());
  ipcMain.handle(IPC.INPUT_DOUBLE_CLICK, () => doubleClick());
  ipcMain.handle(IPC.INPUT_SCROLL, (_e, dx: number, dy: number) =>
    scroll(dx, dy)
  );
  ipcMain.handle(IPC.INPUT_KEY_PRESS, (_e, key: string) => keyPress(key));
  ipcMain.handle(IPC.INPUT_TYPE_TEXT, (_e, text: string) => typeText(text));
  ipcMain.handle(IPC.INPUT_IS_REAL, () => isRealInput());
  ipcMain.handle(IPC.INPUT_DIAGNOSTICS, () => inputDiagnostics());

  // Safety
  ipcMain.handle(IPC.SAFETY_ARM, () => safety.arm());
  ipcMain.handle(IPC.SAFETY_DISARM, () => safety.disarm());
  ipcMain.handle(IPC.SAFETY_PAUSE, () => safety.pause());
  ipcMain.handle(IPC.SAFETY_RESUME, () => safety.resume());
  ipcMain.handle(IPC.SAFETY_STOP, () => safety.emergencyStop());
  ipcMain.handle(IPC.SAFETY_GET_STATE, () => safety.getState());

  // Profile persistence
  ipcMain.handle(IPC.PROFILE_LOAD, () => loadProfileFile());
  ipcMain.handle(IPC.PROFILE_SAVE, (_e, profile: unknown) =>
    saveProfileFile(profile)
  );
  ipcMain.handle(IPC.PROFILE_CLEAR, () => clearProfileFile());

  // Application launching (§14)
  ipcMain.handle(IPC.APP_LIST, () => listApps());
  ipcMain.handle(IPC.APP_LAUNCH, (_e, id: string) => launchApp(id));
}

/** Push safety-state changes to every renderer window. */
function broadcastSafety(): void {
  safety.onChange((state, emergency) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.SAFETY_STATE_CHANGED, state);
      if (emergency) {
        win.webContents.send(IPC.SAFETY_EMERGENCY_STOP);
      }
    }
    // Hold off OS sleep / app-nap only while control is actually running, so a
    // minimized-but-active session keeps driving the real cursor. Released as
    // soon as control is paused, stopped, or disarmed.
    updatePowerBlocker(state.armed && !state.paused && !state.stopped);
  });
}

// Keep the machine (and this process) awake while control is active so the
// background detection loop isn't suspended when the window is minimized.
let powerBlockerId: number | null = null;
function updatePowerBlocker(active: boolean): void {
  if (active) {
    if (powerBlockerId === null || !powerSaveBlocker.isStarted(powerBlockerId)) {
      powerBlockerId = powerSaveBlocker.start("prevent-app-suspension");
    }
  } else if (powerBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId);
    }
    powerBlockerId = null;
  }
}

// ---------------------------------------------------------------------------
// Window / app lifecycle
// ---------------------------------------------------------------------------

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: join(__dirname, "../../build/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Assistive control MUST keep running when the window is minimized or in
      // the background — the whole point is to drive the real OS cursor while
      // the user works in other apps. Chromium otherwise throttles/suspends
      // timers, rAF, and the webcam pipeline for hidden windows, which froze
      // the cursor the moment the app lost focus. Disable that throttling so
      // the detection loop keeps ticking at full rate in the background.
      backgroundThrottling: false,
    },
  });

  // Also stop the renderer being told it's "hidden" from clamping timers to
  // ~1fps, and keep the media/animation pipeline warm while backgrounded.
  win.webContents.setBackgroundThrottling(false);

  // In development electron-vite serves the renderer from a dev server and
  // exposes its URL via ELECTRON_RENDERER_URL. In production we load the
  // built renderer from disk.
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  if (!app.isPackaged && rendererUrl) {
    win.loadURL(rendererUrl);
    win.webContents.openDevTools();
  } else {
    win.loadURL("app://local/index.html");
  }
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("org.assistivecontrol.desktop");
  }
  registerLocalAssets();
  // Allow the renderer to use the webcam (video only).
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, _requestingOrigin, details) => {
      if (permission === "media" && details?.mediaType === "video") {
        return true;
      }
      return false;
    }
  );
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === "media") {
        callback(true);
        return;
      }
      callback(false);
    }
  );

  registerIpcHandlers();
  broadcastSafety();

  // Global emergency stop — works even if the app is not focused.
  const ok = globalShortcut.register("CommandOrControl+Shift+X", () => {
    console.warn("[safety] EMERGENCY STOP (global hotkey)");
    safety.emergencyStop();
  });
  if (!ok) {
    console.warn("[safety] failed to register emergency-stop hotkey");
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Quit when all windows are closed, except on macOS.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
