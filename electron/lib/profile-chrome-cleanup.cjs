const fs = require("node:fs");
const path = require("node:path");
const { unpackedExtensionId } = require("./profile-chrome-preferences.cjs");
const { COOKIE_BRIDGE_STORE_ID } = require("./cookie-bridge-store.cjs");

/** Legacy E0001 ids pinned when loading from workspace or Web Store path. */
const COOKIE_BRIDGE_LEGACY_PIN_IDS = new Set([
  "ofghkhkfciknohnfldabedhpljabimig",
  COOKIE_BRIDGE_STORE_ID,
]);

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

/** Chrome prefs entry pointing at a missing manifest or stale CloakBrowser bundle dir. */
function isBrokenExtensionPath(extensionPath) {
  const raw = String(extensionPath || "").trim();
  if (!raw) return true;
  if (isCloakbrowserBundlePath(raw)) return true;
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
    changed = true;
  }

  return changed;
}

function chromePrefsFiles(userDataDir) {
  const base = path.join(userDataDir, "Default");
  const files = [path.join(base, "Preferences")];
  const secure = path.join(base, "Secure Preferences");
  if (fs.existsSync(secure)) files.push(secure);
  return files;
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
  const keepId = bridgeDir ? unpackedExtensionId(bridgeDir) : null;
  let removed = 0;

  for (const prefsFile of chromePrefsFiles(userDataDir)) {
    const prefs = readJson(prefsFile);
    if (!prefs?.extensions) continue;
    const toRemove = new Set(collectBrokenExtensionIds(prefs));

    for (const key of PIN_KEYS) {
      const list = prefs.extensions[key];
      if (!Array.isArray(list)) continue;
      for (const extId of list) {
        if (keepId && extId === keepId) continue;
        if (COOKIE_BRIDGE_LEGACY_PIN_IDS.has(extId)) toRemove.add(extId);
      }
    }

    const toolbarPinned = prefs.extensions.toolbar?.pinned_extension_ids;
    if (Array.isArray(toolbarPinned)) {
      for (const extId of toolbarPinned) {
        if (keepId && extId === keepId) continue;
        if (COOKIE_BRIDGE_LEGACY_PIN_IDS.has(extId)) toRemove.add(extId);
      }
    }

    const settings = prefs.extensions.settings;
    if (settings && typeof settings === "object") {
      for (const [extId, meta] of Object.entries(settings)) {
        if (keepId && extId === keepId) continue;
        const extPath = String(meta?.path || "");
        if (isCloakbrowserBundlePath(extPath) || isCookieBridgeSourcePath(extPath)) {
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

/** Bulk scrub broken extension prefs across every profile Chrome dir. */
function purgeAllProfilesBrokenExtensionPrefs(userDataRoot) {
  if (!userDataRoot) return { profiles: 0, removed: 0, prefsCleaned: 0 };
  const profilesDir = path.join(userDataRoot, "profiles");
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
  const profilesDir = path.join(userDataRoot, "profiles");
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
  const profilesDir = path.join(userDataRoot, "profiles");
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

module.exports = {
  purgeLegacyProfileIdentityChrome,
  purgeProfileIdentityToolbar,
  purgeBrokenExtensionPrefs,
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
};
