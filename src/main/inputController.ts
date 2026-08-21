// ---------------------------------------------------------------------------
// Assistive Control — OS input controller (MAIN process)
//
// The only place that injects real mouse/keyboard input. nut.js is loaded
// LAZILY and OPTIONALLY: if `@nut-tree-fork/nut-js` isn't installed the app
// still runs in "simulation mode" (actions are logged, not performed), so the
// project always builds and launches. Installing the package activates real
// control automatically — no code change needed.
//
//   npm install @nut-tree-fork/nut-js
//
// Every mutating action is gated by the safety module (defense in depth): even
// if the renderer misbehaves, nothing is injected unless control is armed.
// ---------------------------------------------------------------------------

import { canInject } from "./safety";
import type { ScreenSize, InputDiagnostics } from "../shared/ipc";

// nut.js is typed as `any` on purpose: it's an optional native dependency that
// may be absent at type-check time. A variable module specifier keeps tsc from
// trying to resolve it while still allowing a real runtime require.
/* eslint-disable @typescript-eslint/no-explicit-any */
type NutModule = any;

const MODULE_NAME = "@nut-tree-fork/nut-js";

let nut: NutModule | null = null;
let loaded = false;
let real = false;
/** Why real control is unavailable, if it is. */
let loadStatus: InputDiagnostics["status"] = "not-installed";
let loadDetail = "";

// Virtual cursor position for simulation-mode relative moves.
let simX = 0;
let simY = 0;

function loadNut(): NutModule | null {
  if (loaded) return nut;
  loaded = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nut = require(MODULE_NAME);
    real = !!nut;
    if (nut && nut.mouse && nut.mouse.config) {
      nut.mouse.config.autoDelayMs = 0;
      nut.mouse.config.mouseSpeed = 2000;
    }
    if (nut && nut.keyboard && nut.keyboard.config) {
      nut.keyboard.config.autoDelayMs = 0;
    }
    loadStatus = "ready";
    loadDetail = "";
    console.log("[inputController] nut.js loaded — real OS control enabled.");
  } catch (err) {
    nut = null;
    real = false;
    const code = (err as NodeJS.ErrnoException)?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === "MODULE_NOT_FOUND" || /Cannot find module/.test(message)) {
      loadStatus = "not-installed";
      loadDetail = `${MODULE_NAME} is not installed.`;
      console.warn(
        "[inputController] nut.js not installed — SIMULATION mode. " +
          `Run \`npm install ${MODULE_NAME}\` to enable real control.`
      );
    } else {
      // The package is present but failed to initialize (e.g. native bindings
      // couldn't load on this OS/arch). Surface the real error so the user can
      // act on it instead of silently staying in simulation.
      loadStatus = "load-error";
      loadDetail = message;
      console.error(
        "[inputController] nut.js present but failed to load — SIMULATION mode:",
        err
      );
    }
  }
  return nut;
}

/** True once nut.js is available; false while in simulation mode. */
export function isRealInput(): boolean {
  loadNut();
  return real;
}

/** Full diagnostics for the REAL vs SIMULATION status banner (§9/§24). */
export function inputDiagnostics(): InputDiagnostics {
  loadNut();
  if (real) {
    return {
      real: true,
      status: "ready",
      message: "Real OS control is active. Movements move the real mouse and keyboard.",
      moduleName: MODULE_NAME,
      hint: "",
    };
  }
  if (loadStatus === "load-error") {
    return {
      real: false,
      status: "load-error",
      message:
        "Simulation mode: the OS-control module is installed but failed to load, so actions are only logged.",
      moduleName: MODULE_NAME,
      hint:
        `The native module could not initialize on this machine. Try reinstalling with ` +
        `\`npm install ${MODULE_NAME}\` and restarting the app. Details: ${loadDetail}`,
    };
  }
  return {
    real: false,
    status: "not-installed",
    message:
      "Simulation mode: actions are logged to the console but the real mouse and keyboard are NOT moved.",
    moduleName: MODULE_NAME,
    hint: `Run \`npm install ${MODULE_NAME}\` and restart the app to enable real control.`,
  };
}


