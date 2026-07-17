#!/usr/bin/env node
/**
 * Refresh the verified E0001 snapshot bundled into the installer
 * (`build/bundled-extensions/<storeId>/unpacked`, shipped via extraResources).
 *
 * A fresh install seeds this snapshot straight into the AppData cache so the very
 * first profile open loads E0001 with NO Chrome Web Store download (offline-safe).
 * Chromium's own extension updater refreshes it later from the store id.
 *
 * Run at release time. If the store download fails but a committed snapshot already
 * exists, this WARNs instead of failing — the release still ships a working (older)
 * E0001. Use --force to always re-download.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ensureStoreExtension } = require("../electron/lib/webstore-extension.cjs");
const { COOKIE_BRIDGE_STORE_ID } = require("../electron/lib/stealth-extension-store-ids.cjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const force = process.argv.includes("--force");

const storeId = COOKIE_BRIDGE_STORE_ID;
const targetDir = path.join(repoRoot, "build", "bundled-extensions", storeId, "unpacked");
const targetManifest = path.join(targetDir, "manifest.json");
const targetVerified = path.join(targetDir, "_metadata", "verified_contents.json");

function readVersion(dir) {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).version || "").trim();
  } catch {
    return "";
  }
}

const hasCommitted = fs.existsSync(targetManifest) && fs.existsSync(targetVerified);

if (hasCommitted && !force) {
  console.log(`sync-bundled-e0001: snapshot present (v${readVersion(targetDir)}), skipping download. Use --force to refresh.`);
  process.exit(0);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "e0001-bundle-"));

try {
  const { unpackedPath, cached } = await ensureStoreExtension(tmpRoot, storeId, { force: true });
  const verified = path.join(unpackedPath, "_metadata", "verified_contents.json");
  if (!fs.existsSync(verified)) {
    throw new Error("downloaded store extension is not verified (missing _metadata/verified_contents.json)");
  }
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  const staging = `${targetDir}.staging`;
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(unpackedPath, staging, { recursive: true, force: true });
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  fs.renameSync(staging, targetDir);
  const count = fs.readdirSync(targetDir, { recursive: true }).length;
  console.log(`sync-bundled-e0001: refreshed v${readVersion(targetDir)} (${count} entries, cached=${cached}) → ${path.relative(repoRoot, targetDir)}`);
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (hasCommitted) {
    console.warn(`sync-bundled-e0001: WARN download failed (${msg}); keeping committed snapshot v${readVersion(targetDir)}.`);
    process.exit(0);
  }
  console.error(`sync-bundled-e0001: FAIL — no committed snapshot and download failed: ${msg}`);
  process.exit(1);
} finally {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
