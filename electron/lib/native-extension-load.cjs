const fs = require("node:fs");
const path = require("node:path");
const {
  COOKIE_BRIDGE_STORE_ID,
  cookieBridgeEnabled,
  resolveCookieBridgeExtensionDirSync,
  isVerifiedStoreExtension,
} = require("./cookie-bridge-store.cjs");
const { pinStoreExtension, pinToolbarExtension } = require("./profile-chrome-preferences.cjs");
const {
  purgeDuplicateUnpackedStoreExtensions,
  isCanonicalStoreExtensionEntry,
  removeExtensionFromPrefs,
} = require("./profile-chrome-cleanup.cjs");
const { ensureCloakbrowserExtensionStages } = require("./cloakbrowser-extension-stage.cjs");
const { profileExtensionsEnabled } = require("./extension-launch-mode.cjs");
const {
  isStoreExtensionAllowed,
  isLocalExtensionAllowed,
  allExtensionTogglesEnabled,
} = require("./extension-toggles.cjs");
const { getExtensionToggles } = require("./app-settings.cjs");

const FAST_PREP = String(process.env.STEALTH_FAST_LAUNCH ?? "1").toLowerCase() !== "0";

// Load E0001 natively from prefs once Chromium has installed it (drop the
// redundant per-launch --load-extension). Set STEALTH_E0001_NATIVE_PREFS=0 to
// force the always-CLI-load behavior.
const NATIVE_PREFS_LOAD = String(process.env.STEALTH_E0001_NATIVE_PREFS ?? "1").toLowerCase() !== "0";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/**
 * True only when Chromium itself has already installed + loaded E0001 in this
 * profile: the settings entry is enabled, points at a still-present folder, and
 * carries a Chromium-parsed `manifest` object that our pin writer never sets
 * (Chromium adds it only after successfully loading the unpacked extension).
 * Once this holds, Chromium reloads the pinned unpacked extension (location 4)
 * from prefs on startup, so the per-launch `--load-extension` re-validation is
 * redundant and can be dropped for a faster open.
 */
function isCookieBridgeProvisionedInPrefs(userDataDir) {
  const entry = readJson(path.join(userDataDir, "Default", "Preferences"))?.extensions?.settings?.[
    COOKIE_BRIDGE_STORE_ID
  ];
  if (!entry || Number(entry.state) !== 1) return false;
  const manifest = entry.manifest;
  const chromiumLoaded = Boolean(manifest && typeof manifest === "object" && manifest.name);
  if (!chromiumLoaded) return false;
  const extPath = String(entry.path || "").trim();
  if (!extPath) return false;
  try {
    return fs.existsSync(path.join(path.resolve(extPath), "manifest.json"));
  } catch {
    return false;
  }
}

function isStoreCacheExtensionPath(extensionDir) {
  const normalized = path.resolve(String(extensionDir || "")).replace(/\\/g, "/");
  return /\/extensions-cache\/[a-p]{32}\/unpacked\/?$/i.test(normalized);
}

function isCloakbrowserStagePath(extensionDir) {
  const normalized = path.resolve(String(extensionDir || "")).replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/.cloakbrowser/") && /\/[a-p]{32}\/?$/i.test(normalized);
}

function resolveSourceDirFromMeta(meta) {
  const raw = String(meta?.path || "").trim();
  if (!raw) return null;
  const abs = path.resolve(raw);
  if (!fs.existsSync(path.join(abs, "manifest.json"))) return null;
  return abs;
}

/** Extensions this profile should load — from prefs (+ E0001 if enabled and missing). */
function readProfileExtensionSources(userDataDir, userDataRoot, effectiveToggles) {
  const toggles = effectiveToggles || getExtensionToggles();
  const prefsFile = path.join(userDataDir, "Default", "Preferences");
  const settings = readJson(prefsFile)?.extensions?.settings || {};
  const entries = [];
  const seenStore = new Set();

  for (const [extId, meta] of Object.entries(settings)) {
    const sourceDir = resolveSourceDirFromMeta(meta);
    if (!sourceDir) continue;
    if (isCanonicalStoreExtensionEntry(extId, meta)) {
      if (seenStore.has(extId)) continue;
      if (!isStoreExtensionAllowed(extId, toggles)) continue;
      seenStore.add(extId);
      entries.push({ kind: "store", storeId: extId, sourceDir });
      continue;
    }
    if (Number(meta?.location) === 4 && !isCloakbrowserStagePath(sourceDir)) {
      if (!isLocalExtensionAllowed(toggles)) continue;
      entries.push({ kind: "local", sourceDir });
    }
  }

  if (
    cookieBridgeEnabled() &&
    toggles.e0001 &&
    !seenStore.has(COOKIE_BRIDGE_STORE_ID) &&
    !profileHasCookieBridge(settings)
  ) {
    const bridge = resolveCookieBridgeExtensionDirSync(userDataRoot);
    if (bridge) {
      entries.unshift({ kind: "store", storeId: COOKIE_BRIDGE_STORE_ID, sourceDir: bridge });
    }
  }

  return entries;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), "utf8");
}

