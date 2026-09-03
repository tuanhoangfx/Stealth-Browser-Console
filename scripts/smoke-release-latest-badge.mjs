#!/usr/bin/env node
/**
 * Guard: Update Release timeline row shows Latest (not Update) for running bundle.
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
if (!bundle.includes('label:"Latest"')) {
  fail("dist bundle missing RELEASE_LATEST_BADGE label");
}
if (!bundle.includes("extractHubReleaseNotesSemver")) {
  fail("dist bundle missing extractHubReleaseNotesSemver");
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
