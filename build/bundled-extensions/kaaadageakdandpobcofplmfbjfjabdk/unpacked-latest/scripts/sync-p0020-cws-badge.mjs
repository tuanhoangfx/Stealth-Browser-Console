#!/usr/bin/env node
/**
 * Write P0020 extensionCwsBuildInfo.ts from E0001 tool.manifest.json.
 * Used locally and in cws-status-check workflow when P0020 repo is checked out.
 *
 * Usage:
 *   node scripts/sync-p0020-cws-badge.mjs
 *   node scripts/sync-p0020-cws-badge.mjs --p0020 /path/to/P0020-Data-Box
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "tool.manifest.json");
const DEFAULT_P0020 = path.resolve(ROOT, "..", "..", "Tool", "P0020-Data-Box");

function readArg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function readListingStatus() {
  const tool = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  return tool.chromeWebStore?.listingStatus ?? "unknown";
}

function writeCwsBuildInfo(p0020Root, listingStatus) {
  const outPath = path.join(p0020Root, "src", "features", "cookie", "extensionCwsBuildInfo.ts");
  const out = `/**
 * CWS listing status — auto-synced from E0001 tool.manifest.json.
 * Do not edit by hand. Source: E0001 scripts/sync-p0020-cws-badge.mjs
 */
export type ExtensionCwsListingStatus = "draft" | "in_review" | "published" | "rejected" | "unknown";

export const EXTENSION_CWS_LISTING_STATUS = "${listingStatus}" as ExtensionCwsListingStatus;
`;
  writeFileSync(outPath, out);
  console.log(`P0020 extensionCwsBuildInfo.ts ← ${listingStatus}`);
  return outPath;
}

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing ${MANIFEST_PATH}`);
  }
  const p0020Root = readArg("--p0020") ?? DEFAULT_P0020;
  if (!existsSync(path.join(p0020Root, "package.json"))) {
    console.warn(`P0020 not found at ${p0020Root} — skipped`);
    process.exit(0);
  }
  const listingStatus = readListingStatus();
  writeCwsBuildInfo(p0020Root, listingStatus);
}

main();
