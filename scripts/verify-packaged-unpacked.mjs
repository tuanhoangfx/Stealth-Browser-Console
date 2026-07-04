#!/usr/bin/env node
/** Gate: win-unpacked must contain critical app.asar.unpacked modules (playwright-core, cloakbrowser). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unpacked = path.join(root, "dist-desktop", "win-unpacked", "resources", "app.asar.unpacked");

const REQUIRED = [
  "node_modules/playwright-core/index.js",
  "node_modules/cloakbrowser/package.json",
];

const missing = REQUIRED.filter((rel) => !fs.existsSync(path.join(unpacked, rel)));
if (missing.length === 0) {
  console.log("verify-packaged-unpacked: OK");
  process.exit(0);
}

console.error("verify-packaged-unpacked: FAIL — missing under app.asar.unpacked:");
for (const rel of missing) {
  console.error(`  ${rel}`);
}
console.error(`  root: ${unpacked}`);
process.exit(1);
