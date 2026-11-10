#!/usr/bin/env node
/**
 * Desktop dev without Vite :5175 — load dist/ in Electron + auto-reload on rebuild.
 *
 * - Initial vite build (skip tsc for speed; run pnpm build before ship)
 * - vite build --watch in background
 * - Electron STEALTH_LOAD_DIST=1 STEALTH_DIST_WATCH=1
 * - UI refresh: window reload only (exe process stays open)
 *
 * Usage: node scripts/dev-desktop-only.mjs [--no-watch] [--skip-build] [--keep-dev]
 *
 * --keep-dev  Do NOT kill/restart Electron when dev is already running (CSS/UI edits only).
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closePackagedStealth } from "./close-packaged-stealth.mjs";
import {
  isStealthDevRunning,
  killStealthDev,
  LOG_FILE,
  PID_FILE,
  focusStealthWindow,
} from "./lib/dev-desktop-process.mjs";
import { stealthElectronEnv } from "./lib/stealth-electron-env.mjs";
import { syncDevCatalogFromProd } from "./lib/sync-dev-catalog-from-prod.mjs";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WATCH_PID_FILE = path.join(root, ".dev-desktop-watch.pid");
const WATCH_LOG_FILE = path.join(root, ".dev-desktop-watch.log");
const node = process.execPath;
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const args = process.argv.slice(2);
const watch = !args.includes("--no-watch");
const skipBuild = args.includes("--skip-build");
const keepDev = args.includes("--keep-dev");
const require = createRequire(path.join(root, "package.json"));
const electronExe = require("electron");
const { startHiddenDetachedProcess, spawnInteractiveDesktopProcess } = require(
  path.join(root, "..", "scripts", "lib", "win-shell-env.cjs"),
);

function runBuildOnce() {
  console.log("[dev-desktop-only] vite build…");
  const result = spawnSync(node, [viteBin, "build"], winSpawnOpts({ cwd: root, stdio: "inherit" }));
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

function clearWatchPid() {
  try {
    fs.unlinkSync(WATCH_PID_FILE);
  } catch {
    /* ignore */
  }
}

function killWatch() {
  try {
    const pid = Number(fs.readFileSync(WATCH_PID_FILE, "utf8").trim());
    if (Number.isFinite(pid) && pid > 0) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], winSpawnOpts({ stdio: "ignore" }));
      } else {
        process.kill(pid, "SIGTERM");
      }
    }
  } catch {
    /* ignore */
  }
  clearWatchPid();
}

function startWatchBuild() {
  const pid = startHiddenDetachedProcess({
    command: node,
    args: [viteBin, "build", "--watch"],
    cwd: root,
    logFile: WATCH_LOG_FILE,
    pidFile: WATCH_PID_FILE,
    writePid: (file, childPid) => fs.writeFileSync(file, String(childPid)),
  });
  console.log(`[dev-desktop-only] vite build --watch pid=${pid}`);
  return pid;
}

async function isViteDevServerUp() {
  return fetch("http://127.0.0.1:5175", { signal: AbortSignal.timeout(1500) })
    .then((r) => r.ok || r.status < 500)
    .catch(() => false);
}

async function startElectron() {
  const viteUp = await isViteDevServerUp();
  const env = stealthElectronEnv({
    VITE_DEV_SERVER_URL: viteUp ? "http://127.0.0.1:5175" : "",
    STEALTH_LOAD_DIST: viteUp ? "0" : "1",
    STEALTH_DIST_WATCH: watch ? "1" : "0",
    STEALTH_DEV_ISOLATED: "1",
    DEV_DETACH_SHOW_WINDOW: "1",
  });
  console.log(
    `[dev-desktop-only] isolated apiPort=${env.STEALTH_API_PORT} renderer=${viteUp ? "vite:5175" : "dist/"} userData=${env.STEALTH_USER_DATA || "(default)"}`,
  );
  if (process.platform === "win32" && typeof spawnInteractiveDesktopProcess === "function") {
    const winPid = spawnInteractiveDesktopProcess({
      exePath: electronExe,
      args: ["."],
      cwd: root,
      env,
      showWindow: 5,
    });
    if (winPid) {
      fs.writeFileSync(PID_FILE, String(winPid));
      console.log(`[dev-desktop-only] electron pid=${winPid} (interactive desktop)`);
      return winPid;
    }
  }
  const pid = startHiddenDetachedProcess({
    command: electronExe,
    args: ["."],
    cwd: root,
    logFile: LOG_FILE,
    pidFile: PID_FILE,
    writePid: (file, childPid) => fs.writeFileSync(file, String(childPid)),
    env,
  });
  console.log(`[dev-desktop-only] electron pid=${pid} log=${path.relative(root, LOG_FILE)}`);
  return pid;
}

function isWatchRunning() {
  try {
    const pid = Number(fs.readFileSync(WATCH_PID_FILE, "utf8").trim());
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const forceRestart = args.includes("--force-restart") || process.env.STEALTH_FORCE_KILL_DEV === "1";
const devPortUp = await fetch("http://127.0.0.1:6004/api/health", { signal: AbortSignal.timeout(2000) })
  .then((r) => r.ok)
  .catch(() => false);
const devAlreadyRunning = !forceRestart && (devPortUp || isStealthDevRunning());

const killPackaged =
  process.argv.includes("--replace-packaged") || process.env.STEALTH_KILL_PACKAGED === "1";

if (devAlreadyRunning) {
  console.log("[dev-desktop-only] Electron Dev Exe (:6004) is already running — preserving window & hot-reloading");
} else {
  console.log("[dev-desktop-only] stopping prior dev…");
  killStealthDev({ force: forceRestart });
  killWatch();
}

if (killPackaged) {
  const { killed } = closePackagedStealth();
  if (killed) console.log(`[dev-desktop-only] closed ${killed} packaged instance(s) (--replace-packaged)`);
} else {
  console.log("[dev-desktop-only] packaged Stealth Browser Console.exe left running (dev isolated :6004)");
}

if (!skipBuild || !fs.existsSync(path.join(root, "dist", "index.html"))) {
  runBuildOnce();
} else {
  console.log("[dev-desktop-only] skip build — dist/index.html exists");
}

if (watch && !isWatchRunning()) startWatchBuild();
else if (watch && devAlreadyRunning) console.log("[dev-desktop-only] vite build --watch already running");

if (!devAlreadyRunning) {
  await syncDevCatalogFromProd().catch((err) => {
    console.warn("[dev-desktop-only] sync-prod-catalog:", err instanceof Error ? err.message : err);
  });
  await startElectron();
}
focusStealthWindow();

console.log("\n[dev-desktop-only] ready — no :5175 dev server");
console.log("  Edit UI → vite rebuilds dist → window reloads (exe stays open)");
console.log("  Logs: .dev-desktop.log" + (watch ? " · .dev-desktop-watch.log" : ""));
