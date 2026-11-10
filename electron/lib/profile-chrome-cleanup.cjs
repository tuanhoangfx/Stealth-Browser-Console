const fs = require("node:fs");
const path = require("node:path");
const { resolveProfilesRoot } = require("./profiles-location.cjs");
const {
  unpackedExtensionId,
  pinToolbarExtension,
  pinStoreExtension,
  healSecurePreferencesExtensionState,
} = require("./profile-chrome-preferences.cjs");
const { COOKIE_BRIDGE_STORE_ID, SURFSHARK_STORE_ID } = require("./stealth-extension-store-ids.cjs");

/** Legacy E0001 ids pinned when loading from workspace or Web Store path. */
const COOKIE_BRIDGE_LEGACY_PIN_IDS = new Set([
  "ofghkhkfciknohnfldabedhpljabimig",
  COOKIE_BRIDGE_STORE_ID,
]);

/** Surfshark VPN — removed from bundled extensions (perf / auto-tab). */

const IDENTITY_TOOLBAR_ROOT = "identity-toolbar";
const PIN_KEYS = ["pinned_extensions", "toolbar_pinned_extension_ids"];
const IDENTITY_DESC_RE = /profile identity/i;
const IDENTITY_NAME_RE = /^\[\d{3,5}\]/;
/** Profiles already scrubbed this process — skip prefs IO on repeat launches. */
const identityToolbarPurgedDirs = new Set();

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), "utf8");
}

function isIdentityToolbarPath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").toLowerCase();
  return (
    normalized.includes(`/${IDENTITY_TOOLBAR_ROOT}/`) ||
    normalized.includes(`\\${IDENTITY_TOOLBAR_ROOT}\\`) ||
    normalized.includes("/identity-ext/") ||
    normalized.includes("\\identity-ext\\") ||
    normalized.includes("/stealth-profile-chrome") ||
    normalized.includes("\\stealth-profile-chrome")
  );
}

function isCloakbrowserBundlePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/.cloakbrowser/") || normalized.includes("\\.cloakbrowser\\");
}

/** Chrome prefs entry pointing at a missing manifest (including stale CloakBrowser stage dirs). */
function isBrokenExtensionPath(extensionPath) {
  const raw = String(extensionPath || "").trim();
  if (!raw) return true;
  try {
    return !fs.existsSync(path.join(raw, "manifest.json"));
  } catch {
    return true;
  }
}

function collectBrokenExtensionIds(prefs) {
  const settings = prefs?.extensions?.settings;
  if (!settings || typeof settings !== "object") return [];
  const ids = [];
  for (const [extId, meta] of Object.entries(settings)) {
    if (isBrokenExtensionPath(meta?.path)) ids.push(extId);
  }
  return ids;
}

