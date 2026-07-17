/**
 * E0001 Cookie Bridge — Chrome Web Store release (not local Extension/).
 * https://chromewebstore.google.com/detail/e0001-cookie-bridge/kaaadageakdandpobcofplmfbjfjabdk
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  defaultUserDataRoot,
  ensureStoreExtension,
  unpackedDirForStoreId,
  storeUpdateUrl,
} = require("./webstore-extension.cjs");
const { COOKIE_BRIDGE_STORE_ID } = require("./stealth-extension-store-ids.cjs");

const STORE_UPDATE_URL = storeUpdateUrl(COOKIE_BRIDGE_STORE_ID);

let warmPromise = null;

function cacheRoot(userDataRoot = defaultUserDataRoot()) {
  return path.join(userDataRoot, "extensions-cache", COOKIE_BRIDGE_STORE_ID);
}

function unpackedDir(userDataRoot = defaultUserDataRoot()) {
  return unpackedDirForStoreId(userDataRoot, COOKIE_BRIDGE_STORE_ID);
}

function cookieBridgeEnabled() {
  const raw = String(process.env.STEALTH_COOKIE_BRIDGE ?? "1").toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function useLocalDevExtension() {
  const raw = String(process.env.STEALTH_COOKIE_BRIDGE_LOCAL ?? "0").toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function isVerifiedStoreExtension(extensionDir) {
  const base = path.resolve(String(extensionDir || ""));
  return fs.existsSync(path.join(base, "_metadata", "verified_contents.json"));
}

/** Live workspace copy under E:\\Dev\\Extension (dev builds). */
function workspaceExtensionDir() {
  const local = path.resolve(__dirname, "..", "..", "..", "..", "Extension", "E0001-cookie-bridge");
  return fs.existsSync(path.join(local, "manifest.json")) ? local : null;
}

// Dev/publish dirs that are never runtime extension files. Must match
// cloakbrowser-extension-stage.cjs — kept as a local copy to avoid a circular
// require (that module already depends on this one).
const NON_RUNTIME_EXTENSION_DIRS = new Set([
  ".git",
  "node_modules",
  ".chrome-store-profile",
  ".github",
  ".cursor",
  ".vscode",
  ".dev",
  "docs",
  "coverage",
  ".turbo",
]);

/** Copy extension sources into a stable AppData cache (CloakBrowser stages by unpacked id under `.cloakbrowser`). */
function shouldCopyExtensionEntry(relativePath) {
  const rel = String(relativePath || "").replace(/\\/g, "/").toLowerCase();
  if (!rel || rel === ".") return true;
  const top = rel.split("/")[0];
  if (NON_RUNTIME_EXTENSION_DIRS.has(top)) return false;
  return true;
}

function syncExtensionDirToCache(sourceDir, userDataRoot = defaultUserDataRoot()) {
  const src = path.resolve(String(sourceDir || ""));
  const dest = unpackedDir(userDataRoot);
  const srcManifest = path.join(src, "manifest.json");
  if (!fs.existsSync(srcManifest)) return null;
  const destManifest = path.join(dest, "manifest.json");
  if (fs.existsSync(destManifest)) {
    try {
      if (fs.statSync(srcManifest).mtimeMs <= fs.statSync(destManifest).mtimeMs) return dest;
    } catch {
      // fall through — refresh cache
    }
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (entry) => shouldCopyExtensionEntry(path.relative(src, entry)),
  });
  return dest;
}

/**
 * Verified store E0001 shipped inside the installer (extraResources →
 * `resources/bundled-extensions/<id>/unpacked`). Lets a fresh install load E0001
 * on the very first profile open with NO Chrome Web Store download — the ~1MB
 * verified snapshot is copied straight into the AppData cache. Chromium's own
 * extension updater still refreshes it later from the store id.
 */