function pinStoreOrUnpackedExtension(userDataDir, storeId, pinPath, sourceDir) {
  const verified =
    isVerifiedStoreExtension(pinPath) || (sourceDir ? isVerifiedStoreExtension(sourceDir) : false);
  if (storeId === COOKIE_BRIDGE_STORE_ID && !verified) {
    return pinToolbarExtension(userDataDir, pinPath);
  }
  return pinStoreExtension(userDataDir, storeId, pinPath);
}

function profileHasCookieBridge(settings) {
  if (!settings || typeof settings !== "object") return false;
  if (settings[COOKIE_BRIDGE_STORE_ID]) return true;
  const storeNeedle = `/${COOKIE_BRIDGE_STORE_ID}`.toLowerCase();
  for (const meta of Object.values(settings)) {
    const name = String(meta?.manifest?.name || "");
    if (/e0001|cookie bridge/i.test(name)) return true;
    const extPath = String(meta?.path || "").replace(/\\/g, "/").toLowerCase();
    if (extPath.includes(storeNeedle)) return true;
  }
  return false;
}

function migrateUnpackedCookieBridgePins(userDataDir, userDataRoot) {
  const prefsFile = path.join(userDataDir, "Default", "Preferences");
  const prefs = readJson(prefsFile);
  const settings = prefs?.extensions?.settings;
  if (!settings || settings[COOKIE_BRIDGE_STORE_ID]) return false;

  const storeNeedle = `/${COOKIE_BRIDGE_STORE_ID}`.toLowerCase();
  let stagePath = null;
  const shadowIds = [];
  for (const [extId, meta] of Object.entries(settings)) {
    const extPath = String(meta?.path || "").replace(/\\/g, "/").toLowerCase();
    if (!extPath.includes(storeNeedle)) continue;
    stagePath = meta.path;
    if (extId !== COOKIE_BRIDGE_STORE_ID) shadowIds.push(extId);
  }
  if (!stagePath || !shadowIds.length) return false;

  for (const extId of shadowIds) {
    removeExtensionFromPrefs(prefs, extId);
  }
  writeJson(prefsFile, prefs);
  const bridgeSrc = resolveCookieBridgeExtensionDirSync(userDataRoot);
  pinStoreOrUnpackedExtension(userDataDir, COOKIE_BRIDGE_STORE_ID, stagePath, bridgeSrc || stagePath);
  return true;
}

function splitNativeExtensionDirs(extensionDirs) {
  const stageDirs = [];
  const loadDirs = [];
  for (const dir of extensionDirs || []) {
    if (isStoreCacheExtensionPath(dir) || isCloakbrowserStagePath(dir)) stageDirs.push(dir);
    else loadDirs.push(dir);
  }
  return { stageDirs, loadDirs };
}

/**
 * Stage store extensions once under `.cloakbrowser/<storeId>/` and pin prefs to that path only.
 * Prevents duplicate UI entries (AppData path + CloakBrowser stage path).
 */
function prepareProfileExtensions(userDataDir, userDataRoot, cloakCacheDir, options = {}) {
  const emptyPlan = {
    stageDirs: [],
    loadDirs: [],
    cliStoreLoads: [],
    prefStoreIds: [],
    allowedStoreIds: [],
    useAllowlist: false,
  };
  const { profileExtensionsEnabled } = require("./extension-launch-mode.cjs");
  if (!profileExtensionsEnabled()) return emptyPlan;

  const toggles = options.effectiveToggles || getExtensionToggles();

  if (!FAST_PREP) {
    purgeDuplicateUnpackedStoreExtensions(userDataDir);
  }

  // Snapshot BEFORE re-pinning: was E0001 already Chromium-installed in this
  // profile? If so we can load it natively from prefs and skip the redundant
  // per-launch --load-extension re-validation (faster opens, 1.0.11-like).
  const cookieBridgePrefsLoad =
    NATIVE_PREFS_LOAD && isCookieBridgeProvisionedInPrefs(userDataDir);

  migrateUnpackedCookieBridgePins(userDataDir, userDataRoot);

  const sources = readProfileExtensionSources(userDataDir, userDataRoot, toggles);
  if (!sources.length) return { ...emptyPlan };

  const cliStoreLoads = [];
  const prefStoreIds = [];

  const cacheSourceDirs = [
    ...new Set(
      sources
        .map((entry) => entry.sourceDir)
        .filter((dir) => isStoreCacheExtensionPath(dir) || !isCloakbrowserStagePath(dir)),
    ),
  ];

  const staged = ensureCloakbrowserExtensionStages(cacheSourceDirs, cloakCacheDir);
  const stageBySource = new Map(staged.map((row) => [path.resolve(row.sourceDir), row.stageDir]));

  const loadDirs = [];
  for (const entry of sources) {
    const src = path.resolve(entry.sourceDir);
    let pinPath = stageBySource.get(src) || src;

    if (entry.kind === "store") {
      if (!stageBySource.has(src) && isStoreCacheExtensionPath(src)) {
        const restaged = ensureCloakbrowserExtensionStages([src], cloakCacheDir);
        if (restaged[0]?.stageDir) pinPath = restaged[0].stageDir;
      }
      pinStoreOrUnpackedExtension(userDataDir, entry.storeId, pinPath, entry.sourceDir);
      prefStoreIds.push(entry.storeId);
      if (entry.storeId === COOKIE_BRIDGE_STORE_ID && cookieBridgeEnabled()) {
        // First open (not yet Chromium-installed) forces a --load-extension so
        // Chromium registers E0001. After that it loads from prefs and we skip
        // the CLI load to speed up every later open.
        if (!cookieBridgePrefsLoad) {
          cliStoreLoads.push({ storeId: entry.storeId, dir: pinPath });
        }
      }
      continue;
    }

    pinToolbarExtension(userDataDir, pinPath);
    if (!isStoreCacheExtensionPath(src)) loadDirs.push(src);
  }

  return {
    stageDirs: cacheSourceDirs,
    loadDirs,
    cliStoreLoads,
    prefStoreIds,
    allowedStoreIds: [...prefStoreIds],
    useAllowlist: !allExtensionTogglesEnabled(toggles),
  };
}

