#!/usr/bin/env node
/** Probe better-sqlite3 inside Electron ABI — node + electron/cli.js (never electron.exe GUI). */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probeMain = path.join(root, "scripts", "probe-better-sqlite3-main.cjs");
const require = createRequire(path.join(root, "package.json"));

function resolveElectronCli() {
  try {
    return require.resolve("electron/cli.js");
  } catch {
    return null;
  }
}

function probeInElectron() {
  const electronCli = resolveElectronCli();
  if (!electronCli || !fs.existsSync(probeMain)) return false;
  const result = spawnSync(
    process.execPath,
    [electronCli, probeMain],
    winSpawnOpts({
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    }),
  );
  if (result.stdout?.trim()) process.stdout.write(result.stdout);
  if (result.stderr?.trim()) process.stderr.write(result.stderr);
  return result.status === 0;
}

if (probeInElectron()) {
  console.log("OK");
  process.exit(0);
}

console.error("ERR better-sqlite3 probe failed in Electron");
process.exit(1);