function readManifestMeta(extensionPath) {
  if (!extensionPath) return null;
  try {
    const manifestPath = path.join(String(extensionPath), "manifest.json");
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

function isIdentityExtensionMeta(meta) {
  if (!meta || typeof meta !== "object") return false;
  if (isIdentityToolbarPath(meta.path)) return true;

  const name = String(meta.manifest?.name || "");
  const desc = String(meta.manifest?.description || "");
  if (IDENTITY_DESC_RE.test(desc) || IDENTITY_NAME_RE.test(name)) return true;

  const disk = readManifestMeta(meta.path);
  if (!disk) return false;
  if (IDENTITY_DESC_RE.test(String(disk.description || ""))) return true;
  if (IDENTITY_NAME_RE.test(String(disk.name || ""))) return true;
  return false;
}

function collectIdentityExtensionIds(prefs) {
  const settings = prefs?.extensions?.settings;
  if (!settings || typeof settings !== "object") return [];
  const ids = [];
  for (const [extId, meta] of Object.entries(settings)) {
    if (isIdentityExtensionMeta(meta)) ids.push(extId);
  }
  return ids;
}

function isSurfsharkExtensionMeta(meta) {
  if (!meta || typeof meta !== "object") return false;
  const proxyServer = String(
    meta?.preferences?.proxy?.server ||
      meta?.regular_only_preferences?.proxy?.server ||
      "",
  ).toLowerCase();
  if (proxyServer.includes("surfshark")) return true;
  const extensionPath = String(meta.path || "").replace(/\\/g, "/").toLowerCase();
  if (extensionPath.includes(SURFSHARK_STORE_ID) || extensionPath.includes("/surfshark")) return true;
  const name = String(meta.manifest?.name || "").toLowerCase();
  if (name.includes("surfshark")) return true;
  const disk = readManifestMeta(meta.path);
  if (!disk) return false;
  const diskText = `${disk.name || ""} ${disk.description || ""}`.toLowerCase();
  return diskText.includes("surfshark");
}

function collectSurfsharkExtensionIds(prefs) {
  const settings = prefs?.extensions?.settings;
  if (!settings || typeof settings !== "object") return [];
  const ids = [];
  for (const [extId, meta] of Object.entries(settings)) {
    if (extId === SURFSHARK_STORE_ID || isSurfsharkExtensionMeta(meta)) ids.push(extId);
  }
  return ids;
}

function purgeSurfsharkExtensionStore(userDataDir) {
  const extRoot = path.join(userDataDir, "Default", "Extensions");
  if (!fs.existsSync(extRoot)) return 0;
  let removed = 0;
  for (const extId of fs.readdirSync(extRoot)) {
    if (extId === SURFSHARK_STORE_ID) {
      try {
        fs.rmSync(path.join(extRoot, extId), { recursive: true, force: true });
        removed += 1;
      } catch {
        // best-effort
      }
      continue;
    }
    const extDir = path.join(extRoot, extId);
    try {
      const versions = fs.readdirSync(extDir);
      for (const ver of versions) {
        const manifestPath = path.join(extDir, ver, "manifest.json");
        if (!fs.existsSync(manifestPath)) continue;
        const raw = fs.readFileSync(manifestPath, "utf8");
        if (/surfshark/i.test(raw)) {
          fs.rmSync(extDir, { recursive: true, force: true });
          removed += 1;
          break;
        }
      }
    } catch {
      // best-effort
    }
  }
  return removed;
}

/** Strip Surfshark pins + on-disk store (prefs may resurrect cache while path exists). */
function purgeSurfsharkExtensionPrefs(userDataDir) {
  let removed = 0;
  for (const prefsFile of chromePrefsFiles(userDataDir)) {
    const prefs = readJson(prefsFile);
    if (!prefs) continue;
    const extIds = collectSurfsharkExtensionIds(prefs);
    if (!extIds.length) continue;
    let changed = false;
    for (const extId of extIds) {
      if (removeExtensionFromPrefs(prefs, extId)) changed = true;
      removeExtensionStore(userDataDir, extId);
      removed += 1;
    }
    if (changed) writeJson(prefsFile, prefs);
  }
  removed += purgeSurfsharkExtensionStore(userDataDir);
  return { removed };
}

function purgeSurfsharkExtensionCache(userDataRoot) {
  if (!userDataRoot) return false;
  const cacheDir = path.join(userDataRoot, "extensions-cache", SURFSHARK_STORE_ID);
  try {
    if (!fs.existsSync(cacheDir)) return false;
    fs.rmSync(cacheDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

const SURFSHARK_PURGE_MARKER = "surfshark_extension_purge_v1";

function surfsharkPurgeMarkerPath(userDataRoot) {
  return path.join(userDataRoot, "settings", SURFSHARK_PURGE_MARKER);
}

function isSurfsharkPurgeComplete(userDataRoot) {
  return Boolean(userDataRoot) && fs.existsSync(surfsharkPurgeMarkerPath(userDataRoot));
}

function markSurfsharkPurgeComplete(userDataRoot) {
  if (!userDataRoot) return;
  const marker = surfsharkPurgeMarkerPath(userDataRoot);
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, "1", "utf8");
}

function purgeAllProfilesSurfshark(userDataRoot) {
  if (!userDataRoot) return { profiles: 0, removed: 0, prefsCleaned: 0, cacheRemoved: false, skipped: false };
  const cacheRemoved = purgeSurfsharkExtensionCache(userDataRoot);
  if (!cacheRemoved && isSurfsharkPurgeComplete(userDataRoot)) {
    return { profiles: 0, removed: 0, prefsCleaned: 0, cacheRemoved: false, skipped: true };
  }
  const profilesDir = resolveProfilesRoot(userDataRoot);
  let profiles = 0;
  let removed = 0;
  let prefsCleaned = 0;
  if (!fs.existsSync(profilesDir)) return { profiles, removed, prefsCleaned, cacheRemoved };

  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    profiles += 1;
    const result = purgeSurfsharkExtensionPrefs(path.join(profilesDir, entry.name));
    if (result.removed > 0) {
      removed += result.removed;
      prefsCleaned += 1;
    }
  }
  if (!cacheRemoved) markSurfsharkPurgeComplete(userDataRoot);
  return { profiles, removed, prefsCleaned, cacheRemoved, skipped: false };
}

function removeExtensionFromPrefs(prefs, extId) {
  if (!prefs?.extensions || !extId) return false;
  let changed = false;

  for (const key of PIN_KEYS) {
    const list = prefs.extensions[key];
    if (!Array.isArray(list) || !list.includes(extId)) continue;
    prefs.extensions[key] = list.filter((id) => id !== extId);
    changed = true;
  }

  const toolbarPinned = prefs.extensions.toolbar?.pinned_extension_ids;
  if (Array.isArray(toolbarPinned) && toolbarPinned.includes(extId)) {
    prefs.extensions.toolbar.pinned_extension_ids = toolbarPinned.filter((id) => id !== extId);
    changed = true;
  }

  if (prefs.extensions.settings?.[extId]) {
    delete prefs.extensions.settings[extId];
    if (prefs.protection?.macs?.extensions?.settings?.[extId]) {
      delete prefs.protection.macs.extensions.settings[extId];
    }
    changed = true;
  }

  return changed;
}

const STORE_EXTENSION_ID_RE = /^[a-p]{32}$/;

function chromePrefsFiles(userDataDir) {
  const base = path.join(userDataDir, "Default");
  const files = [path.join(base, "Preferences")];
  const secure = path.join(base, "Secure Preferences");
  if (fs.existsSync(secure)) files.push(secure);
  return files;
}

function normalizeExtensionPath(value) {
  return path.resolve(String(value || "")).replace(/\\/g, "/").toLowerCase();
}

function isCanonicalStoreExtensionEntry(extId, meta) {
  if (!STORE_EXTENSION_ID_RE.test(extId)) return false;
  const normalized = normalizeExtensionPath(meta?.path);
  const storeId = String(extId).toLowerCase();
  if (normalized.includes(`/extensions-cache/${storeId}/unpacked`)) return true;
  return normalized.includes("/.cloakbrowser/") && (normalized.endsWith(`/${storeId}`) || normalized.endsWith(`/${storeId}/`));
}

/** Drop unpacked-id shadow copies when the same path is already pinned by Web Store id. */
function purgeDuplicateUnpackedStoreExtensions(userDataDir) {
  let removed = 0;
  for (const prefsFile of chromePrefsFiles(userDataDir)) {
    const prefs = readJson(prefsFile);
    if (!prefs?.extensions?.settings) continue;
    const settings = prefs.extensions.settings;
    const storePaths = new Set();
    for (const [extId, meta] of Object.entries(settings)) {
      if (!isCanonicalStoreExtensionEntry(extId, meta)) continue;
      const normalized = normalizeExtensionPath(meta?.path);
      if (normalized) storePaths.add(normalized);
    }
    const toRemove = [];
    for (const [extId, meta] of Object.entries(settings)) {
      if (isCanonicalStoreExtensionEntry(extId, meta)) continue;
      const normalized = normalizeExtensionPath(meta?.path);
      if (normalized && storePaths.has(normalized)) toRemove.push(extId);
    }
    if (!toRemove.length) continue;
    let changed = false;
    for (const extId of toRemove) {
      if (removeExtensionFromPrefs(prefs, extId)) {
        removeExtensionStore(userDataDir, extId);
        changed = true;
        removed += 1;
      }
    }
    if (changed) writeJson(prefsFile, prefs);
  }
  return { removed };
}

function purgeAllProfilesDuplicateUnpackedStoreExtensions(userDataRoot) {
  if (!userDataRoot) return { profiles: 0, removed: 0 };
  const profilesDir = resolveProfilesRoot(userDataRoot);
  let profiles = 0;
  let removed = 0;
  if (!fs.existsSync(profilesDir)) return { profiles, removed };
  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    profiles += 1;
    const result = purgeDuplicateUnpackedStoreExtensions(path.join(profilesDir, entry.name));
    removed += result.removed;
  }
  return { profiles, removed };
}

function removeExtensionStore(userDataDir, extId) {
  if (!extId) return;
  const store = path.join(userDataDir, "Default", "Extensions", extId);
  try {
    if (fs.existsSync(store)) fs.rmSync(store, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/** Strip persisted MV3 identity-toolbar extension from a Chrome profile dir. */
function purgeProfileIdentityToolbar(userDataDir, userDataRoot, profileId) {
  const cacheKey = path.resolve(String(userDataDir));
  if (identityToolbarPurgedDirs.has(cacheKey)) return { removed: 0, cached: true };

  let removed = 0;

  if (userDataRoot && profileId) {
    const bundleDir = path.join(userDataRoot, IDENTITY_TOOLBAR_ROOT, String(profileId));
    try {
      if (fs.existsSync(bundleDir)) {
        fs.rmSync(bundleDir, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // best-effort
    }
  }

  if (userDataRoot && profileId) {
    const extId = unpackedExtensionId(path.join(userDataRoot, IDENTITY_TOOLBAR_ROOT, String(profileId)));
    removeExtensionStore(userDataDir, extId);
  }

  for (const prefsFile of chromePrefsFiles(userDataDir)) {
    const prefs = readJson(prefsFile);
    if (!prefs) continue;
    const extIds = collectIdentityExtensionIds(prefs);
    let changed = false;
    for (const extId of extIds) {
      if (removeExtensionFromPrefs(prefs, extId)) changed = true;
      removeExtensionStore(userDataDir, extId);
    }
    if (changed) {
      writeJson(prefsFile, prefs);
      removed += extIds.length;
    }
  }

  identityToolbarPurgedDirs.add(cacheKey);
  return { removed };
}

function isCookieBridgeSourcePath(extensionPath) {
  const normalized = String(extensionPath || "").replace(/\\/g, "/").toLowerCase();
  return (
    normalized.includes("/e0001-cookie-bridge") ||
    normalized.includes("/extensions-cache/kaaadageakdandpobcofplmfbjfjabdk/")
  );
}

/** Drop stale E0001 pins (workspace id, store id, cloakbrowser staging) before relaunch. */
function purgeStaleCookieBridgePrefs(userDataDir, bridgeDir) {
  if (!userDataDir) return { removed: 0 };
  const keepIds = new Set([COOKIE_BRIDGE_STORE_ID]);
  if (bridgeDir) keepIds.add(unpackedExtensionId(bridgeDir));
  let removed = 0;

  for (const prefsFile of chromePrefsFiles(userDataDir)) {
    const prefs = readJson(prefsFile);
    if (!prefs?.extensions) continue;
    const toRemove = new Set(collectBrokenExtensionIds(prefs));

    for (const key of PIN_KEYS) {
      const list = prefs.extensions[key];
      if (!Array.isArray(list)) continue;
      for (const extId of list) {
        if (keepIds.has(extId)) continue;
        if (COOKIE_BRIDGE_LEGACY_PIN_IDS.has(extId)) toRemove.add(extId);
      }
    }

    const toolbarPinned = prefs.extensions.toolbar?.pinned_extension_ids;
    if (Array.isArray(toolbarPinned)) {
      for (const extId of toolbarPinned) {
        if (keepIds.has(extId)) continue;
        if (COOKIE_BRIDGE_LEGACY_PIN_IDS.has(extId)) toRemove.add(extId);
      }
    }

    const settings = prefs.extensions.settings;
    if (settings && typeof settings === "object") {
      for (const [extId, meta] of Object.entries(settings)) {
        if (keepIds.has(extId)) continue;
        if (isCanonicalStoreExtensionEntry(extId, meta)) continue;
        const extPath = String(meta?.path || "");
        if (isCookieBridgeSourcePath(extPath)) {
          toRemove.add(extId);
          continue;
        }
        if (isCloakbrowserBundlePath(extPath)) {
          toRemove.add(extId);
        }
      }
    }

    if (!toRemove.size) continue;
    let changed = false;
    for (const extId of toRemove) {
      if (removeExtensionFromPrefs(prefs, extId)) changed = true;
      removeExtensionStore(userDataDir, extId);
      removed += 1;
    }
    if (changed) writeJson(prefsFile, prefs);
  }

  return { removed };
}

/** Remove stale/broken extension pins (e.g. old `.cloakbrowser/.../extId` paths). */
function purgeBrokenExtensionPrefs(userDataDir) {
  let removed = 0;
  for (const prefsFile of chromePrefsFiles(userDataDir)) {
    const prefs = readJson(prefsFile);
    if (!prefs) continue;
    const extIds = collectBrokenExtensionIds(prefs);
    if (!extIds.length) continue;
    let changed = false;
    for (const extId of extIds) {
      if (removeExtensionFromPrefs(prefs, extId)) changed = true;
      removeExtensionStore(userDataDir, extId);
      removed += 1;
    }
    if (changed) writeJson(prefsFile, prefs);
  }
  return { removed };
}

function chromeProfileIsLive(userDataDir) {
  return (
    fs.existsSync(path.join(userDataDir, "lockfile")) ||
    fs.existsSync(path.join(userDataDir, "SingletonLock"))
  );
}

function effectiveExtensionFlag(override, key, fallback) {
  if (override && override[key] !== undefined && override[key] !== null) return Boolean(override[key]);
  return fallback;
}

function operatorToolbarPinIsCurrent(userDataDir, operatorDir, operatorId) {
  const prefs = readJson(path.join(userDataDir, "Default", "Preferences"));
  if (!prefs || !operatorId) return false;
  const absPath = path.resolve(operatorDir).replace(/\\/g, "/");
  const settings = prefs.extensions?.settings?.[operatorId];
  const pinned = prefs.extensions?.pinned_extensions;
  return (
    Array.isArray(pinned) &&
    pinned.includes(operatorId) &&
    settings?.path === absPath &&
    Number(settings?.state) === 1 &&
    !isBrokenExtensionPath(settings?.path)
  );
}

/** True when the store id is already pinned and its folder still has a manifest. Path may be an older chromium dir. */
function cookieBridgePinIsCurrent(userDataDir, bridgeId) {
  const prefs = readJson(path.join(userDataDir, "Default", "Preferences"));
  const settings = prefs?.extensions?.settings?.[bridgeId];
  const pinned = prefs?.extensions?.pinned_extensions;
  return (
    Boolean(settings) &&
    Array.isArray(pinned) &&
    pinned.includes(bridgeId) &&
    Number(settings.state) === 1 &&
    !isBrokenExtensionPath(settings.path)
  );
}

/**
 * Closed profiles only. One walk for E0001 and E0002: drop prefs whose path has
 * no manifest, pin a missing toolbar entry when that profile's toggle is on,
 * unpin when it is off. Live Chrome dirs are skipped.
 */
function reconcileClosedProfileExtensionPrefs(userDataRoot, options = {}) {
  const empty = { profiles: 0, removed: 0, prefsCleaned: 0, skippedLive: 0, pinned: 0, pinnedBridge: 0 };
  if (!userDataRoot) return empty;
  const profilesDir = resolveProfilesRoot(userDataRoot);
  let profiles = 0;
  let removed = 0;
  let prefsCleaned = 0;
  let skippedLive = 0;
  let pinned = 0;
  let pinnedBridge = 0;
  if (!fs.existsSync(profilesDir)) return { profiles, removed, prefsCleaned, skippedLive, pinned, pinnedBridge };

  const operatorDir = options.operatorDir ? path.resolve(String(options.operatorDir)) : "";
  const operatorId = operatorDir ? unpackedExtensionId(operatorDir) : "";
  const legacyOperatorIds = new Set(
    (Array.isArray(options.legacyOperatorDirs) ? options.legacyOperatorDirs : [])
      .filter(Boolean)
      .map((d) => unpackedExtensionId(path.resolve(String(d))))
      .filter((id) => id && id !== operatorId),
  );
  const operatorReady = Boolean(operatorDir) && fs.existsSync(path.join(operatorDir, "manifest.json"));
  const operatorEnabled = options.operatorEnabled !== false;
  const bridgeId = String(options.bridgeId || "").trim().toLowerCase();
  const bridgeDir = options.bridgeDir ? path.resolve(String(options.bridgeDir)) : "";
  const bridgeReady = Boolean(bridgeId) && Boolean(bridgeDir) && fs.existsSync(path.join(bridgeDir, "manifest.json"));
  const bridgeVerified =
    bridgeReady && fs.existsSync(path.join(bridgeDir, "_metadata", "verified_contents.json"));
  const bridgeUnpackedId = bridgeReady ? unpackedExtensionId(bridgeDir) : "";
  const bridgeEnabled = options.bridgeEnabled !== false && Boolean(bridgeId);
  const overridesById = options.overridesById instanceof Map ? options.overridesById : null;

  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    profiles += 1;
    const userDataDir = path.join(profilesDir, entry.name);
    if (chromeProfileIsLive(userDataDir)) {
      skippedLive += 1;
      continue;
    }
    const override = overridesById?.get(entry.name);
    const operatorOn = effectiveExtensionFlag(override, "e0002", operatorEnabled);
    const bridgeOn = effectiveExtensionFlag(override, "e0001", bridgeEnabled);
    let changedCount = 0;
    for (const prefsFile of chromePrefsFiles(userDataDir)) {
      const prefs = readJson(prefsFile);
      if (!prefs) continue;
      const toRemove = new Set(collectBrokenExtensionIds(prefs));
      for (const legacyOpId of legacyOperatorIds) {
        if (
          prefs.extensions?.settings?.[legacyOpId] ||
          prefs.extensions?.pinned_extensions?.includes?.(legacyOpId) ||
          prefs.extensions?.toolbar?.pinned_extension_ids?.includes?.(legacyOpId)
        ) {
          toRemove.add(legacyOpId);
        }
      }
      if (operatorId && !operatorOn) toRemove.add(operatorId);
      if (bridgeId && !bridgeOn) {
        toRemove.add(bridgeId);
        if (bridgeUnpackedId) toRemove.add(bridgeUnpackedId);
        for (const legacyId of COOKIE_BRIDGE_LEGACY_PIN_IDS) toRemove.add(legacyId);
      } else if (bridgeId && bridgeOn && bridgeReady && !bridgeVerified) {
        if (prefs.extensions?.settings?.[bridgeId]) toRemove.add(bridgeId);
      }
      if (!toRemove.size) continue;
      let changed = false;
      for (const extId of toRemove) {
        if (removeExtensionFromPrefs(prefs, extId)) changed = true;
        removeExtensionStore(userDataDir, extId);
        changedCount += 1;
      }
      if (changed) writeJson(prefsFile, prefs);
    }
    removed += changedCount;
    if (changedCount > 0) prefsCleaned += 1;
    const prefsFile = path.join(userDataDir, "Default", "Preferences");
    if (!fs.existsSync(prefsFile)) continue;
    if (operatorOn && operatorReady) {
      healSecurePreferencesExtensionState(userDataDir, operatorId, operatorDir.replace(/\\/g, "/"));
      if (!operatorToolbarPinIsCurrent(userDataDir, operatorDir, operatorId)) {
        pinToolbarExtension(userDataDir, operatorDir);
        pinned += 1;
      }
    }
    if (bridgeOn && bridgeReady) {
      const targetBridgePinId = bridgeVerified ? bridgeId : bridgeUnpackedId;
      healSecurePreferencesExtensionState(userDataDir, targetBridgePinId, bridgeDir.replace(/\\/g, "/"));
      if (bridgeVerified && !cookieBridgePinIsCurrent(userDataDir, bridgeId)) {
        pinStoreExtension(userDataDir, bridgeId, bridgeDir);
        pinned += 1;
        pinnedBridge += 1;
      } else if (!bridgeVerified && !operatorToolbarPinIsCurrent(userDataDir, bridgeDir, bridgeUnpackedId)) {
        pinToolbarExtension(userDataDir, bridgeDir);
        pinned += 1;
        pinnedBridge += 1;
      }
    }
  }

  return { profiles, removed, prefsCleaned, skippedLive, pinned, pinnedBridge };
}

/** Bulk scrub broken extension prefs across every profile Chrome dir. */
function purgeAllProfilesBrokenExtensionPrefs(userDataRoot) {
  if (!userDataRoot) return { profiles: 0, removed: 0, prefsCleaned: 0 };
  const profilesDir = resolveProfilesRoot(userDataRoot);
  let profiles = 0;
  let removed = 0;
  let prefsCleaned = 0;

  if (!fs.existsSync(profilesDir)) return { profiles, removed, prefsCleaned };

  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    profiles += 1;
    const result = purgeBrokenExtensionPrefs(path.join(profilesDir, entry.name));
    removed += result.removed;
    if (result.removed > 0) prefsCleaned += 1;
  }

  return { profiles, removed, prefsCleaned };
}

/** Bulk scrub stale E0001 pins across every profile Chrome dir. */
function purgeAllProfilesStaleCookieBridgePrefs(userDataRoot, bridgeDir) {
  if (!userDataRoot || !bridgeDir) return { profiles: 0, removed: 0, prefsCleaned: 0 };
  const profilesDir = resolveProfilesRoot(userDataRoot);
  let profiles = 0;
  let removed = 0;
  let prefsCleaned = 0;

  if (!fs.existsSync(profilesDir)) return { profiles, removed, prefsCleaned };

  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    profiles += 1;
    const result = purgeStaleCookieBridgePrefs(path.join(profilesDir, entry.name), bridgeDir);
    removed += result.removed;
    if (result.removed > 0) prefsCleaned += 1;
  }

  return { profiles, removed, prefsCleaned };
}

/** Strip every extension from Chrome prefs + on-disk store (identity + cookie bridge pins). */
function purgeAllChromeExtensions(userDataDir) {
  let removed = 0;
  const extRoot = path.join(userDataDir, "Default", "Extensions");
  try {
    if (fs.existsSync(extRoot)) {
      fs.rmSync(extRoot, { recursive: true, force: true });
      removed += 1;
    }
  } catch {
    // best-effort
  }

  for (const prefsFile of chromePrefsFiles(userDataDir)) {
    const prefs = readJson(prefsFile);
    if (!prefs?.extensions) continue;
    const settings = prefs.extensions.settings || {};
    const count = Object.keys(settings).length;
    const hadPins =
      (Array.isArray(prefs.extensions.pinned_extensions) && prefs.extensions.pinned_extensions.length > 0) ||
      (Array.isArray(prefs.extensions.toolbar?.pinned_extension_ids) &&
        prefs.extensions.toolbar.pinned_extension_ids.length > 0);
    if (count === 0 && !hadPins) continue;
    prefs.extensions.settings = {};
    for (const key of PIN_KEYS) prefs.extensions[key] = [];
    if (prefs.extensions.toolbar) prefs.extensions.toolbar.pinned_extension_ids = [];
    writeJson(prefsFile, prefs);
    removed += Math.max(count, hadPins ? 1 : 0);
  }

  return { removed };
}

/** Delete all identity-toolbar bundles under the tool data root (fast one-shot cleanup). */
function purgeIdentityToolbarRoot(userDataRoot) {
  if (!userDataRoot) return false;
  const root = path.join(userDataRoot, IDENTITY_TOOLBAR_ROOT);
  try {
    if (!fs.existsSync(root)) return false;
    fs.rmSync(root, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/** Bulk purge — scan every profile Chrome dir + drop identity-toolbar root. */
function purgeAllProfilesIdentityToolbar(userDataRoot) {
  if (!userDataRoot) return { profiles: 0, removed: 0, prefsCleaned: 0 };
  const profilesDir = resolveProfilesRoot(userDataRoot);
  let profiles = 0;
  let removed = 0;
  let prefsCleaned = 0;

  if (fs.existsSync(profilesDir)) {
    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      profiles += 1;
      const userDataDir = path.join(profilesDir, entry.name);
      const result = purgeProfileIdentityToolbar(userDataDir, userDataRoot, entry.name);
      removed += result.removed;
      if (result.removed > 0) prefsCleaned += 1;
    }
  }

  if (purgeIdentityToolbarRoot(userDataRoot)) removed += 1;

  return { profiles, removed, prefsCleaned };
}

/** Remove legacy V4 identity extension artifacts (in-page badge / tab groups). */
function purgeLegacyProfileIdentityChrome(userDataDir, userDataRoot, profileId) {
  const targets = [
    path.join(userDataDir, "stealth-profile-chrome"),
    path.join(userDataDir, ".stealth-identity-ext"),
  ];
  if (userDataRoot && profileId) {
    targets.push(path.join(userDataRoot, "identity-ext", String(profileId)));
  }
  for (const target of targets) {
    try {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}

/**
 * Disposable HTTP/ServiceWorker/GPU/Shader/Code/Crashpad/BrowserMetrics paths inside a closed Chromium profile.
 * NEVER touches Cookies, Local Storage, Session Storage, IndexedDB, Extensions, Login Data,
 * Web Data, Bookmarks, History, or Preferences.
 */
const DISPOSABLE_PROFILE_CACHE_REL_PATHS = [
  "GraphiteDawnCache",
  "GrShaderCache",
  "ShaderCache",
  "DawnCache",
  "BrowserMetrics",
  "BrowserMetrics-spare.pma",
  path.join("Crashpad", "reports"),
  path.join("Crashpad", "attachments"),
  path.join("Default", "Cache"),
  path.join("Default", "Service Worker", "CacheStorage"),
  path.join("Default", "Service Worker", "ScriptCache"),
  path.join("Default", "Shared Dictionary"),
  path.join("Default", "DawnGraphiteCache"),
  path.join("Default", "DawnWebGPUCache"),
  path.join("Default", "GPUCache"),
  path.join("Default", "Code Cache", "js"),
  path.join("Default", "Code Cache", "wasm"),
  path.join("Default", "Network", "Cookies.vault-hydrated.json"),
];

/**
 * Ephemeral Agent Pool (`9000`–`9999` / `9xxx`) Post-Close Storage Wipe:
 * User stores zero persistent data in `9000`–`9999`. Wipes Cookies, LocalStorage, SessionStorage,
 * and IndexedDB on close so the next sequential Agent task starts with a clean slate.
 */
const EPHEMERAL_AGENT_POOL_STORAGE_REL_PATHS = [
  path.join("Default", "Network", "Cookies"),
  path.join("Default", "Network", "Cookies-journal"),
  path.join("Default", "Network", "Cookies-wal"),
  path.join("Default", "Network", "Cookies-shm"),
  path.join("Default", "Network", "Cookies.last-good.bak"),
  path.join("Default", "Cookies"),
  path.join("Default", "Cookies-journal"),
  path.join("Default", "Local Storage", "leveldb"),
  path.join("Default", "Session Storage"),
  path.join("Default", "IndexedDB"),
];

function wipeEphemeralAgentPoolProfileStorage(userDataDir) {
  if (!userDataDir || typeof userDataDir !== "string") {
    return { ok: false, skipped: true, reason: "invalid-dir", removedCount: 0 };
  }
  try {
    if (!fs.existsSync(userDataDir) || chromeProfileIsLive(userDataDir)) {
      return { ok: false, skipped: true, reason: "profile-live", removedCount: 0 };
    }
  } catch {
    return { ok: false, skipped: true, reason: "stat-error", removedCount: 0 };
  }
  let removedCount = 0;
  for (const rel of EPHEMERAL_AGENT_POOL_STORAGE_REL_PATHS) {
    const targetPath = path.join(userDataDir, rel);
    try {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        removedCount += 1;
      }
    } catch {
      // ignore if file handle is still releasing
    }
  }
  return { ok: true, skipped: false, removedCount };
}

/**
 * Instant On-Close Cache Trim (`ok 1` & `ok 2`):
 * Purges disposable HTTP/ServiceWorker/GPU/Shader/Dawn/Code/Crashpad/BrowserMetrics caches for a single closed profile.
 * Skips immediately if the profile directory is still live/locked.
 */
function trimClosedProfileDisposableCache(userDataDir) {
  if (!userDataDir || typeof userDataDir !== "string") {
    return { ok: false, skipped: true, reason: "invalid-dir", removedCount: 0 };
  }
  try {
    if (!fs.existsSync(userDataDir) || chromeProfileIsLive(userDataDir)) {
      return { ok: false, skipped: true, reason: "profile-live", removedCount: 0 };
    }
  } catch {
    return { ok: false, skipped: true, reason: "stat-error", removedCount: 0 };
  }
  let removedCount = 0;
  for (const rel of DISPOSABLE_PROFILE_CACHE_REL_PATHS) {
    const targetPath = path.join(userDataDir, rel);
    try {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        removedCount += 1;
      }
    } catch {
      // ignore if file handle is still releasing
    }
  }
  return { ok: true, skipped: false, removedCount };
}

/**
 * Non-blocking Libuv Thread-Pool On-Close Cache Trim:
 * Uses `fs.promises.rm` instead of `fs.rmSync` so deleting thousands of HTTP/GPU/Shader cache files
 * never blocks Electron's Main GUI Thread or Win32 message queue when headless browsers close.
 */
async function trimClosedProfileDisposableCacheAsync(userDataDir) {
  if (!userDataDir || typeof userDataDir !== "string") {
    return { ok: false, skipped: true, reason: "invalid-dir", removedCount: 0 };
  }
  try {
    if (!fs.existsSync(userDataDir) || chromeProfileIsLive(userDataDir)) {
      return { ok: false, skipped: true, reason: "profile-live", removedCount: 0 };
    }
  } catch {
    return { ok: false, skipped: true, reason: "stat-error", removedCount: 0 };
  }
  let removedCount = 0;
  await Promise.all(
    DISPOSABLE_PROFILE_CACHE_REL_PATHS.map(async (rel) => {
      const targetPath = path.join(userDataDir, rel);
      try {
        await fs.promises.rm(targetPath, { recursive: true, force: true });
        removedCount += 1;
      } catch {
        // ignore if file handle is still releasing
      }
    }),
  );
  return { ok: true, skipped: false, removedCount };
}

/**
 * Bulk sweep disposable caches across all closed profiles under `userDataRoot` (or direct `profilesDir`).
 */
function trimAllClosedProfilesDisposableCache(userDataRoot) {
  if (!userDataRoot) return { profiles: 0, cleanedProfiles: 0, skippedLive: 0, removedCount: 0 };
  const profilesDir = resolveProfilesRoot(userDataRoot);
  if (!fs.existsSync(profilesDir)) {
    return { profiles: 0, cleanedProfiles: 0, skippedLive: 0, removedCount: 0 };
  }
  let profiles = 0;
  let cleanedProfiles = 0;
  let skippedLive = 0;
  let removedCount = 0;
  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    profiles += 1;
    const res = trimClosedProfileDisposableCache(path.join(profilesDir, entry.name));
    if (res.skipped) {
      skippedLive += 1;
    } else if (res.removedCount > 0) {
      cleanedProfiles += 1;
      removedCount += res.removedCount;
    }
  }
  return { profiles, cleanedProfiles, skippedLive, removedCount };
}

module.exports = {
  DISPOSABLE_PROFILE_CACHE_REL_PATHS,
  EPHEMERAL_AGENT_POOL_STORAGE_REL_PATHS,
  trimClosedProfileDisposableCache,
  trimClosedProfileDisposableCacheAsync,
  trimAllClosedProfilesDisposableCache,
  wipeEphemeralAgentPoolProfileStorage,
  purgeLegacyProfileIdentityChrome,
  purgeProfileIdentityToolbar,
  purgeBrokenExtensionPrefs,
  reconcileClosedProfileExtensionPrefs,
  chromeProfileIsLive,
  purgeStaleCookieBridgePrefs,
  purgeAllProfilesStaleCookieBridgePrefs,
  purgeAllProfilesBrokenExtensionPrefs,
  purgeAllChromeExtensions,
  purgeIdentityToolbarRoot,
  purgeAllProfilesIdentityToolbar,
  removeExtensionFromPrefs,
  collectIdentityExtensionIds,
  collectBrokenExtensionIds,
  isIdentityToolbarPath,
  isIdentityExtensionMeta,
  isBrokenExtensionPath,
  isCloakbrowserBundlePath,
  isCanonicalStoreExtensionEntry,
  purgeSurfsharkExtensionPrefs,
  purgeSurfsharkExtensionCache,
  purgeAllProfilesSurfshark,
  purgeDuplicateUnpackedStoreExtensions,
  purgeAllProfilesDuplicateUnpackedStoreExtensions,
};
