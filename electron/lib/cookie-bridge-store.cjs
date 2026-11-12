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
  if (process.env.STEALTH_COOKIE_BRIDGE_LOCAL !== undefined) {
    const raw = String(process.env.STEALTH_COOKIE_BRIDGE_LOCAL).toLowerCase();
    return raw === "1" || raw === "true" || raw === "on";
  }
  try {
    const { getCookieBridgeSourceMode } = require("./app-settings.cjs");
    return getCookieBridgeSourceMode() === "workspace";
  } catch {
    return false;
  }
}

function isVerifiedStoreExtension(extensionDir) {
  const base = path.resolve(String(extensionDir || ""));
  return fs.existsSync(path.join(base, "_metadata", "verified_contents.json"));
}

/** Live workspace copy under E:\\Dev\\Extension (or bundled latest snapshot on standalone installs). */
function workspaceExtensionDir() {
  const override = String(process.env.STEALTH_COOKIE_BRIDGE_WORKSPACE_DIR || "").trim();
  const storeId = COOKIE_BRIDGE_STORE_ID;
  const packagedLatest =
    typeof process.resourcesPath === "string" && process.resourcesPath
      ? path.join(process.resourcesPath, "bundled-extensions", storeId, "unpacked-latest")
      : "";
  const candidates = [
    override,
    path.resolve(__dirname, "..", "..", "..", "..", "Extension", "E0001-cookie-bridge"),
    process.env.STEALTH_WORKSPACE_ROOT
      ? path.resolve(process.env.STEALTH_WORKSPACE_ROOT, "Extension", "E0001-cookie-bridge")
      : "",
    path.resolve("E:/Dev/Extension/E0001-cookie-bridge"),
    packagedLatest,
    path.resolve(__dirname, "..", "..", "build", "bundled-extensions", storeId, "unpacked-latest"),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "manifest.json"))) return path.resolve(dir);
  }
  return null;
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
  "scripts",
]);

/** Copy extension sources into a stable AppData cache (CloakBrowser stages by unpacked id under `.cloakbrowser`). */
function shouldCopyExtensionEntry(relativePath) {
  const rel = String(relativePath || "").replace(/\\/g, "/").toLowerCase();
  if (!rel || rel === ".") return true;
  const top = rel.split("/")[0];
  if (NON_RUNTIME_EXTENSION_DIRS.has(top)) return false;
  if (/^dist\/[^/]+-store(?:\/|$)/i.test(rel) || /^dist\/.*\.(?:zip|crx|sha256)$/i.test(rel)) {
    return false;
  }
  return true;
}

