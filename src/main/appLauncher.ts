// ---------------------------------------------------------------------------
// Assistive Control — application launcher (MAIN process, §14)
//
// Launches a small, curated ALLOW-LIST of everyday apps (browser, notepad,
// calculator, code editor, file manager) on behalf of the user. The renderer
// can only ask for an app by `id` — it can never pass a raw command — so the
// movement-control system can't be abused to execute arbitrary programs.
//
// Each app maps to a platform-specific command. Launches are detached and
// their I/O is ignored so the child outlives (and never blocks) this process.
// A spawn that emits no early "error" is reported as launched; a missing app
// surfaces a friendly message rather than throwing.
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import type { LaunchableApp, AppLaunchResult } from "../shared/ipc";

type Platform = "win32" | "darwin" | "linux";
type Command = { cmd: string; args: string[] };

/** One catalog entry: a stable id, a friendly label, and per-OS commands. */
type AppEntry = {
  id: string;
  label: string;
  commands: Partial<Record<Platform, Command>>;
};

// On Windows, `cmd /c start "" <thing>` resolves registered apps, App Execution
// Aliases (e.g. calc), and PATH entries uniformly, and returns immediately.
function winStart(target: string, extra: string[] = []): Command {
  return { cmd: "cmd", args: ["/c", "start", "", target, ...extra] };
}

const CATALOG: AppEntry[] = [
  {
    id: "browser",
    label: "Web browser",
    commands: {
      win32: winStart("chrome"),
      darwin: { cmd: "open", args: ["-a", "Google Chrome"] },
      linux: { cmd: "xdg-open", args: ["https://"] },
    },
  },
  {
    id: "notepad",
    label: "Notepad",
    commands: {
      win32: { cmd: "notepad.exe", args: [] },
      darwin: { cmd: "open", args: ["-a", "TextEdit"] },
      linux: { cmd: "gedit", args: [] },
    },
  },
  {
    id: "calculator",
    label: "Calculator",
    commands: {
      win32: winStart("calc:"),
      darwin: { cmd: "open", args: ["-a", "Calculator"] },
      linux: { cmd: "gnome-calculator", args: [] },
    },
  },
  {
    id: "vscode",
    label: "VS Code",
    commands: {
      win32: winStart("code"),
      darwin: { cmd: "open", args: ["-a", "Visual Studio Code"] },
      linux: { cmd: "code", args: [] },
    },
  },
  {
    id: "files",
    label: "File manager",
    commands: {
      win32: { cmd: "explorer.exe", args: [] },
      darwin: { cmd: "open", args: ["."] },
      linux: { cmd: "xdg-open", args: ["."] },
    },
  },
];

function currentPlatform(): Platform {
  const p = process.platform;
  if (p === "win32" || p === "darwin") return p;
  return "linux";
}

/** The allow-list for this platform, flagged by whether a command exists. */
export function listApps(): LaunchableApp[] {
  const platform = currentPlatform();
  return CATALOG.map((a) => ({
    id: a.id,
    label: a.label,
    available: Boolean(a.commands[platform]),
  }));
}

/** Launch an allow-listed app by id. Never executes a renderer-supplied command. */
export function launchApp(id: string): Promise<AppLaunchResult> {
  const entry = CATALOG.find((a) => a.id === id);
  if (!entry) {
    return Promise.resolve({
      ok: false,
      message: `Unknown app "${id}".`,
    });
  }
  const command = entry.commands[currentPlatform()];
  if (!command) {
    return Promise.resolve({
      ok: false,
      message: `${entry.label} isn't available on this system.`,
    });
  }

  return new Promise<AppLaunchResult>((resolve) => {
    let settled = false;
    const done = (result: AppLaunchResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const child = spawn(command.cmd, command.args, {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });

      child.on("error", (err) => {
        console.error(`[appLauncher] failed to launch ${entry.label}:`, err);
        done({
          ok: false,
          message: `Couldn't open ${entry.label}. It may not be installed.`,
        });
      });

      // Let the child run independently of this process.
      child.unref();

      // No synchronous/early error within a short window => treat as launched.
      setTimeout(() => done({ ok: true, message: `Opened ${entry.label}.` }), 250);
    } catch (err) {
      console.error(`[appLauncher] spawn threw for ${entry.label}:`, err);
      done({
        ok: false,
        message: `Couldn't open ${entry.label}. It may not be installed.`,
      });
    }
  });
}
