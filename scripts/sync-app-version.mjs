#!/usr/bin/env node
/**
 * Sync `src/lib/app-meta.ts` from package.json version.
 * - Source of truth: package.json#version
 * - Target: src/lib/app-meta.ts exports APP_VERSION
 *
 * PowerShell-safe (no &&). Runs fast; safe to run on every predev/build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
 
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const outPath = path.join(root, "src", "lib", "app-meta.ts");
 
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = String(pkg?.version || "").trim();
if (!version) {
  console.error("sync-app-version: package.json version missing");
  process.exit(1);
}
 
const next = `export const APP_VERSION = "${version}";\n`;
const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
if (existing === next) {
  console.log(`sync-app-version: ok (v${version})`);
  process.exit(0);
}
 
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, next);
console.log(`sync-app-version: wrote v${version} (${crypto.randomUUID().slice(0, 8)})`);

