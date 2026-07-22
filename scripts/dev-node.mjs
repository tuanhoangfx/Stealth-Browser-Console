#!/usr/bin/env node
/**
 * Dev orchestrator that avoids the `concurrently`/`.bin/*.ps1` wrappers, which
 * PowerShell blocks under a restricted ExecutionPolicy. Spawns vite + electron
 * directly via this Node binary, waits for the dev port, then launches Electron.
 *
 * Health gate: Vite stays up even if Electron exits or a single profile/DB
 * error occurs. Stack only shuts down on SIGINT/SIGTERM or Vite death (after retries).
 *
 * Usage: node scripts/dev-node.mjs   (or: pnpm dev:node)
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stealthElectronEnv } from "./lib/stealth-electron-env.mjs";
import { syncDevCatalogFromProd } from "./lib/sync-dev-catalog-from-prod.mjs";
import { isDevPortListening, waitForDevPort } from "./lib/dev-port-guard.mjs";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const useProdData = args.includes("--prod-data");
const PORT = 5175;
const node = process.execPath;
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const require = createRequire(path.join(root, "package.json"));
const electronCli = require.resolve("electron/cli.js");
const LOG_FILE = path.join(root, ".dev-vite.log");
const foreground = args.includes("--foreground");
const interactive =
  foreground || (process.platform !== "win32" && Boolean(process.stdout.isTTY && !process.env.STEALTH_DEV_LOG));
const MAX_VITE_RESTARTS = 3;
const VITE_RESTART_DELAY_MS = 2500;

function childStdio() {
  if (interactive) return "inherit";
  const logFd = fs.openSync(LOG_FILE, "a");
  fs.writeFileSync(LOG_FILE, `\n--- dev-node ${new Date().toISOString()} ---\n`, { flag: "a" });
  return ["ignore", logFd, logFd];
}

let vite;
let electron;
let shuttingDown = false;
let viteRestartAttempts = 0;
let viteRestartTimer = null;
/** Only one Electron spawn per dev-node orchestrator — never respawn on Vite port attach/retry. */
let electronLaunched = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (viteRestartTimer) clearTimeout(viteRestartTimer);
  if (electron && !electron.killed) electron.kill();
  if (vite && !vite.killed) vite.kill();
  process.exit(code ?? 0);
}

function spawnVite() {
  vite = spawn(node, [viteBin, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], winSpawnOpts({
    cwd: root,
    stdio: childStdio(),
  }));
  vite.on("exit", onViteExit);
  return vite;
}

function scheduleViteRestart() {
  if (shuttingDown) return;
  viteRestartAttempts += 1;
  console.warn(
    `[dev-node] Vite exited (code=1) — retry ${viteRestartAttempts}/${MAX_VITE_RESTARTS} in ${VITE_RESTART_DELAY_MS}ms`,
  );
  viteRestartTimer = setTimeout(() => {
    viteRestartTimer = null;
    if (shuttingDown) return;
    void (async () => {
      if (await isDevPortListening(PORT)) {
        console.log(`[dev-node] :${PORT} already listening — skip vite respawn (no new Electron)`);
        viteRestartAttempts = 0;
        return;
      }
      spawnVite();
      try {
        await waitForDevPort(PORT);
        viteRestartAttempts = 0;
        console.log(`[dev-node] Vite recovered on :${PORT}`);
      } catch {
        if (viteRestartAttempts < MAX_VITE_RESTARTS) scheduleViteRestart();
        else {
          console.error("[dev-node] Vite restart exhausted — shutting down");
          shutdown(1);
        }
      }
    })();
  }, VITE_RESTART_DELAY_MS);
}

function onViteExit(code, signal) {
  if (shuttingDown) return;
  if (code === 1 && viteRestartAttempts < MAX_VITE_RESTARTS) {
    scheduleViteRestart();
    return;
  }
  console.error(`[dev-node] Vite exited (code=${code ?? "null"} signal=${signal ?? "null"}) — shutting down`);
  shutdown(code ?? 1);
}

function spawnElectron() {
  if (electronLaunched && electron && !electron.killed) return;
  electronLaunched = true;
  const electronEnv = stealthElectronEnv({
    VITE_DEV_SERVER_URL: `http://127.0.0.1:${PORT}/`,
    STEALTH_DEV_ISOLATED: useProdData ? "0" : "1",
    STEALTH_DEV_NO_FOCUS: process.env.STEALTH_DEV_LOG === "1" ? "1" : process.env.STEALTH_DEV_NO_FOCUS,
  });
  if (useProdData) {
    console.warn("[dev-node] --prod-data: using production userData (close Setup.exe to avoid DB lock).");
  } else {
    console.log(
      `[dev-node] isolated userData=${electronEnv.STEALTH_USER_DATA || "(default-dev)"} apiPort=${electronEnv.STEALTH_API_PORT}`,
    );
  }
  electron = spawn(node, [electronCli, "."], winSpawnOpts({
    cwd: root,
    stdio: childStdio(),
    env: electronEnv,
  }));
  electron.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.warn(
      `[dev-node] Electron exited (code=${code ?? "null"} signal=${signal ?? "null"}) — Vite stays on :${PORT}. ` +
        `Relaunch: pnpm dev:desktop-only  (or Ctrl+C to stop stack)`,
    );
    electron = null;
  });
}

async function ensureViteUp() {
  if (await isDevPortListening(PORT)) {
    console.log(`[dev-node] :${PORT} already listening — attach (skip duplicate vite spawn)`);
    return;
  }
  spawnVite();
  await waitForDevPort(PORT);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (!useProdData) {
  await syncDevCatalogFromProd().catch((err) => {
    console.warn("[dev-node] sync-prod-catalog:", err instanceof Error ? err.message : err);
  });
}

try {
  await ensureViteUp();
  if (!interactive) {
    console.log(`[dev-node] DEV_READY web=http://127.0.0.1:${PORT}/ log=${path.relative(root, LOG_FILE)}`);
  } else {
    console.log(`[dev-node] DEV_READY web=http://127.0.0.1:${PORT}/`);
  }
  spawnElectron();
} catch (error) {
  console.error("[dev-node]", error instanceof Error ? error.message : error);
  shutdown(1);
}