function pruneNonRuntimeCacheEntries(destDir) {
  for (const name of NON_RUNTIME_EXTENSION_DIRS) {
    const target = path.join(destDir, name);
    try {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
  const distDir = path.join(destDir, "dist");
  try {
    if (fs.existsSync(distDir) && fs.statSync(distDir).isDirectory()) {
      for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
        if (/-store$/i.test(entry.name) || /\.(?:zip|crx|sha256)$/i.test(entry.name)) {
          fs.rmSync(path.join(distDir, entry.name), { recursive: true, force: true });
        }
      }
      if (fs.readdirSync(distDir).length === 0) {
        fs.rmdirSync(distDir);
      }
    }
  } catch {
    /* best-effort */
  }
}

const CORE_RUNTIME_FILES = [
  "manifest.json",
  "build-info.js",
  "background.js",
  "popup.html",
  "popup.js",
  "auth-session.js",
  "content-bridge.js",
  "totp-clock.js",
];

const WORKSPACE_SYNC_TTL_MS = 30_000;
const _workspaceSyncCache = new Map();

function newestCoreRuntimeMtime(dir) {
  let newest = 0;
  for (const name of CORE_RUNTIME_FILES) {
    try {
      const st = fs.statSync(path.join(dir, name));
      if (st.mtimeMs > newest) newest = st.mtimeMs;
    } catch {
      /* ignore missing file */
    }
  }
  return newest;
}

function coreRuntimeFilesHealthy(srcDir, destDir) {
  try {
    if (!fs.existsSync(destDir)) return false;
    for (const name of CORE_RUNTIME_FILES) {
      const from = path.join(srcDir, name);
      if (!fs.existsSync(from)) continue;
      const to = path.join(destDir, name);
      if (!fs.existsSync(to)) return false;
      const srcStat = fs.statSync(from);
      const destStat = fs.statSync(to);
      if (srcStat.size > 0 && destStat.size === 0) return false;
      if (srcStat.size !== destStat.size) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hasCorruptedOrMismatchedRuntimeFiles(srcDir, destDir, rootSrc = srcDir) {
  try {
    if (!fs.existsSync(destDir)) return true;
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const from = path.join(srcDir, entry.name);
      if (!shouldCopyExtensionEntry(path.relative(rootSrc, from))) continue;
      const to = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        if (hasCorruptedOrMismatchedRuntimeFiles(from, to, rootSrc)) return true;
      } else if (entry.isFile()) {
        const srcStat = fs.statSync(from);
        if (!fs.existsSync(to)) return true;
        const destStat = fs.statSync(to);
        if (srcStat.size > 0 && destStat.size === 0) return true;
        if (srcStat.size !== destStat.size) return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

function syncExtensionFilesAtomically(srcDir, destDir, rootSrc = srcDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    if (!shouldCopyExtensionEntry(path.relative(rootSrc, from))) continue;
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      syncExtensionFilesAtomically(from, to, rootSrc);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const srcStat = fs.statSync(from);
      if (fs.existsSync(to)) {
        const destStat = fs.statSync(to);
        if (
          destStat.size === srcStat.size &&
          (srcStat.size === 0 || destStat.size > 0) &&
          Math.abs(destStat.mtimeMs - srcStat.mtimeMs) < 1
        ) {
          continue;
        }
      }
      const tmp = `${to}.tmp.${process.pid}.${Date.now()}`;
      fs.copyFileSync(from, tmp);
      try {
        fs.utimesSync(tmp, srcStat.atime, srcStat.mtime);
      } catch {
        /* ignore utimes failure */
      }
      try {
        fs.renameSync(tmp, to);
      } catch {
        try {
          fs.rmSync(tmp, { force: true });
        } catch {
          /* ignore */
        }
        fs.copyFileSync(from, to);
      }
    } catch {
      /* best-effort on locked file */
    }
  }
}

function syncExtensionDirToCache(
  sourceDir,
  userDataRoot = defaultUserDataRoot(),
  { force = false, _skipMirror = false } = {},
) {
  const src = path.resolve(String(sourceDir || ""));
  const dest = unpackedDir(userDataRoot);
  const srcManifest = path.join(src, "manifest.json");
  if (!fs.existsSync(srcManifest)) return null;
  const destManifest = path.join(dest, "manifest.json");
  const cacheKey = `${src}::${dest}`;
  const nowMs = Date.now();

  if (!force) {
    const cached = _workspaceSyncCache.get(cacheKey);
    if (cached && nowMs - cached.at < WORKSPACE_SYNC_TTL_MS) {
      try {
        const curManifestMtime = fs.statSync(srcManifest).mtimeMs;
        if (
          curManifestMtime === cached.srcManifestMtime &&
          newestCoreRuntimeMtime(src) === cached.srcCoreMtime &&
          fs.existsSync(destManifest)
        ) {
          return dest;
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (!force && fs.existsSync(destManifest) && !isVerifiedStoreExtension(dest)) {
    try {
      const srcVer = JSON.parse(fs.readFileSync(srcManifest, "utf8"))?.version;
      const destVer = JSON.parse(fs.readFileSync(destManifest, "utf8"))?.version;
      const srcCoreMtime = newestCoreRuntimeMtime(src);
      // Allow 2ms tolerance for JS Date sub-millisecond truncation in fs.utimesSync on NTFS
      if (
        srcVer === destVer &&
        srcCoreMtime <= newestCoreRuntimeMtime(dest) + 2 &&
        coreRuntimeFilesHealthy(src, dest)
      ) {
        const prev = _workspaceSyncCache.get(cacheKey);
        if (!prev?.pruned) {
          pruneNonRuntimeCacheEntries(dest);
        }
        _workspaceSyncCache.set(cacheKey, {
          at: nowMs,
          srcManifestMtime: fs.statSync(srcManifest).mtimeMs,
          srcCoreMtime,
          pruned: true,
        });
        return dest;
      }
    } catch {
      // fall through — refresh cache
    }
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const destMeta = path.join(dest, "_metadata");
  if (!isVerifiedStoreExtension(src) && fs.existsSync(destMeta)) {
    try {
      fs.rmSync(destMeta, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
  syncExtensionFilesAtomically(src, dest, src);
  pruneNonRuntimeCacheEntries(dest);
  try {
    _workspaceSyncCache.set(cacheKey, {
      at: Date.now(),
      srcManifestMtime: fs.statSync(srcManifest).mtimeMs,
      srcCoreMtime: newestCoreRuntimeMtime(src),
      pruned: true,
    });
  } catch {
    /* ignore */
  }
  if (!_skipMirror) {
    try {
      const defRoot = path.resolve(defaultUserDataRoot());
      if (path.resolve(userDataRoot).toLowerCase() === defRoot.toLowerCase()) {
        const altRoot = path.resolve("D:/StealthBrowser");
        if (
          fs.existsSync(path.join(altRoot, "extensions-cache")) &&
          altRoot.toLowerCase() !== defRoot.toLowerCase()
        ) {
          syncExtensionDirToCache(src, altRoot, { force: true, _skipMirror: true });
        }
        const { syncOperatorChromiumStages } = require("./operator-extension-stage.cjs");
        syncOperatorChromiumStages(dest, [], { force: true });
      }
    } catch {
      // best-effort secondary mirror & stage update
    }
  }
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
    const hasGithubReleaseMarker = fs.existsSync(path.join(cache, ".github-release.json"));
    if (
      fs.existsSync(path.join(cache, "manifest.json")) &&
      !isVerifiedStoreExtension(cache) &&
      !hasGithubReleaseMarker
    ) {
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

async function switchCookieBridgeSourceMode(userDataRoot = defaultUserDataRoot(), mode = "store") {
  const { setCookieBridgeSourceMode } = require("./app-settings.cjs");
  const normalized = setCookieBridgeSourceMode(mode);
  let targetDir = null;
  if (normalized === "workspace") {
    const workspace = workspaceExtensionDir();
    if (!workspace) {
      throw new Error("Workspace E0001-cookie-bridge folder not found");
    }
    targetDir = syncExtensionDirToCache(workspace, userDataRoot, { force: true });
    try {
      const altRoot = path.resolve("D:/StealthBrowser");
      if (
        fs.existsSync(path.join(altRoot, "extensions-cache")) &&
        path.resolve(userDataRoot).toLowerCase() !== altRoot.toLowerCase()
      ) {
        syncExtensionDirToCache(workspace, altRoot, { force: true });
      }
    } catch {
      // secondary cache sync is best-effort
    }
  } else {
    targetDir = await ensureCookieBridgeStoreExtension(userDataRoot);
  }
  if (targetDir) {
    try {
      const { syncOperatorChromiumStages } = require("./operator-extension-stage.cjs");
      syncOperatorChromiumStages(targetDir, [], { force: true });
    } catch {
      // stage sync is best-effort
    }
  }
  return { mode: normalized, resolvedPath: targetDir };
}

function startCookieBridgeWorkspaceAutoSync(userDataRoot = defaultUserDataRoot()) {
  if (globalThis.__STEALTH_E0001_WORKSPACE_WATCHER__) {
    return globalThis.__STEALTH_E0001_WORKSPACE_WATCHER__;
  }
  const workspace = workspaceExtensionDir();
  if (!workspace || !fs.existsSync(path.join(workspace, "manifest.json"))) return null;
  let debounceTimer = null;
  const triggerSync = () => {
    try {
      if (!useLocalDevExtension()) return;
      syncExtensionDirToCache(workspace, userDataRoot);
    } catch {
      /* ignore */
    }
  };
  let watcher = null;
  try {
    watcher = fs.watch(workspace, { persistent: false }, (_eventType, filename) => {
      const name = String(filename || "").replace(/\\/g, "/").toLowerCase();
      if (
        name &&
        (name.startsWith(".") ||
          name.includes("node_modules") ||
          name.startsWith("scripts/") ||
          name === "scripts" ||
          /^dist\/[^/]+-store(?:\/|$)/i.test(name))
      ) {
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(triggerSync, 400);
      if (typeof debounceTimer.unref === "function") debounceTimer.unref();
    });
    if (typeof watcher.unref === "function") watcher.unref();
  } catch {
    /* fs.watch unavailable */
  }
  const interval = setInterval(triggerSync, 60_000);
  if (typeof interval.unref === "function") interval.unref();
  const state = {
    workspace,
    stop() {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (watcher) {
        try {
          watcher.close();
        } catch {
          /* ignore */
        }
      }
      clearInterval(interval);
      delete globalThis.__STEALTH_E0001_WORKSPACE_WATCHER__;
    },
  };
  globalThis.__STEALTH_E0001_WORKSPACE_WATCHER__ = state;
  triggerSync();
  return state;
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
  switchCookieBridgeSourceMode,
  startCookieBridgeWorkspaceAutoSync,
};
