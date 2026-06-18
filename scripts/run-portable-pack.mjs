#!/usr/bin/env node
/**
 * Portable Windows bundle without electron-builder rename (avoids EPERM on release/).
 * Output: out/win-unpacked/Stealth Browser Console.exe
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNodeExe, winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = resolveNodeExe();
const outRoot = path.join(root, "out", "win-unpacked");
const appName = "Stealth Browser Console";

function runNodeScript(rel) {
  const result = spawnSync(node, [path.join(root, rel)], winSpawnOpts({ cwd: root, stdio: "inherit" }));
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

function findElectronDist() {
  let dir = root;
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "node_modules", "electron", "dist");
    if (fs.existsSync(path.join(candidate, "electron.exe"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("electron dist not found");
}

function copyDirReal(src, dest) {
  const resolved = fs.realpathSync(src);
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
      copyDirReal(path.join(resolved, entry.name), path.join(dest, entry.name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(resolved, dest);
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

/** Copy runtime node_modules (follow pnpm symlinks). */
function copyRuntimeNodeModules(appRoot) {
  const srcModules = path.join(root, "node_modules");
  const destModules = path.join(appRoot, "node_modules");
  fs.mkdirSync(destModules, { recursive: true });

  const runtimePackages = [
    "better-sqlite3",
    "sql.js",
    "cloakbrowser",
    "playwright-core"
  ];

  for (const name of runtimePackages) {
    const src = path.join(srcModules, name);
    if (!fs.existsSync(src)) continue;
    copyDirReal(src, path.join(destModules, name));
  }

  // pnpm .pnpm store copies for packages that symlink nested deps
  const pnpmDir = path.join(srcModules, ".pnpm");
  if (fs.existsSync(pnpmDir)) {
    const destPnpm = path.join(destModules, ".pnpm");
    fs.mkdirSync(destPnpm, { recursive: true });
    for (const entry of fs.readdirSync(pnpmDir)) {
      if (
        entry.startsWith("better-sqlite3@") ||
        entry.startsWith("sql.js@") ||
        entry.startsWith("cloakbrowser@") ||
        entry.startsWith("playwright-core@")
      ) {
        copyDirReal(path.join(pnpmDir, entry), path.join(destPnpm, entry));
      }
    }
  }
}

runNodeScript("scripts/sync-app-icon.cjs");
runNodeScript("scripts/ensure-electron-binary.cjs");
runNodeScript("scripts/run-build.mjs");

rmDir(outRoot);
fs.mkdirSync(outRoot, { recursive: true });

const electronDist = findElectronDist();
copyDirReal(electronDist, outRoot);

const appRoot = path.join(outRoot, "resources", "app");
fs.mkdirSync(appRoot, { recursive: true });

for (const rel of ["dist", "electron", "build", "package.json", "RELEASE.md"]) {
  const src = path.join(root, rel);
  const dest = path.join(appRoot, rel);
  if (!fs.existsSync(src)) continue;
  copyDirReal(src, dest);
}

copyRuntimeNodeModules(appRoot);

const wasmSrc = path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const wasmDest = path.join(appRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
if (fs.existsSync(wasmSrc)) {
  fs.mkdirSync(path.dirname(wasmDest), { recursive: true });
  fs.copyFileSync(wasmSrc, wasmDest);
}

const exeSrc = path.join(outRoot, "electron.exe");
const exeDest = path.join(outRoot, `${appName}.exe`);
if (fs.existsSync(exeSrc)) fs.copyFileSync(exeSrc, exeDest);

console.log(`\nPortable app ready:\n  ${exeDest}\n`);
