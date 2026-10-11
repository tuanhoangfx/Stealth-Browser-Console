#!/usr/bin/env node
/**
 * Guard: release-notes trigger copy for the running bundle stays in the minified dist.
 * Hub-ui uses "You are on the latest version" (not a `label:"Latest"` badge).
 * Checks built dist bundle (no Electron required).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distAssets = path.join(root, "dist", "assets");

function fail(msg) {
  console.error(`smoke-release-latest-badge: FAIL — ${msg}`);
  process.exit(1);
}

const jsFiles = fs.readdirSync(distAssets).filter((f) => f.startsWith("index-") && f.endsWith(".js"));
if (!jsFiles.length) fail("dist/assets/index-*.js missing — run vite build first");
const bundle = fs.readFileSync(path.join(distAssets, jsFiles[0]), "utf8");
if (!bundle.includes("You are on the latest version")) {
  fail("dist bundle missing latest-version trigger copy");
}
if (!bundle.includes("Update available")) {
  fail("dist bundle missing update-available trigger copy");
}
if (!bundle.includes("release-notes.json")) {
  fail("dist bundle missing release-notes.json fetch");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      script: "smoke-release-latest-badge",
      distBundle: jsFiles[0],
    },
    null,
    2,
  ),
);