async function guard(
  label: string,
  fn: () => Promise<void>
): Promise<boolean> {
  if (!canInject()) {
    // Not armed / paused / stopped — silently refuse (expected, not an error).
    return false;
  }
  const n = loadNut();
  if (!n) {
    console.log(`[SIM] ${label}`);
    return true;
  }
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(`[inputController] ${label} failed:`, err);
    return false;
  }
}

export async function getScreenSize(): Promise<ScreenSize> {
  const n = loadNut();
  if (!n) return { width: 1920, height: 1080 };
  try {
    const width = await n.screen.width();
    const height = await n.screen.height();
    return { width, height };
  } catch {
    return { width: 1920, height: 1080 };
  }
}

export async function moveCursorTo(x: number, y: number): Promise<boolean> {
  simX = x;
  simY = y;
  return guard(`moveCursorTo(${x.toFixed(0)}, ${y.toFixed(0)})`, async () => {
    await nut.mouse.setPosition(new nut.Point(Math.round(x), Math.round(y)));
  });
}

export async function moveCursorBy(dx: number, dy: number): Promise<boolean> {
  return guard(`moveCursorBy(${dx.toFixed(1)}, ${dy.toFixed(1)})`, async () => {
    const pos = await nut.mouse.getPosition();
    await nut.mouse.setPosition(
      new nut.Point(Math.round(pos.x + dx), Math.round(pos.y + dy))
    );
  }).then((ok) => {
    if (!ok) {
      simX += dx;
      simY += dy;
    }
    return ok;
  });
}

export async function leftClick(): Promise<boolean> {
  return guard("leftClick", async () => {
    await nut.mouse.leftClick();
  });
}

export async function rightClick(): Promise<boolean> {
  return guard("rightClick", async () => {
    await nut.mouse.rightClick();
  });
}

export async function doubleClick(): Promise<boolean> {
  return guard("doubleClick", async () => {
    if (typeof nut.mouse.doubleClick === "function") {
      await nut.mouse.doubleClick(nut.Button.LEFT);
    } else {
      await nut.mouse.leftClick();
      await nut.mouse.leftClick();
    }
  });
}

export async function scroll(dx: number, dy: number): Promise<boolean> {
  return guard(`scroll(${dx}, ${dy})`, async () => {
    if (dy > 0) await nut.mouse.scrollDown(Math.abs(Math.round(dy)));
    else if (dy < 0) await nut.mouse.scrollUp(Math.abs(Math.round(dy)));
    if (dx > 0) await nut.mouse.scrollRight(Math.abs(Math.round(dx)));
    else if (dx < 0) await nut.mouse.scrollLeft(Math.abs(Math.round(dx)));
  });
}

function resolveKey(name: string): unknown | null {
  if (!nut || !nut.Key) return null;
  const K = nut.Key;
  const map: Record<string, unknown> = {
    enter: K.Enter,
    return: K.Enter,
    space: K.Space,
    tab: K.Tab,
    escape: K.Escape,
    esc: K.Escape,
    up: K.Up,
    down: K.Down,
    left: K.Left,
    right: K.Right,
    backspace: K.Backspace,
    delete: K.Delete,
    home: K.Home,
    end: K.End,
    pageup: K.PageUp,
    pagedown: K.PageDown,
  };
  const key = map[name.toLowerCase()];
  return key === undefined ? null : key;
}

export async function keyPress(key: string): Promise<boolean> {
  return guard(`keyPress(${key})`, async () => {
    const resolved = resolveKey(key);
    if (resolved !== null) {
      await nut.keyboard.type(resolved);
    } else {
      await nut.keyboard.type(key);
    }
  });
}

export async function typeText(text: string): Promise<boolean> {
  return guard(`typeText(${JSON.stringify(text)})`, async () => {
    await nut.keyboard.type(text);
  });
}
