#!/usr/bin/env node
/**
 * Keep `src/lib/app-meta.ts` on the P0020 SSOT: APP_VERSION from package.json.
 * Do not rewrite a hardcoded version string — hook `bump-product-patch` owns semver.
 *
 * PowerShell-safe (no &&). Runs fast; safe on every predev/build/release.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const outPath = path.join(root, "src", "lib", "app-meta.ts");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = String(pkg?.version || "").trim();
if (!version) {
  console.error("sync-app-version: package.json version missing");
  process.exit(1);
}

const next = `import packageJson from "../../package.json";

/** App release label (keep in sync with package.json version). */
export const APP_VERSION = packageJson.version;

/** Sidebar brand — human name only (version lives in tab header). */
export const STEALTH_PRODUCT = {
  code: "P0003",
  name: "Stealth Browser Console",
} as const;
`;

const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
if (existing === next) {
  console.log(`sync-app-version: ok (package.json v${version})`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, next);
console.log(`sync-app-version: restored package.json import (v${version})`);
