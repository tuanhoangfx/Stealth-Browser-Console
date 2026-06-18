#!/usr/bin/env node
/** Ensure better-sqlite3 native bindings match Electron — skip if already loadable. */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function loadable() {
  try {
    require("better-sqlite3");
    return true;
  } catch {
    return false;
  }
}

if (loadable()) {
  console.log("[predev] better-sqlite3 native bindings OK");
  process.exit(0);
}

console.log("[predev] rebuilding better-sqlite3 for Electron…");
const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "electron-rebuild", "-f", "-w", "better-sqlite3"],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);

if (result.status !== 0) {
  console.warn("[predev] electron-rebuild failed — sql.js fallback will be used");
  process.exit(0);
}

if (loadable()) {
  console.log("[predev] better-sqlite3 rebuild OK");
} else {
  console.warn("[predev] better-sqlite3 still unavailable after rebuild");
}
