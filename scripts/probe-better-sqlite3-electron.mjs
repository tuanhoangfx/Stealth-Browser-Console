#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronExe = path.join(root, "node_modules", "electron", "dist", "electron.exe");
const probeMain = path.join(root, "scripts", "probe-better-sqlite3-main.cjs");
const require = createRequire(path.join(root, "package.json"));

function resolveBetterSqlite3Dir() {
  try {
    return path.dirname(require.resolve("better-sqlite3/package.json"));
  } catch {
    return null;
  }
}

function probeInElectron() {
  if (!fs.existsSync(electronExe) || !fs.existsSync(probeMain)) return false;
  const result = spawnSync(electronExe, [probeMain], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
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
