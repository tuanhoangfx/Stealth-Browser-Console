#!/usr/bin/env node
/**
 * Update chromeWebStore block in tool.manifest.json after manual CWS actions.
 *
 * Usage:
 *   node scripts/cws-update-manifest-status.mjs --status in_review
 *   node scripts/cws-update-manifest-status.mjs --status published --visibility unlisted
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "tool.manifest.json");

const VALID_STATUS = new Set(["draft", "in_review", "published", "rejected", "unknown"]);
const VALID_VISIBILITY = new Set(["public", "unlisted", "private", "unknown"]);

function readArg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const status = readArg("--status");
const visibility = readArg("--visibility");

if (!status || !VALID_STATUS.has(status)) {
  console.error("Usage: --status draft|in_review|published|rejected|unknown [--visibility public|unlisted|private]");
  process.exit(1);
}
if (visibility && !VALID_VISIBILITY.has(visibility)) {
  console.error("Invalid --visibility");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const now = new Date().toISOString();
manifest.chromeWebStore = {
  ...(manifest.chromeWebStore ?? {}),
  listingStatus: status,
  ...(visibility ? { visibility } : {}),
  lastStatusAt: now,
  ...(status === "in_review" && !manifest.chromeWebStore?.submittedAt
    ? { submittedAt: now.slice(0, 10) }
    : {}),
  shareHint:
    status === "published" && (visibility ?? manifest.chromeWebStore?.visibility) === "unlisted"
      ? "Unlisted — share direct Chrome Web Store URL with team only."
      : status === "published"
        ? "Public on Chrome Web Store."
        : "While in review: team installs via GitHub ZIP. After approval: switch Distribution → Unlisted for link-only sharing.",
};

if (status === "published") {
  manifest.nextActions = (manifest.nextActions ?? []).filter(
    (a) => !/CWS listing|submit for review/i.test(String(a)),
  );
  manifest.nextActions.unshift("Monitor CWS review outcome; set Unlisted visibility for team-only sharing if needed.");
}

manifest.health = {
  ...(manifest.health ?? {}),
  note: `CWS ${status}${visibility ? ` (${visibility})` : ""} — ${manifest.urls?.chromeWebStoreId ?? "?"}`,
};
manifest.manifestUpdatedAt = now;

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`tool.manifest.json ← listingStatus=${status}${visibility ? ` visibility=${visibility}` : ""}`);

const p0020Script = path.join(ROOT, "scripts", "sync-p0020-cws-badge.mjs");
if (fs.existsSync(p0020Script)) {
  spawnSync(process.execPath, [p0020Script], { stdio: "inherit", cwd: ROOT });
}
