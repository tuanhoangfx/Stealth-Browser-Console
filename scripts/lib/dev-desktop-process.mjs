/** Single background dev process — pid file, no extra terminal windows. */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stealthElectronEnv } from "./stealth-electron-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PID_FILE = path.join(root, ".dev-desktop.pid");
export const LOG_FILE = path.join(root, ".dev-desktop.log");

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

export function clearPidFile() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

export function killStealthDev() {
  const pid = readDevPid();
  if (pid && isPidAlive(pid)) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch {
      /* ignore */
    }
  }
  clearPidFile();

  if (process.platform === "win32") {
    spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        [
          "Get-NetTCPConnection -LocalPort 5175 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }",
          "Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",
        ].join("; "),
      ],
      { stdio: "ignore" },
    );
  }
}

/** Spawn dev-node detached — one process, log to .dev-desktop.log, Electron window only. */
export function startDevDetached() {
  const logFd = fs.openSync(LOG_FILE, "a");
  fs.writeFileSync(
    LOG_FILE,
    `\n--- dev start ${new Date().toISOString()} ---\n`,
    { flag: "a" },
  );
  const child = spawn(process.execPath, [path.join(root, "scripts", "dev-node.mjs")], {
    cwd: root,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: stealthElectronEnv(),
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  return child.pid;
}

export function focusStealthWindow() {
  if (process.platform !== "win32") return;
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "$p = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'Stealth' } | Select-Object -First 1",
        "if ($p -and $p.MainWindowHandle -ne 0) {",
        "  Add-Type 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h); }'",
        "  [void][W]::SetForegroundWindow($p.MainWindowHandle)",
        "}",
      ].join(" "),
    ],
    { stdio: "ignore" },
  );
}
