#!/usr/bin/env node
/**
 * Dev orchestrator that avoids the `concurrently`/`.bin/*.ps1` wrappers, which
 * PowerShell blocks under a restricted ExecutionPolicy. Spawns vite + electron
 * directly via this Node binary, waits for the dev port, then launches Electron.
 *
 * Health gate: Vite stays up even if Electron exits or a single profile/DB
 * error occurs. Stack only shuts down on SIGINT/SIGTERM or Vite death.
 *
 * Usage: node scripts/dev-node.mjs   (or: pnpm dev:node)
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stealthElectronEnv } from "./lib/stealth-electron-env.mjs";
import { syncDevCatalogFromProd } from "./lib/sync-dev-catalog-from-prod.mjs";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const useProdData = args.includes("--prod-data");
const PORT = 5175;
const node = process.execPath;
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const require = createRequire(path.join(root, "package.json"));
const electronCli = require.resolve("electron/cli.js");

function waitForPort(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`vite did not open :${port} in time`));
        else setTimeout(tick, 300);
      });
    };
    tick();
  });
}

const vite = spawn(node, [viteBin, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], winSpawnOpts({
  cwd: root,
  stdio: "inherit",
}));

let electron;
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electron && !electron.killed) electron.kill();
  if (vite && !vite.killed) vite.kill();
  process.exit(code ?? 0);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// Vite is the stack life-cycle owner — only exit when Vite dies.
vite.on("exit", (code, signal) => {
  if (shuttingDown) return;
  console.error(`[dev-node] Vite exited (code=${code ?? "null"} signal=${signal ?? "null"}) — shutting down`);
  shutdown(code ?? 1);
});

if (!useProdData) {
  await syncDevCatalogFromProd().catch((err) => {
    console.warn("[dev-node] sync-prod-catalog:", err instanceof Error ? err.message : err);
  });
}

function spawnElectron() {
  const electronEnv = stealthElectronEnv({
    VITE_DEV_SERVER_URL: `http://127.0.0.1:${PORT}/`,
    ...(useProdData ? { STEALTH_DEV_ISOLATED: "0" } : {}),
  });
  if (useProdData) {
    console.warn("[dev-node] --prod-data: using production userData (close Setup.exe to avoid DB lock).");
  }
  electron = spawn(node, [electronCli, "."], winSpawnOpts({
    cwd: root,
    stdio: "inherit",
    env: electronEnv,
  }));
  electron.on("exit", (code, signal) => {
    if (shuttingDown) return;
    // Profile/DB errors must not kill Vite — keep HMR alive for the next relaunch.
    console.warn(
      `[dev-node] Electron exited (code=${code ?? "null"} signal=${signal ?? "null"}) — Vite stays on :${PORT}. ` +
        `Relaunch: pnpm dev:desktop-only  (or Ctrl+C to stop stack)`,
    );
    electron = null;
  });
}

try {
  await waitForPort(PORT);
  console.log(`[dev-node] DEV_READY web=http://127.0.0.1:${PORT}/`);
  spawnElectron();
} catch (error) {
  console.error("[dev-node]", error instanceof Error ? error.message : error);
  shutdown(1);
}
