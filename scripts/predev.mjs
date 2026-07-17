#!/usr/bin/env node
/** predev / predev:web — PowerShell-safe (no &&). */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isDevPortListening } from "./lib/dev-port-guard.mjs";
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

function runToolScript(name, extraArgs = []) {
  const script = path.join(toolScriptsDir, name);
  const result = spawnSync(process.execPath, [script, ...extraArgs], winSpawnOpts({ cwd: root, stdio: "inherit" }));
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const devActive = await isDevPortListening();
if (devActive) {
  console.warn(
    "[predev] :5175 dev active — skip vendor sync, sync-hub-env write, electron-dev-gate kill " +
      "(close dev or run sync-hub-ui-vendor after ship)",
  );
} else {
  runToolScript("sync-hub-ui-vendor.cjs");
  runToolScript("sync-hub-identity-vendor.cjs");
}

runToolScript("audit-react-hook-imports.cjs", ["--sidebar", "P0003"]);
runToolScript("sync-hub-brand-icons.mjs", ["--code", "P0003"]);
runToolScript("sync-hub-tool-icons.mjs", ["--code", "P0003"]);
runToolScript("verify-hub-vendor-prereqs.mjs", ["--code", "P0003"]);
run("sync-hub-env.mjs");
run("sync-hub-boot-public.mjs");
runToolScript("sync-app-icon.cjs", ["--code", "P0003"]);
run("sync-app-version.mjs");
run("sync-stealth-api-surface.mjs");
run("ensure-better-sqlite3.mjs");
run("ensure-electron-binary.cjs");
run("electron-dev-gate.mjs");
