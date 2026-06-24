#!/usr/bin/env node
/**
 * Dev orchestrator that avoids the `concurrently`/`.bin/*.ps1` wrappers, which
 * PowerShell blocks under a restricted ExecutionPolicy. Spawns vite + electron
 * directly via this Node binary, waits for the dev port, then launches Electron.
 *
 * Usage: node scripts/dev-node.mjs   (or: pnpm dev:node)
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stealthElectronEnv } from "./lib/stealth-electron-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const vite = spawn(node, [viteBin, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  stdio: "inherit"
});

let electron;
function shutdown(code) {
  if (electron && !electron.killed) electron.kill();
  if (vite && !vite.killed) vite.kill();
  process.exit(code ?? 0);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
vite.on("exit", (code) => shutdown(code ?? 0));

try {
  await waitForPort(PORT);
  electron = spawn(node, [electronCli, "."], {
    cwd: root,
    stdio: "inherit",
    env: stealthElectronEnv({
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${PORT}/`,
    }),
  });
  electron.on("exit", (code) => shutdown(code ?? 0));
} catch (error) {
  console.error("[dev-node]", error instanceof Error ? error.message : error);
  shutdown(1);
}
