#!/usr/bin/env node
/** Fail if cloakbrowser is not exact-pinned, drifts from tool.manifest, or install mismatch. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const manifestPath = path.join(root, "tool.manifest.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const declared = String(pkg.dependencies?.cloakbrowser ?? "").trim();
const expected = String(manifest.engine?.version ?? "").trim();

if (!declared) {
  console.error("check-cloakbrowser-pin: cloakbrowser missing from package.json dependencies");
  process.exit(1);
}

if (/^[\^~>=<]/.test(declared)) {
  console.error(
    `check-cloakbrowser-pin: cloakbrowser must be exact pin (got "${declared}"). Use 0.4.8 not ^0.4.8`,
  );
  process.exit(1);
}

if (!expected) {
  console.error("check-cloakbrowser-pin: tool.manifest.json engine.version is required");
  process.exit(1);
}

if (manifest.engine?.pinned !== true) {
  console.error("check-cloakbrowser-pin: tool.manifest.json engine.pinned must be true");
  process.exit(1);
}

if (declared !== expected) {
  console.error(
    `check-cloakbrowser-pin: package.json (${declared}) != tool.manifest engine.version (${expected})`,
  );
  process.exit(1);
}

function readInstalledVersion() {
  /** @type {string[]} */
  const candidates = [path.join(root, "node_modules", "cloakbrowser", "package.json")];
  const pnpm = path.join(root, "node_modules", ".pnpm");
  if (fs.existsSync(pnpm)) {
    for (const entry of fs.readdirSync(pnpm, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("cloakbrowser@")) continue;
      candidates.push(path.join(pnpm, entry.name, "node_modules", "cloakbrowser", "package.json"));
    }
  }
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const version = String(JSON.parse(fs.readFileSync(file, "utf8")).version ?? "").trim();
      if (version) return version;
    } catch {
      /* try next */
    }
  }
  return "";
}

const installed = readInstalledVersion();
if (!installed) {
  console.error("check-cloakbrowser-pin: cloakbrowser not installed — run pnpm install");
  process.exit(1);
}

if (installed !== declared) {
  console.error(
    `check-cloakbrowser-pin: node_modules has cloakbrowser@${installed} but package.json pins ${declared} — run pnpm install --frozen-lockfile`,
  );
  process.exit(1);
}

console.log(`check-cloakbrowser-pin: ok cloakbrowser@${declared} (installed matches pin)`);
