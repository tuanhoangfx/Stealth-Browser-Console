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
const {
  compareExtensionVersions,
  defaultUserDataRoot,
  ensureStoreExtension,
  unpackedDirForStoreId,
} = require("../electron/lib/webstore-extension.cjs");
const { COOKIE_BRIDGE_STORE_ID } = require("../electron/lib/stealth-extension-store-ids.cjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const force = process.argv.includes("--force");

const storeId = COOKIE_BRIDGE_STORE_ID;
const targetDir = path.join(repoRoot, "build", "bundled-extensions", storeId, "unpacked");
const targetLatestDir = path.join(repoRoot, "build", "bundled-extensions", storeId, "unpacked-latest");
const scriptsCacheDir = path.join(repoRoot, "scripts", "extensions-cache", storeId, "unpacked");
const workspaceDir = path.resolve(repoRoot, "..", "..", "Extension", "E0001-cookie-bridge");
const targetManifest = path.join(targetDir, "manifest.json");
const targetVerified = path.join(targetDir, "_metadata", "verified_contents.json");
const { shouldCopyExtensionEntry } = require("../electron/lib/cloakbrowser-extension-stage.cjs");
const { syncExtensionDirToCache } = require("../electron/lib/cookie-bridge-store.cjs");

function readVersion(dir) {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).version || "").trim();
  } catch {
    return "";
  }
}

function syncLatestWorkspaceSnapshot() {
  if (!fs.existsSync(path.join(workspaceDir, "manifest.json"))) return;
  const wsVer = readVersion(workspaceDir);
  for (const dest of [targetLatestDir, scriptsCacheDir]) {
    const curVer = readVersion(dest);
    const staging = `${dest}.staging`;
    if (fs.existsSync(staging)) {
      try {
        fs.rmSync(staging, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(workspaceDir, dest, {
      recursive: true,
      force: true,
      filter: (entry) => shouldCopyExtensionEntry(path.relative(workspaceDir, entry)),
    });
    console.log(
      `sync-bundled-e0001: synced latest workspace snapshot v${curVer || "none"} → v${wsVer} (${path.relative(repoRoot, dest)})`,
    );
  }
  try {
    syncExtensionDirToCache(workspaceDir, undefined, { force: true });
  } catch {
    /* ignore */
  }
}

syncLatestWorkspaceSnapshot();

const hasCommitted = fs.existsSync(targetManifest) && fs.existsSync(targetVerified);

if (hasCommitted && !force) {
  const localCache = unpackedDirForStoreId(defaultUserDataRoot(), storeId);
  const localVerified = path.join(localCache, "_metadata", "verified_contents.json");
  const committedVer = readVersion(targetDir);
  const cacheVer = fs.existsSync(localVerified) ? readVersion(localCache) : "";
  if (cacheVer && compareExtensionVersions(cacheVer, committedVer) > 0) {
    const staging = `${targetDir}.staging`;
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    fs.cpSync(localCache, staging, { recursive: true, force: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.renameSync(staging, targetDir);
    console.log(`sync-bundled-e0001: upgraded bundled snapshot v${committedVer} → v${cacheVer} from local verified cache.`);
    process.exit(0);
  }
  console.log(`sync-bundled-e0001: snapshot present (v${committedVer}), skipping download. Use --force to refresh.`);
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
