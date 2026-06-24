#!/usr/bin/env node
/** Fail if cloakbrowser is not exact-pinned or drifts from tool.manifest engine.version. */
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
    `check-cloakbrowser-pin: cloakbrowser must be exact pin (got "${declared}"). Use 0.4.0 not ^0.4.0 — see docs/ENGINE-CLOAKBROWSER.md`
  );
  process.exit(1);
}

if (!expected) {
  console.error("check-cloakbrowser-pin: tool.manifest.json engine.version is required");
  process.exit(1);
}

if (declared !== expected) {
  console.error(
    `check-cloakbrowser-pin: package.json (${declared}) != tool.manifest engine.version (${expected})`
  );
  process.exit(1);
}

console.log(`check-cloakbrowser-pin: ok cloakbrowser@${declared}`);
