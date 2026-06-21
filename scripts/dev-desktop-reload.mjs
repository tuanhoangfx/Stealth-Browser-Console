#!/usr/bin/env node
/** Restart P0003 desktop (Electron + Vite) — no version bump unless electron/ changed. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("electron-dev-gate.mjs");
run("reload-and-verify-p0003.mjs");
