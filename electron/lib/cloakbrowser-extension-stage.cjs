const fs = require("node:fs");
const path = require("node:path");
const { unpackedExtensionId } = require("./profile-chrome-preferences.cjs");
const { COOKIE_BRIDGE_STORE_ID, workspaceExtensionDir } = require("./cookie-bridge-store.cjs");

// Top-level dirs that are dev/publish artifacts, never referenced by an
// extension manifest at runtime. Excluding them from the staging copy keeps the
// cpSync tiny — e.g. E0001 ships a 988-file `.chrome-store-profile` dev folder
// that otherwise inflated cold profile opens by ~9s (staging 98MB per new root).
const NON_RUNTIME_STAGE_DIRS = new Set([
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

function newestIconMtime(dir) {
  const icons = path.join(dir, "icons");
  if (!fs.existsSync(icons)) return 0;
  let newest = 0;
  for (const name of fs.readdirSync(icons)) {
    if (!/\.(png|svg)$/i.test(name)) continue;
    try {
      newest = Math.max(newest, fs.statSync(path.join(icons, name)).mtimeMs);
    } catch {
      // a missing icon does not block the rest
    }
  }
  return newest;
}

/** True when any Stealth profile has Chrome's lock. A leftover empty lockfile does not count. */
function profileDirIsLive(dir) {
  if (fs.existsSync(path.join(dir, "SingletonLock"))) return true;
  const lock = path.join(dir, "lockfile");
  if (!fs.existsSync(lock)) return false;
  try {
    const fd = fs.openSync(lock, "r+");
    fs.closeSync(fd);
    return false;
  } catch (error) {
    return error?.code === "EBUSY" || error?.code === "EPERM";
  }
}

function anyProfileLive(options = {}) {
  if (typeof options.isAnyProfileLive === "function") return Boolean(options.isAnyProfileLive());
  try {
    const { isDatabaseReady, getDb } = require("../db/init.cjs");
    if (typeof isDatabaseReady === "function" && isDatabaseReady()) {
      const row = getDb()
        .prepare("SELECT 1 AS ok FROM profiles WHERE status IN ('running', 'opening') LIMIT 1")
        .get();
      return Boolean(row?.ok);
    }
  } catch {
    /* fall through */
  }
  try {
    const { resolveProfilesRoot } = require("./profiles-location.cjs");
    const { resolveStealthUserDataRoot } = require("./user-data-root.cjs");
    const roots = new Set();
    for (const packaged of [true, false]) {
      const profiles = resolveProfilesRoot(resolveStealthUserDataRoot({ packaged }));
      if (profiles) roots.add(path.resolve(profiles));
    }
    for (const profiles of roots) {
      if (!fs.existsSync(profiles)) continue;
      let checked = 0;
      for (const entry of fs.readdirSync(profiles, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (profileDirIsLive(path.join(profiles, entry.name))) return true;
        if (++checked >= 32) break;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function shouldCopyExtensionEntry(relativePath) {
  const rel = String(relativePath || "").replace(/\\/g, "/").toLowerCase();
  if (!rel || rel === ".") return true;
  const top = rel.split("/")[0];
  if (NON_RUNTIME_STAGE_DIRS.has(top)) return false;
  if (/^dist\/[^/]+-store(?:\/|$)/i.test(rel) || /^dist\/.*\.(?:zip|crx|sha256)$/i.test(rel)) {
    return false;
  }
  return true;
}

/**
 * CloakBrowser resolves store extensions under `<cacheDir>/<storeId>/` when prefs use Web Store id.
 * Unpacked/dev paths keep the hash id from absolute path.
 */
function resolveStageExtensionId(extensionDir) {
  const abs = path.resolve(String(extensionDir || "")).replace(/\\/g, "/");
  const storeMatch = abs.match(/\/extensions-cache\/([a-p]{32})\/unpacked\/?$/i);
  if (storeMatch) return storeMatch[1].toLowerCase();

  const workspace = workspaceExtensionDir();
  if (workspace && path.resolve(workspace).replace(/\\/g, "/") === abs) {
    return COOKIE_BRIDGE_STORE_ID;
  }

  return unpackedExtensionId(extensionDir);
}

function readManifestVersionSync(manifestPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return String(parsed?.version || "").trim();
  } catch {
    return "";
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
        const isImageAsset = /\.(?:png|svg|ico|webp)$/i.test(entry.name);
        if (!isImageAsset && srcStat.size !== destStat.size) return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

function copyExtensionTreeBestEffort(src, dest, rootSrc = src) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    if (!shouldCopyExtensionEntry(path.relative(rootSrc, from))) continue;
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyExtensionTreeBestEffort(from, to, rootSrc);
    } else if (entry.isFile()) {
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
          /* ignore */
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
        // best-effort for locked binary/asset
      }
    }
  }
}

const STAGE_CACHE_TTL_MS = 30_000;
const _stageResultCache = new Map();

const STAGE_CORE_RUNTIME_CANDIDATES = [
  "manifest.json",
  "build-info.js",
  "background.js",
  "popup.html",
  "popup.js",
  "auth-session.js",
  "content-bridge.js",
  "totp-clock.js",
];

function newestStageCoreMtime(dir) {
  let newest = 0;
  for (const rel of STAGE_CORE_RUNTIME_CANDIDATES) {
    try {
      const st = fs.statSync(path.join(dir, rel));
      if (st.mtimeMs > newest) newest = st.mtimeMs;
    } catch {
      /* ignore missing candidate */
    }
  }
  return newest;
}

function coreStageFilesHealthy(srcDir, stageDir) {
  try {
    const manifestPath = path.join(srcDir, "manifest.json");
    const stageManifestPath = path.join(stageDir, "manifest.json");
    if (!fs.existsSync(manifestPath) || !fs.existsSync(stageManifestPath)) return false;
    const checks = new Set(STAGE_CORE_RUNTIME_CANDIDATES);
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (parsed?.background?.service_worker) checks.add(String(parsed.background.service_worker));
      if (parsed?.action?.default_popup) checks.add(String(parsed.action.default_popup));
    } catch {
      /* ignore parse error */
    }
    for (const rel of checks) {
      const from = path.join(srcDir, rel);
      if (!fs.existsSync(from)) continue;
      const to = path.join(stageDir, rel);
      if (!fs.existsSync(to)) return false;
      const srcStat = fs.statSync(from);
      const toStat = fs.statSync(to);
      if (srcStat.size > 0 && toStat.size === 0) return false;
      if (srcStat.size !== toStat.size) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * CloakBrowser Chromium resolves unpacked extensions under `<cacheDir>/<extId>/`.
 * Pre-stage files there so Chrome never shows "manifest missing" for the staging folder.
 */
function ensureCloakbrowserExtensionStage(extensionDir, cloakCacheDir, options = {}) {
  const src = path.resolve(String(extensionDir || ""));
  const manifest = path.join(src, "manifest.json");
  if (!fs.existsSync(manifest)) return null;

  const cacheRoot = path.resolve(String(cloakCacheDir || ""));
  if (!cacheRoot) return null;

  const extId = resolveStageExtensionId(src);
  const stageDir = path.join(cacheRoot, extId);
  const stageManifest = path.join(stageDir, "manifest.json");

  const cacheKey = `${src}::${cacheRoot}`;
  const nowMs = Date.now();
  if (!options.force && typeof options.isAnyProfileLive !== "function") {
    const cached = _stageResultCache.get(cacheKey);
    if (cached && nowMs - cached.at < STAGE_CACHE_TTL_MS) {
      try {
        const curMtime = fs.statSync(manifest).mtimeMs;
        if (
          curMtime === cached.srcManifestMtime &&
          newestStageCoreMtime(src) === cached.srcCoreMtime &&
          coreStageFilesHealthy(src, stageDir)
        ) {
          return cached.result;
        }
      } catch {
        /* fall through to full check */
      }
    }
  }

  const srcVersion = readManifestVersionSync(manifest);
  const stageVersion = fs.existsSync(stageManifest) ? readManifestVersionSync(stageManifest) : "";
  const versionChanged = Boolean(srcVersion && stageVersion && srcVersion !== stageVersion);

  const srcVerified = fs.existsSync(path.join(src, "_metadata", "verified_contents.json"));
  const stageVerified = fs.existsSync(path.join(stageDir, "_metadata", "verified_contents.json"));
  const verifiedChanged = srcVerified !== stageVerified;
  const srcCoreMtime = newestStageCoreMtime(src);
  // Allow 2ms tolerance for JS Date sub-millisecond truncation in fs.utimesSync on NTFS
  const fastCoreMatch =
    !options.force &&
    !versionChanged &&
    !verifiedChanged &&
    fs.existsSync(stageManifest) &&
    srcCoreMtime <= newestStageCoreMtime(stageDir) + 2 &&
    coreStageFilesHealthy(src, stageDir);
  const corruptedOrMismatched = fastCoreMatch
    ? false
    : hasCorruptedOrMismatchedRuntimeFiles(src, stageDir, src);
  const criticalUpgrade =
    Boolean(options.force) || versionChanged || verifiedChanged || corruptedOrMismatched;

  let needsCopy = !fs.existsSync(stageManifest) || criticalUpgrade;
  if (!needsCopy) {
    try {
      needsCopy = fs.statSync(manifest).mtimeMs > fs.statSync(stageManifest).mtimeMs + 2;
    } catch {
      needsCopy = true;
    }
  }
  if (srcVerified && !stageVerified) needsCopy = true;
  if (newestIconMtime(src) > newestIconMtime(stageDir) + 2) needsCopy = true;

  // A live profile junctions this same stage folder. Skip icon/mtime-only overwrites so its
  // toolbar keeps the files it opened with, unless manifest version changed or force is set.
  if (needsCopy && !criticalUpgrade && fs.existsSync(stageManifest) && anyProfileLive(options)) {
    needsCopy = false;
  }

  // operator-extension-stage junctions `<cache>/<id>` → `extension-stage/<id>`;
  // cpSync refuses to overwrite a link, so write through to its real folder.
  let copyDir = stageDir;
  try {
    if (fs.lstatSync(stageDir).isSymbolicLink()) copyDir = fs.realpathSync(stageDir);
  } catch {
    // ENOENT — plain folder created below
  }

  if (needsCopy) {
    copyExtensionTreeBestEffort(src, copyDir, src);
    if (!srcVerified) {
      try {
        fs.rmSync(path.join(copyDir, "_metadata"), { recursive: true, force: true });
      } catch {
        // best-effort when switching from verified store cache to workspace build
      }
    }
  }

  // Prune dev/publish dirs that older (unfiltered) stages may have already
  // copied — cpSync never removes stale entries, and Chromium re-validates the
  // whole unpacked folder on each new profile's first install, so a leftover
  // 98MB `.chrome-store-profile` keeps opens slow until pruned.
  pruneNonRuntimeStageDirs(copyDir);

  if (!fs.existsSync(stageManifest)) return null;
  const result = { extId, stageDir, sourceDir: src };
  if (typeof options.isAnyProfileLive !== "function") {
    try {
      _stageResultCache.set(cacheKey, {
        at: nowMs,
        srcManifestMtime: fs.statSync(manifest).mtimeMs,
        srcCoreMtime: newestStageCoreMtime(src),
        result,
      });
    } catch {
      /* ignore */
    }
  }
  return result;
}

function pruneNonRuntimeStageDirs(stageDir) {
  for (const name of NON_RUNTIME_STAGE_DIRS) {
    const target = path.join(stageDir, name);
    try {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    } catch {
      // best-effort — a locked dev dir just stays, no correctness impact
    }
  }
  const distDir = path.join(stageDir, "dist");
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
    // best-effort
  }
}

function ensureCloakbrowserExtensionStages(extensionDirs, cloakCacheDir, options = {}) {
  const staged = [];
  for (const dir of extensionDirs || []) {
    const result = ensureCloakbrowserExtensionStage(dir, cloakCacheDir, options);
    if (result) staged.push(result);
  }
  return staged;
}

/** Pre-stage every launch extension into CloakBrowser cache (startup warm). */
async function warmExtensionStagesForRoot(userDataRoot, cloakCacheDir) {
  const { resolveNativeExtensionDirs } = require("./native-extension-load.cjs");
  const dirs = resolveNativeExtensionDirs(userDataRoot);
  return ensureCloakbrowserExtensionStages(dirs, cloakCacheDir);
}

module.exports = {
  resolveStageExtensionId,
  ensureCloakbrowserExtensionStage,
  ensureCloakbrowserExtensionStages,
  warmExtensionStagesForRoot,
  shouldCopyExtensionEntry,
  copyExtensionTreeBestEffort,
  hasCorruptedOrMismatchedRuntimeFiles,
  pruneNonRuntimeStageDirs,
  coreStageFilesHealthy,
  newestStageCoreMtime,
  newestIconMtime,
};
