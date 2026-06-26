#!/usr/bin/env node
/** Verify hub brand + vector icons exist in public/ or dist/ (Electron packaging gate). */
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distIdx = process.argv.indexOf("--dist");
const base = distIdx !== -1 ? path.join(root, "dist") : path.join(root, "public");

const REQUIRED_BRAND = [
  "google.png",
  "github.png",
  "microsoft.png",
  "facebook.png",
  "chatgpt.png",
  "zalo.png",
  "higgsfield.png",
];
/** Registry entries still on /icons/*.svg (optional parity). */
const OPTIONAL_VECTOR = ["youtube.svg", "docker.svg"];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const label = distIdx !== -1 ? "dist" : "public";
  const missing = [];
  for (const file of REQUIRED_BRAND) {
    const p = path.join(base, "assets", "brand-icons", file);
    if (!(await exists(p))) missing.push(`${label}/assets/brand-icons/${file}`);
  }
  for (const file of OPTIONAL_VECTOR) {
    const p = path.join(base, "icons", file);
    if (!(await exists(p))) console.warn(`verify-brand-assets: optional missing ${label}/icons/${file}`);
  }
  if (missing.length) {
    console.error("verify-brand-assets: missing:");
    for (const m of missing) console.error(`  - ${m}`);
    console.error("Run: node ../../scripts/sync-hub-brand-icons.mjs --code P0003");
    process.exit(1);
  }
  console.log(`verify-brand-assets OK (${label}) — ${REQUIRED_BRAND.length} brand + ${REQUIRED_VECTOR.length} vector`);
}

main();
