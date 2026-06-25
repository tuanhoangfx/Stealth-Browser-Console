#!/usr/bin/env node
/** Ensure better-sqlite3 native bindings match Electron ABI — hidden probe, no electron.exe GUI popup. */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const probeScript = path.join(root, "scripts", "probe-better-sqlite3-electron.mjs");
const stampFile = path.join(root, ".dev", "better-sqlite3-electron.stamp");

function abiStamp() {
  try {
    const electronVer = JSON.parse(
      fs.readFileSync(require.resolve("electron/package.json"), "utf8"),
    ).version;
    const sqliteVer = JSON.parse(
      fs.readFileSync(require.resolve("better-sqlite3/package.json"), "utf8"),
    ).version;
    return crypto.createHash("sha256").update(`${electronVer}:${sqliteVer}`).digest("hex").slice(0, 16);
  } catch {
    return "";
  }
}

function stampOk() {
  const stamp = abiStamp();
  if (!stamp || !fs.existsSync(stampFile)) return false;
  return fs.readFileSync(stampFile, "utf8").trim() === stamp;
}

function writeStamp() {
  const stamp = abiStamp();
  if (!stamp) return;
  fs.mkdirSync(path.dirname(stampFile), { recursive: true });
  fs.writeFileSync(stampFile, `${stamp}\n`, "utf8");
}

function probeOk() {
  if (stampOk()) return true;
  if (!fs.existsSync(probeScript)) return false;
  const result = spawnSync(process.execPath, [probeScript], winSpawnOpts({
    cwd: root,
    stdio: "pipe",
  }));
  if (result.status === 0) writeStamp();
  return result.status === 0;
}

function rebuildBetterSqlite3() {
  const moduleDir = (() => {
    try {
      return path.dirname(require.resolve("better-sqlite3/package.json"));
    } catch {
      return null;
    }
  })();

  const args = ["exec", "electron-rebuild", "-f", "-w", "better-sqlite3"];
  if (moduleDir) args.push("--module-dir", moduleDir);

  return spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, winSpawnOpts({
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  }));
}

if (process.versions.electron) {
  process.exit(0);
}

if (probeOk()) {
  console.log("[predev] better-sqlite3 native bindings OK (Electron ABI)");
  process.exit(0);
}

console.log("[predev] rebuilding better-sqlite3 for Electron…");
const rebuild = rebuildBetterSqlite3();

if (rebuild.status !== 0) {
  console.warn("[predev] electron-rebuild failed — sql.js fallback will be used");
  process.exit(0);
}

try {
  fs.unlinkSync(stampFile);
} catch {
  /* ignore */
}

if (probeOk()) {
  console.log("[predev] better-sqlite3 rebuild OK (Electron ABI)");
} else {
  console.warn("[predev] better-sqlite3 still unavailable in Electron after rebuild");
}