/** Rewrite extensions-cache prefs → `.cloakbrowser/<storeId>/` (fixes duplicate toolbar icons). */
function profileNeedsExtensionPathRepair(userDataDir) {
  const settings = readJson(path.join(userDataDir, "Default", "Preferences"))?.extensions?.settings || {};
  for (const [extId, meta] of Object.entries(settings)) {
    const sourceDir = resolveSourceDirFromMeta(meta);
    if (!sourceDir) continue;
    if (isCanonicalStoreExtensionEntry(extId, meta) && isStoreCacheExtensionPath(sourceDir)) return true;
  }
  return false;
}

function repairAllProfileExtensionPaths(userDataRoot, cloakCacheDir) {
  const profilesDir = path.join(userDataRoot, "profiles");
  let profiles = 0;
  let rewritten = 0;
  if (!fs.existsSync(profilesDir)) return { profiles, rewritten };
  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    profiles += 1;
    const userDataDir = path.join(profilesDir, entry.name);
    if (!profileNeedsExtensionPathRepair(userDataDir)) continue;
    try {
      prepareProfileExtensions(userDataDir, userDataRoot, cloakCacheDir);
      rewritten += 1;
    } catch {
      // best-effort per profile
    }
  }
  return { profiles, rewritten };
}

/** Pin E0001 on every profile that is missing it (startup warm). */
function ensureCookieBridgeOnAllProfiles(userDataRoot, cloakCacheDir) {
  const toggles = getExtensionToggles();
  if (!cookieBridgeEnabled() || !toggles.e0001 || !profileExtensionsEnabled()) {
    return { profiles: 0, pinned: 0 };
  }
  if (!resolveCookieBridgeExtensionDirSync(userDataRoot)) return { profiles: 0, pinned: 0 };

  const profilesDir = path.join(userDataRoot, "profiles");
  let profiles = 0;
  let pinned = 0;
  if (!fs.existsSync(profilesDir)) return { profiles, pinned };

  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    profiles += 1;
    const userDataDir = path.join(profilesDir, entry.name);
    const settings = readJson(path.join(userDataDir, "Default", "Preferences"))?.extensions?.settings || {};
    if (profileHasCookieBridge(settings)) continue;
    try {
      prepareProfileExtensions(userDataDir, userDataRoot, cloakCacheDir);
      pinned += 1;
    } catch {
      // best-effort per profile
    }
  }
  return { profiles, pinned };
}

/** @deprecated — use readProfileExtensionSources; kept for warm-cache boot. */
function resolveNativeExtensionDirs(userDataRoot) {
  const { listAllLaunchExtensions } = require("./webstore-extension.cjs");
  const dirs = [];
  const seen = new Set();
  for (const ext of listAllLaunchExtensions(userDataRoot)) {
    const abs = path.resolve(ext.unpackedPath);
    if (seen.has(abs)) continue;
    if (!fs.existsSync(path.join(abs, "manifest.json"))) continue;
    seen.add(abs);
    dirs.push(abs);
  }
  return dirs;
}

module.exports = {
  isStoreCacheExtensionPath,
  isCloakbrowserStagePath,
  readProfileExtensionSources,
  resolveNativeExtensionDirs,
  splitNativeExtensionDirs,
  prepareProfileExtensions,
  profileNeedsExtensionPathRepair,
  repairAllProfileExtensionPaths,
  ensureCookieBridgeOnAllProfiles,
  profileHasCookieBridge,
  isCookieBridgeProvisionedInPrefs,
  pinStoreOrUnpackedExtension,
};
