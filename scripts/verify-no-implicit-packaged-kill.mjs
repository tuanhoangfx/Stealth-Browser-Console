#!/usr/bin/env node
/**
 * Gate — packaged Stealth Browser Console.exe must not be killed implicitly.
 * Allowed: close-packaged-stealth, close-stealth-prod-only (gated), restore/repair (allowKill), desktop-open --replace.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolRoot = path.resolve(root, "..");

const ALLOW_IMPORT = new Set([
  "scripts/close-packaged-stealth.mjs",
  "scripts/lib/close-stealth-prod-only.mjs",
  "scripts/restore-stealth-catalog.mjs",
  "scripts/repair-stealth-db.mjs",
  "scripts/dev-desktop-only.mjs",
  "scripts/desktop-open.mjs",
]);

const PATTERNS = [
  /closePackagedStealth\s*\(/,
  /closeStealthProdOnly\s*\(/,
  /close-packaged-stealth/,
  /taskkill.*Stealth Browser Console/i,
];

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function scanFile(file) {
  const r = rel(file);
  if (r === "scripts/verify-no-implicit-packaged-kill.mjs") return null;
  const text = fs.readFileSync(file, "utf8");
  const hits = PATTERNS.filter((re) => re.test(text));
  if (!hits.length) return null;
  if (ALLOW_IMPORT.has(r)) return null;
  return { file: r, patterns: hits.map(String) };
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "dist-desktop" || name === "out") continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(mjs|cjs|js|ts)$/.test(name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of [...walk(root), ...walk(path.join(toolRoot, "scripts"))]) {
  const row = scanFile(file);
  if (row) violations.push(row);
}

if (violations.length) {
  console.error("verify-no-implicit-packaged-kill: FAIL");
  for (const row of violations) {
    console.error(`  ${row.file}: ${row.patterns.join(", ")}`);
  }
  process.exit(1);
}

console.log("verify-no-implicit-packaged-kill: PASS");
