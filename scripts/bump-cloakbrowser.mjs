#!/usr/bin/env node
/**
 * Bump pinned cloakbrowser version and run the engine verification ladder.
 * Usage: node scripts/bump-cloakbrowser.mjs <version>
 * Example: node scripts/bump-cloakbrowser.mjs 0.4.1
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runStep } from "./lib/run-step.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");

const next = String(process.argv[2] ?? "").trim();

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error("Usage: node scripts/bump-cloakbrowser.mjs <semver>  (e.g. 0.4.1)");
  process.exit(1);
}

function run(label, cmd, args) {
  console.log(`\n→ ${label}`);
  runStep(label, cmd, args);
}
const manifestPath = path.join(root, "tool.manifest.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const prev = String(pkg.dependencies?.cloakbrowser ?? "").trim();

console.log(`bump-cloakbrowser: ${prev || "(none)"} → ${next}`);
console.log("Read CloakHQ release notes before continuing. Manual site QA still required after ladder.\n");

pkg.dependencies.cloakbrowser = next;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

if (!manifest.engine) manifest.engine = {};
manifest.engine.package = "cloakbrowser";
manifest.engine.version = next;
manifest.engine.pinned = true;
manifest.engine.bumpPolicy = "docs/ENGINE-CLOAKBROWSER.md#bump-policy";
manifest.engine.updatedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

run("pnpm install", "pnpm", ["install"]);
run("check-cloakbrowser-pin", "node", ["scripts/check-cloakbrowser-pin.mjs"]);
run("verify-cloakbrowser-esm-deps", "node", ["scripts/verify-cloakbrowser-esm-deps.mjs"]);
run("unit-tests", "node", ["scripts/run-unit-tests.mjs"]);

console.log(`
bump-cloakbrowser: ladder passed for cloakbrowser@${next}

Before shipping to users: pnpm desktop:dist (or desktop:release) then Run profile + Run proxy profile on Setup.exe.

Manual site QA still required — see tool.manifest engine.bumpPolicy.
`);
