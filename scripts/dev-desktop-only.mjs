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
const electronCli = require.resolve("electron/cli.js");

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
  const logFd = fs.openSync(WATCH_LOG_FILE, "a");
  fs.writeFileSync(WATCH_LOG_FILE, `\n--- watch start ${new Date().toISOString()} ---\n`, { flag: "a" });
  const child = spawn(node, [viteBin, "build", "--watch"], winSpawnOpts({
    cwd: root,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  }));
  child.unref();
  fs.writeFileSync(WATCH_PID_FILE, String(child.pid));
  console.log(`[dev-desktop-only] vite build --watch pid=${child.pid}`);
  return child.pid;
}

function startElectron() {
  const logFd = fs.openSync(LOG_FILE, "a");
  fs.writeFileSync(LOG_FILE, `\n--- dev-desktop-only ${new Date().toISOString()} ---\n`, { flag: "a" });
  const env = stealthElectronEnv({
    VITE_DEV_SERVER_URL: "",
    STEALTH_LOAD_DIST: "1",
    STEALTH_DIST_WATCH: watch ? "1" : "0",
  });
  const child = spawn(node, [electronCli, "."], winSpawnOpts({
    cwd: root,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env,
  }));
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  console.log(`[dev-desktop-only] electron pid=${child.pid} log=${path.relative(root, LOG_FILE)}`);
  return child.pid;
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

const devAlreadyRunning = keepDev && isStealthDevRunning();

if (devAlreadyRunning) {
  console.log("[dev-desktop-only] --keep-dev: Electron dev still running — skip kill/restart");
} else {
  console.log("[dev-desktop-only] stopping prior dev…");
  killStealthDev();
  killWatch();
}

const { killed } = closePackagedStealth();
if (killed) console.log(`[dev-desktop-only] closed ${killed} packaged instance(s)`);

if (!skipBuild || !fs.existsSync(path.join(root, "dist", "index.html"))) {
  runBuildOnce();
} else {
  console.log("[dev-desktop-only] skip build — dist/index.html exists");
}

if (watch && !isWatchRunning()) startWatchBuild();
else if (watch && devAlreadyRunning) console.log("[dev-desktop-only] vite build --watch already running");

if (!devAlreadyRunning) startElectron();
focusStealthWindow();

console.log("\n[dev-desktop-only] ready — no :5175 dev server");
console.log("  Edit UI → vite rebuilds dist → window reloads (exe stays open)");
console.log("  Logs: .dev-desktop.log" + (watch ? " · .dev-desktop-watch.log" : ""));
