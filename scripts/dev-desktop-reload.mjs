#!/usr/bin/env node
/**
 * Restart P0003 desktop (Electron + Vite).
 * Kill dev first so electron-dev-gate can free :5175 when electron/ changed.
 * Version bump = workspace hook SSOT (P0020), not this script.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { killStealthDev } from "./lib/dev-desktop-process.mjs";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(script, args = [], env = process.env) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], winSpawnOpts({
    cwd: root,
    stdio: "inherit",
    env,
  }));
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("dev-desktop-reload: stopping dev before version gate…");
killStealthDev();
spawnSync(process.execPath, ["-e", "setTimeout(()=>{},2000)"], winSpawnOpts({ stdio: "ignore" }));

// Explicit reload always applies gate — avoids defer while :5175 was still bound.
run("electron-dev-gate.mjs", [], { ...process.env, STEALTH_DEV_FORCE_RELOAD: "1" });
run("reload-and-verify-p0003.mjs");
