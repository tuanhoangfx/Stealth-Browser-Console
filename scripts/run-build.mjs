#!/usr/bin/env node
/** tsc --noEmit + vite build — PowerShell-safe (no &&). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNodeExe, winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = resolveNodeExe();

function findBin(pkg, bins) {
  let dir = root;
  for (let i = 0; i < 12; i++) {
    for (const rel of bins) {
      const candidate = path.join(dir, "node_modules", pkg, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Binary not found for ${pkg}`);
}

function run(bin, args) {
  const result = spawnSync(node, [bin, ...args], winSpawnOpts({ cwd: root, stdio: "inherit" }));
  process.exit(result.status ?? 1);
}

spawnSync(node, [path.join(root, "scripts", "sync-app-version.mjs")], winSpawnOpts({ cwd: root, stdio: "inherit" }));
const syncBrand = spawnSync(
  node,
  [path.join(root, "..", "..", "scripts", "sync-hub-brand-icons.mjs"), "--code", "P0003"],
  winSpawnOpts({ cwd: root, stdio: "inherit" }),
);
if ((syncBrand.status ?? 1) !== 0) process.exit(syncBrand.status ?? 1);
run(findBin("typescript", ["bin/tsc"]), ["--noEmit"]);
run(findBin("vite", ["bin/vite.js"]), ["build"]);
const verifyAssets = spawnSync(node, [path.join(root, "scripts", "verify-brand-assets.mjs"), "--dist"], winSpawnOpts({ cwd: root, stdio: "inherit" }));
if ((verifyAssets.status ?? 1) !== 0) process.exit(verifyAssets.status ?? 1);
