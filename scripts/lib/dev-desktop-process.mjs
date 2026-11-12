/** Single background dev process — pid file, no extra terminal windows. */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { stealthElectronEnv } from "./stealth-electron-env.mjs";
import { winSpawnOpts } from "./win-spawn.mjs";
import {
  listProcessesNative,
  readProcessCommandLineNative,
  readProcessExePathNative,
} from "../../../scripts/lib/win-native-proc-net.mjs";

const require = createRequire(import.meta.url);
const { DEFAULT_PROD_API_PORT, DEFAULT_DEV_API_PORT } = require("../../electron/lib/user-data-root.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PID_FILE = path.join(root, ".dev-desktop.pid");
export const LOG_FILE = path.join(root, ".dev-desktop.log");
const WATCH_PID_FILE = path.join(root, ".dev-desktop-watch.pid");

const DEV_SCRIPT_RE = /dev-node\.mjs|dev-desktop-only\.mjs|dev-desktop-reload\.mjs|reload-and-verify-p0003\.mjs/i;
const ELECTRON_CLI_RE = /electron[/\\]cli\.js/i;
const PRODUCT_ROOT_RE = /P0003-Stealth-Browser-Console/i;

/** True when command line belongs to this tool's dev orchestrator (not packaged Setup.exe). */
export function isStealthDevCommandLine(commandLine) {
  const cmd = String(commandLine || "");
  if (!cmd) return false;
  if (PRODUCT_ROOT_RE.test(cmd) && DEV_SCRIPT_RE.test(cmd)) return true;
  if (PRODUCT_ROOT_RE.test(cmd) && ELECTRON_CLI_RE.test(cmd)) return true;
  // dev-desktop-only stores `node …/electron/cli.js .` or `…/electron.exe "."` — hoisted path has no P0003 folder in cmdline.
  if (ELECTRON_CLI_RE.test(cmd) && /\s"?\."?\s*$/.test(cmd.trim())) return true;
  if (/electron\.exe/i.test(cmd) && /\s"?\."?\s*$/.test(cmd.trim())) return true;
  return false;
}

/** Electron renderer/gpu from dev-desktop-only (isolated userData). Never packaged prod. */
export function isStealthDevElectronProcess(commandLine) {
  const cmd = String(commandLine || "");
  if (!cmd) return false;
  return /electron\.exe/i.test(cmd) && /stealth-browser-console-dev/i.test(cmd);
}

export function readDevPid() {
  try {
    const n = Number(fs.readFileSync(PID_FILE, "utf8").trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readProcessCommandLine(pid) {
  if (process.platform !== "win32") return "";
  const nat = readProcessCommandLineNative(pid);
  if (nat !== null) return nat.trim();
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -ErrorAction SilentlyContinue).CommandLine`,
    ],
    winSpawnOpts({ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
  );
  return String(result.stdout || "").trim();
}

export function isStealthDevPid(pid) {
  if (!pid || !isPidAlive(pid)) return false;
  const cmd = readProcessCommandLine(pid);
  if (cmd) return isStealthDevCommandLine(cmd);
  // Non-Windows or query failed — trust pid file only when process is node running our scripts.
  return false;
}

/** True when dev-desktop-only Electron orchestrator is alive (pid file + electron/cli.js). */
export function isStealthDevRunning() {
  const pid = readDevPid();
  return Boolean(pid && isStealthDevPid(pid));
}

export function clearPidFile() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

function killDevPorts() {
  const killPort = path.join(root, "scripts", "kill-port.cjs");
  if (!fs.existsSync(killPort)) return;
  // Dev stack only — never :6003 (packaged prod API).
  spawnSync(
    process.execPath,
    [killPort, String(5175), String(DEFAULT_DEV_API_PORT)],
    winSpawnOpts({ cwd: root, stdio: "ignore" }),
  );
}

function killWatchBuild() {
  try {
    const pid = Number(fs.readFileSync(WATCH_PID_FILE, "utf8").trim());
    if (Number.isFinite(pid) && pid > 0 && isPidAlive(pid)) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], winSpawnOpts({ stdio: "ignore" }));
      } else {
        process.kill(pid, "SIGTERM");
      }
    }
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(WATCH_PID_FILE);
  } catch {
    /* ignore */
  }
}

function killOrphanDevElectron() {
  if (process.platform !== "win32") return;
  const natProcs = listProcessesNative({ imageNames: ["electron.exe"], includeCmdline: true });
  if (natProcs) {
    const ids = new Set();
    for (const p of natProcs) {
      if (/stealth-browser-console-dev|P0003-Stealth-Browser-Console/i.test(String(p.cmd || ""))) {
        if (p.pid > 0) ids.add(p.pid);
        if (p.ppid > 0) ids.add(p.ppid);
      }
    }
    for (const id of ids) {
      const exe = readProcessExePathNative(id) || "";
      if (/(?:electron|nodew?)\.exe$/i.test(exe)) {
        spawnSync("taskkill", ["/PID", String(id), "/T", "/F"], winSpawnOpts({ stdio: "ignore" }));
      }
    }
    return;
  }
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "$procs = Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" -ErrorAction SilentlyContinue",
        "| Where-Object { $_.CommandLine -match 'stealth-browser-console-dev|P0003-Stealth-Browser-Console' }",
        "$ids = @($procs | ForEach-Object { $_.ProcessId; $_.ParentProcessId } | Where-Object { $_ -gt 0 } | Select-Object -Unique)",
        "foreach ($id in $ids) {",
        "  $p = Get-CimInstance Win32_Process -Filter \"ProcessId=$id\" -ErrorAction SilentlyContinue",
        "  if ($p -and ($p.Name -match 'electron|node')) {",
        "    cmd /c \"taskkill /PID $id /T /F >nul 2>&1\"",
        "  }",
        "}",
      ].join("; "),
    ],
    winSpawnOpts({ stdio: "ignore" }),
  );
}

export function killStealthDev({ force = false } = {}) {
  const allowKill = force || process.env.STEALTH_FORCE_KILL_DEV === "1";
  if (!allowKill && isStealthDevRunning()) {
    console.log(
      `[dev-desktop] Dev Exe (:${DEFAULT_DEV_API_PORT}) is already running — skipping kill without STEALTH_FORCE_KILL_DEV=1`,
    );
    return;
  }
  const pid = readDevPid();
  if (pid && isStealthDevPid(pid)) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], winSpawnOpts({ stdio: "ignore" }));
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch {
      /* ignore */
    }
  } else if (pid) {
    console.warn(
      `[dev-desktop] skip taskkill PID ${pid} — not a Stealth dev orchestrator (protect packaged :${DEFAULT_PROD_API_PORT})`,
    );
  }
  clearPidFile();
  if (allowKill) {
    killOrphanDevElectron();
  }
  killWatchBuild();
  killDevPorts();
}

/** Spawn dev-node detached — one process, log to .dev-desktop.log, Electron window only. */
export function startDevDetached() {
  const { startHiddenDetachedProcess } = require("../../../scripts/lib/win-shell-env.cjs");
  return startHiddenDetachedProcess({
    command: process.execPath,
    args: [path.join(root, "scripts", "dev-node.mjs")],
    cwd: root,
    logFile: LOG_FILE,
    pidFile: PID_FILE,
    writePid: (file, childPid) => fs.writeFileSync(file, String(childPid)),
    env: stealthElectronEnv({ STEALTH_DEV_LOG: "1" }),
  });
}

export function focusStealthWindow() {
  if (process.platform !== "win32") return;
  if (process.env.STEALTH_AGENT_SMOKE === "1" || process.env.STEALTH_DEV_NO_FOCUS === "1") return;
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "$devPort = " + DEFAULT_DEV_API_PORT,
        "$p = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'Stealth' } | Select-Object -First 1",
        "if ($p -and $p.MainWindowHandle -ne 0) {",
        "  Add-Type 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h); }'",
        "  [void][W]::SetForegroundWindow($p.MainWindowHandle)",
        "}",
      ].join(" "),
    ],
    winSpawnOpts({ stdio: "ignore" }),
  );
}
