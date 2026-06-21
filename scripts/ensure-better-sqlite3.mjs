#!/usr/bin/env node
/** Ensure better-sqlite3 native bindings match Electron ABI — no inline electron -e (Windows popup). */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const probeScript = path.join(root, "scripts", "probe-better-sqlite3-electron.mjs");

function probeOk() {
  if (!fs.existsSync(probeScript)) return false;
  const result = spawnSync(process.execPath, [probeScript], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
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

  return spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
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

if (probeOk()) {
  console.log("[predev] better-sqlite3 rebuild OK (Electron ABI)");
} else {
  console.warn("[predev] better-sqlite3 still unavailable in Electron after rebuild");
}