function bundledCookieBridgeDir() {
  const storeId = COOKIE_BRIDGE_STORE_ID;
  const candidates = [];
  try {
    const { app } = require("electron");
    if (app?.isPackaged && process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, "bundled-extensions", storeId, "unpacked"));
    }
  } catch {
    // not running under Electron (unit tests / node) — fall back to repo build dir
  }
  candidates.push(path.resolve(__dirname, "..", "..", "build", "bundled-extensions", storeId, "unpacked"));
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "manifest.json"))) return dir;
  }
  return null;
}

/** Copy the bundled verified store snapshot into the AppData cache (once, when empty). */
function seedCacheFromBundle(userDataRoot = defaultUserDataRoot()) {
  const dest = unpackedDir(userDataRoot);
  if (fs.existsSync(path.join(dest, "manifest.json"))) return dest;
  const bundle = bundledCookieBridgeDir();
  // Only seed verified store bytes — an unverified copy cannot load under the store id.
  if (!bundle || !isVerifiedStoreExtension(bundle)) return null;
  const staging = `${dest}.seed`;
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    fs.cpSync(bundle, staging, { recursive: true, force: true });
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(staging, dest);
    return dest;
  } catch {
    try {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return null;
  }
}

/**
 * Launch path for profile prefs — always the AppData cache, never workspace.
 * Workspace is synced into cache when present so dev edits still apply.
 */
function resolveCachedExtensionDir(userDataRoot = defaultUserDataRoot()) {
  const cache = unpackedDir(userDataRoot);
  if (useLocalDevExtension()) {
    const workspace = workspaceExtensionDir();
    if (workspace) syncExtensionDirToCache(workspace, userDataRoot);
    return fs.existsSync(path.join(cache, "manifest.json")) ? cache : null;
  }
  if (isVerifiedStoreExtension(cache)) return cache;
  if (fs.existsSync(path.join(cache, "manifest.json"))) return cache;
  const seeded = seedCacheFromBundle(userDataRoot);
  if (seeded && isVerifiedStoreExtension(seeded)) return seeded;
  return null;
}

async function ensureCookieBridgeStoreExtension(userDataRoot = defaultUserDataRoot()) {
  if (!cookieBridgeEnabled()) return null;

  if (!useLocalDevExtension()) {
    const cache = unpackedDir(userDataRoot);
    if (fs.existsSync(path.join(cache, "manifest.json")) && !isVerifiedStoreExtension(cache)) {
      try {
        fs.rmSync(cacheRoot(userDataRoot), { recursive: true, force: true });
      } catch {
        // best-effort — workspace copy cannot load as Web Store id
      }
    }
  }

  const cached = resolveCachedExtensionDir(userDataRoot);
  if (cached) return cached;

  const { unpackedPath } = await ensureStoreExtension(userDataRoot, COOKIE_BRIDGE_STORE_ID);
  return unpackedPath;
}

function warmCookieBridgeStoreCache(userDataRoot = defaultUserDataRoot()) {
  if (!cookieBridgeEnabled()) return Promise.resolve(null);
  const cached = resolveCachedExtensionDir(userDataRoot);
  if (cached) return Promise.resolve(cached);
  if (!warmPromise) {
    warmPromise = ensureCookieBridgeStoreExtension(userDataRoot).catch((error) => {
      warmPromise = null;
      throw error;
    });
  }
  return warmPromise;
}

function resolveCookieBridgeExtensionDirSync(userDataRoot = defaultUserDataRoot()) {
  if (!cookieBridgeEnabled()) return null;
  return resolveCachedExtensionDir(userDataRoot);
}

module.exports = {
  COOKIE_BRIDGE_STORE_ID,
  STORE_UPDATE_URL,
  cookieBridgeEnabled,
  ensureCookieBridgeStoreExtension,
  warmCookieBridgeStoreCache,
  resolveCookieBridgeExtensionDirSync,
  resolveCachedExtensionDir,
  bundledCookieBridgeDir,
  seedCacheFromBundle,
  syncExtensionDirToCache,
  isVerifiedStoreExtension,
  workspaceExtensionDir,
  unpackedDir,
  useLocalDevExtension,
};
