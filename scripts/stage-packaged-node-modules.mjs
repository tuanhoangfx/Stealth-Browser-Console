#!/usr/bin/env node
/**
 * Copy main-process + electron-updater runtime deps into electron/packaged-node_modules
 * for asar (pnpm + narrow build.files). Run before electron-builder pack.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { PACKAGED_RUNTIME_DEPS } = require("../electron/lib/packaged-updater-deps.cjs");

const targetRoot = path.join(root, "electron", "packaged-node_modules");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function resolvePackageRoot(name, fromDir) {
  try {
    const entry = require.resolve(`${name}/package.json`, { paths: [fromDir, root] });
    return path.dirname(entry);
  } catch (error) {
    // Some packages omit package.json from "exports" (e.g. @supabase/phoenix).
    const resolved = require.resolve(name, { paths: [fromDir, root] });
    let dir = path.dirname(resolved);
    while (dir && dir !== path.dirname(dir)) {
      const pkgFile = path.join(dir, "package.json");
      if (fs.existsSync(pkgFile)) {
        try {
          const pkg = readJson(pkgFile);
          if (pkg.name === name || dir.endsWith(`${path.sep}${name}`) || dir.endsWith(`/${name}`)) {
            return dir;
          }
        } catch {
          /* continue */
        }
      }
      dir = path.dirname(dir);
    }
    throw error;
  }
}

function collectDeps(names) {
  /** @type {Array<{ name: string, fromDir: string }>} */
  const pending = names.map((name) => ({ name, fromDir: root }));
  /** @type {Map<string, string>} */
  const resolved = new Map();

  while (pending.length) {
    const item = pending.shift();
    if (!item || resolved.has(item.name)) continue;

    const src = resolvePackageRoot(item.name, item.fromDir);
    resolved.set(item.name, src);

    const pkg = readJson(path.join(src, "package.json"));
    for (const dep of Object.keys(pkg.dependencies || {})) {
      if (!resolved.has(dep)) pending.push({ name: dep, fromDir: src });
    }
  }

  return resolved;
}

function packageDest(name) {
  // Node resolves require(X) against <path>/node_modules/X — never <path>/X.
  return path.join(targetRoot, "node_modules", ...String(name).split("/"));
}

function main() {
  const modules = collectDeps(PACKAGED_RUNTIME_DEPS);
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(targetRoot, "node_modules"), { recursive: true });

  for (const [name, src] of modules) {
    copyDir(src, packageDest(name));
  }

  console.log(`stage-packaged-node-modules: copied ${modules.size} module(s) → electron/packaged-node_modules/node_modules`);
}

main();
