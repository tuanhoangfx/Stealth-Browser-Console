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
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

spawnSync(node, [path.join(root, "scripts", "sync-app-version.mjs")], winSpawnOpts({ cwd: root, stdio: "inherit" }));
const syncBrand = spawnSync(
  node,
  [path.join(root, "..", "scripts", "sync-hub-brand-icons.mjs"), "--code", "P0003"],
  winSpawnOpts({ cwd: root, stdio: "inherit" }),
);
if ((syncBrand.status ?? 1) !== 0) process.exit(syncBrand.status ?? 1);
const syncToolIcons = spawnSync(
  node,
  [path.join(root, "..", "scripts", "sync-hub-tool-icons.mjs"), "--code", "P0003"],
  winSpawnOpts({ cwd: root, stdio: "inherit" }),
);
if ((syncToolIcons.status ?? 1) !== 0) process.exit(syncToolIcons.status ?? 1);
run(findBin("typescript", ["bin/tsc"]), ["--noEmit"]);
run(findBin("vite", ["bin/vite.js"]), ["build"]);
const verifyAssets = spawnSync(node, [path.join(root, "scripts", "verify-brand-assets.mjs"), "--dist"], winSpawnOpts({ cwd: root, stdio: "inherit" }));
if ((verifyAssets.status ?? 1) !== 0) process.exit(verifyAssets.status ?? 1);

/** Fail ship if UI bundle still embeds a stale APP_VERSION. */
const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const assetsDir = path.join(root, "dist", "assets");
const indexJs = fs.existsSync(assetsDir)
  ? fs.readdirSync(assetsDir).find((f) => /^index-.*\.js$/.test(f))
  : null;
if (!indexJs) {
  console.error("run-build: missing dist/assets/index-*.js after vite build");
  process.exit(1);
}
const bundle = fs.readFileSync(path.join(assetsDir, indexJs), "utf8");
if (!bundle.includes(pkgVersion)) {
  console.error(`run-build: dist UI bundle missing APP_VERSION ${pkgVersion} (file=${indexJs})`);
  process.exit(1);
}
console.log(`run-build: ok — ${indexJs} embeds v${pkgVersion}`);
