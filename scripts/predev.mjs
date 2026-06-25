#!/usr/bin/env node
/** predev / predev:web — PowerShell-safe (no &&). */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { winSpawnOpts } from "./lib/win-spawn.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, "..");
const toolScriptsDir = path.join(scriptsDir, "..", "..", "scripts");

function run(name) {
  const script = path.join(scriptsDir, name);
  const result = spawnSync(process.execPath, [script], winSpawnOpts({ cwd: root, stdio: "inherit" }));
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runToolScript(name) {
  const script = path.join(toolScriptsDir, name);
  const result = spawnSync(process.execPath, [script], winSpawnOpts({ cwd: root, stdio: "inherit" }));
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runToolScript("sync-hub-ui-vendor.cjs");
run("sync-hub-env.mjs");
run("sync-hub-boot-public.mjs");
run("sync-app-version.mjs");
run("ensure-better-sqlite3.mjs");
run("ensure-electron-binary.cjs");
run("electron-dev-gate.mjs");
