#!/usr/bin/env node
/**
 * Validate staged CWS package has all ES module + CSS import dependencies.
 * Usage: node scripts/validate-store-package.mjs [stageDir]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const printFiles = process.argv.includes("--print-files");
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const stageDir = path.resolve(
  positionalArgs[0] ?? (printFiles ? ROOT : path.join(ROOT, "dist", "E0001-cookie-bridge-store")),
);

const ENTRY_POINTS = [
  "build-info.js",
  "popup.js",
  "background.js",
  "content-bridge.js",
  "options.js",
  "popup.html",
  "options.html",
  "popup-theme.css",
  "options-theme.css",
];

function collectManifestEntryPoints(dir) {
  const out = new Set(ENTRY_POINTS);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return [...out];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest?.background?.service_worker) out.add(String(manifest.background.service_worker));
    if (manifest?.action?.default_popup) out.add(String(manifest.action.default_popup));
    if (manifest?.options_page) out.add(String(manifest.options_page));
    for (const cs of manifest?.content_scripts ?? []) {
      for (const js of cs?.js ?? []) out.add(String(js));
      for (const css of cs?.css ?? []) out.add(String(css));
    }
  } catch {
    // fallback to static ENTRY_POINTS
  }
  return [...out];
}

const IMPORT_RE = /(?:import\s+[^'"]+from\s+|import\s*)['"](\.\/[^'"]+)['"]/g;
const CSS_IMPORT_RE = /@import\s+['"](\.\/[^'"]+)['"]/g;
const HTML_ASSET_RE = /(?:href|src)=['"](\.\/[^'"]+)['"]/g;

function resolveRelative(fromFile, rel) {
  if (rel.endsWith(".mjs") || rel.endsWith(".css") || rel.endsWith(".js")) {
    return path.normalize(path.join(path.dirname(fromFile), rel));
  }
  const base = `${rel}.js`;
  return path.normalize(path.join(path.dirname(fromFile), base));
}

function collectDeps(fileRel, seen, missing) {
  if (seen.has(fileRel)) return;
  seen.add(fileRel);

  const abs = path.join(stageDir, fileRel);
  if (!fs.existsSync(abs)) {
    missing.add(fileRel);
    return;
  }

  const text = fs.readFileSync(abs, "utf8");
  const patterns =
    fileRel.endsWith(".css") ? [CSS_IMPORT_RE] : fileRel.endsWith(".html") ? [HTML_ASSET_RE] : [IMPORT_RE, CSS_IMPORT_RE];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const dep = resolveRelative(fileRel, m[1]);
      if (dep.startsWith("..")) continue;
      collectDeps(dep.replace(/\\/g, "/"), seen, missing);
    }
  }
}

function main() {
  if (!fs.existsSync(stageDir)) {
    console.error(`Stage dir not found: ${stageDir}`);
    process.exit(1);
  }

  const seen = new Set();
  const missing = new Set();

  for (const entry of collectManifestEntryPoints(stageDir)) {
    if (!fs.existsSync(path.join(stageDir, entry))) {
      missing.add(entry);
      continue;
    }
    collectDeps(entry, seen, missing);
  }

  if (missing.size) {
    console.error("Store package validation FAILED — missing files:");
    for (const f of [...missing].sort()) console.error(`  - ${f}`);
    process.exit(1);
  }

  if (printFiles) {
    const out = new Set(["manifest.json", ...seen]);
    for (const f of [...out].sort()) {
      console.log(f.replace(/\\/g, "/"));
    }
    return;
  }

  console.log(`Store package OK — ${seen.size} runtime files traced from entry points`);
}

main();
