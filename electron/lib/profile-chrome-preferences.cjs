const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PIN_KEYS = ["pinned_extensions", "toolbar_pinned_extension_ids"];

function mergePinnedList(list, extId) {
  const next = Array.isArray(list) ? list.filter((id) => id !== extId) : [];
  next.unshift(extId);
  return next;
}

function normalizeExtensionPath(value) {
  return path.resolve(String(value || "")).replace(/\\/g, "/").toLowerCase();
}

function removePinFromPrefs(prefs, extId) {
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

/** Remove toolbar / settings pin so a deleted cache is not reloaded on next profile launch. */
function unpinExtensionFromProfile(userDataDir, { storeId, unpackedPath } = {}) {
  const prefsFile = path.join(userDataDir, "Default", "Preferences");
  if (!fs.existsSync(prefsFile)) return { changed: false, ids: [] };
  const prefs = readJson(prefsFile);
  const ids = new Set();
  const store = String(storeId || "").trim().toLowerCase();
  if (/^[a-p]{32}$/.test(store)) ids.add(store);
  if (unpackedPath) {
    ids.add(unpackedExtensionId(unpackedPath));
    const want = normalizeExtensionPath(unpackedPath);
    for (const [extId, meta] of Object.entries(prefs.extensions?.settings || {})) {
      if (normalizeExtensionPath(meta?.path) === want) ids.add(extId);
    }
  }
  let changed = false;
  for (const extId of ids) {
    if (removePinFromPrefs(prefs, extId)) changed = true;
  }
  if (changed) writeJson(prefsFile, prefs);
  return { changed, ids: [...ids] };
}

/** Chrome unpacked extension id from the absolute path Chromium hashes. */
function unpackedExtensionId(extensionDir) {
  const resolved = path.resolve(String(extensionDir || ""));
  const hash = crypto.createHash("sha256");
  if (process.platform === "win32") hash.update(Buffer.from(resolved, "utf16le"));
  else hash.update(resolved, "utf8");
  const digest = hash.digest();
  const alphabet = "abcdefghijklmnop";
  let id = "";
  for (let i = 0; i < 16; i += 1) {
    const byte = digest[i];
    id += alphabet[(byte >> 4) & 0x0f];
    id += alphabet[byte & 0x0f];
  }
  return id;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), "utf8");
}

function clearSecureExtensionMac(securePrefs, extId) {
  let cleared = false;
  if (securePrefs?.protection?.macs?.extensions?.settings?.[extId] !== undefined) {
    delete securePrefs.protection.macs.extensions.settings[extId];
    cleared = true;
  }
  return cleared;
}

/**
 * Self-heal MV3 Service Worker & toolbar pin state inside `Default/Secure Preferences`
 * when a profile previously recorded `serviceworkerevents: []` or `disable_reasons`
 * during a sandboxed junction block, corrupted stage, or interrupted launch.
 */
function healSecurePreferencesExtensionState(userDataDir, extId, absPath) {
  if (!userDataDir || !extId) return false;
  const secureFile = path.join(userDataDir, "Default", "Secure Preferences");
  if (!fs.existsSync(secureFile)) return false;
  const securePrefs = readJson(secureFile);
  if (!securePrefs || typeof securePrefs !== "object" || !securePrefs.extensions) return false;

  let changed = false;
  let entryChanged = false;
  for (const key of PIN_KEYS) {
    if (Array.isArray(securePrefs.extensions[key]) && !securePrefs.extensions[key].includes(extId)) {
      securePrefs.extensions[key] = mergePinnedList(securePrefs.extensions[key], extId);
      changed = true;
      if (securePrefs?.protection?.macs?.extensions?.[key] !== undefined) {
        delete securePrefs.protection.macs.extensions[key];
      }
    }
  }
  if (
    securePrefs.extensions.toolbar &&
    Array.isArray(securePrefs.extensions.toolbar.pinned_extension_ids) &&
    !securePrefs.extensions.toolbar.pinned_extension_ids.includes(extId)
  ) {
    securePrefs.extensions.toolbar.pinned_extension_ids = mergePinnedList(
      securePrefs.extensions.toolbar.pinned_extension_ids,
      extId,
    );
    changed = true;
    if (securePrefs?.protection?.macs?.extensions?.toolbar !== undefined) {
      delete securePrefs.protection.macs.extensions.toolbar;
    }
  }

  const sEntry = securePrefs.extensions.settings?.[extId];
  if (sEntry && typeof sEntry === "object") {
    const emptySwEvents =
      Array.isArray(sEntry.serviceworkerevents) && sEntry.serviceworkerevents.length === 0;
    const missingMv3SwReg =
      Number(sEntry.location) === 8 &&
      !sEntry.service_worker_registration_info &&
      (!Array.isArray(sEntry.serviceworkerevents) || sEntry.serviceworkerevents.length === 0);
    if (sEntry.disable_reasons !== undefined) {
      delete sEntry.disable_reasons;
      entryChanged = true;
    }
    if (Number(sEntry.state) !== 1) {
      sEntry.state = 1;
      entryChanged = true;
    }
    if (absPath && sEntry.path && normalizeExtensionPath(sEntry.path) !== normalizeExtensionPath(absPath)) {
      sEntry.path = absPath;
      entryChanged = true;
    }
    if (emptySwEvents || missingMv3SwReg) {
      delete sEntry.serviceworkerevents;
      delete sEntry.service_worker_registration_info;
      entryChanged = true;
    }
  }

  if (entryChanged) {
    clearSecureExtensionMac(securePrefs, extId);
    changed = true;
  }

  if (changed) {
    try {
      writeJson(secureFile, securePrefs);
    } catch {
      return false;
    }
  }
  return changed;
}

/**
 * Auto-pin toolbar extension before Chrome reads Preferences at launch.
 * chrome.management has no pin API — merge Chromium prefs (same as enterprise policy targets).
 */
function pinToolbarExtension(userDataDir, extensionDir) {
  const extId = unpackedExtensionId(extensionDir);
  const absPath = path.resolve(extensionDir).replace(/\\/g, "/");
  const prefsFile = path.join(userDataDir, "Default", "Preferences");
  const prefs = readJson(prefsFile);

  healSecurePreferencesExtensionState(userDataDir, extId, absPath);

  prefs.extensions = prefs.extensions || {};
  const alreadyPinned =
    Array.isArray(prefs.extensions.pinned_extensions) &&
    prefs.extensions.pinned_extensions.includes(extId) &&
    Array.isArray(prefs.extensions.toolbar?.pinned_extension_ids) &&
    prefs.extensions.toolbar.pinned_extension_ids.includes(extId);
  const existingSettings = prefs.extensions.settings?.[extId];
  if (
    alreadyPinned &&
    existingSettings?.path === absPath &&
    Number(existingSettings?.state) === 1 &&
    existingSettings?.disable_reasons === undefined &&
    !(Array.isArray(existingSettings?.serviceworkerevents) && existingSettings.serviceworkerevents.length === 0)
  ) {
    return extId;
  }

  for (const key of PIN_KEYS) {
    prefs.extensions[key] = mergePinnedList(prefs.extensions[key], extId);
  }

  prefs.extensions.toolbar = prefs.extensions.toolbar || {};
  prefs.extensions.toolbar.pinned_extension_ids = mergePinnedList(
    prefs.extensions.toolbar.pinned_extension_ids,
    extId,
  );

  prefs.extensions.settings = prefs.extensions.settings || {};
  const existing = { ...(prefs.extensions.settings[extId] || {}) };
  delete existing.disable_reasons;
  if (Array.isArray(existing.serviceworkerevents) && existing.serviceworkerevents.length === 0) {
    delete existing.serviceworkerevents;
    delete existing.service_worker_registration_info;
  }
  let manifest = existing.manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(absPath, "manifest.json"), "utf8"));
  } catch {
    manifest = manifest || { name: path.basename(absPath) };
  }

  prefs.extensions.settings[extId] = {
    ...existing,
    creation_flags: 9,
    from_webstore: false,
    incognito: true,
    location: 4,
    path: absPath,
    state: 1,
    was_installed_by_default: false,
    was_installed_by_oem: false,
    install_time: existing.install_time || String(Date.now() * 1000),
    manifest,
  };

  writeJson(prefsFile, prefs);
  return extId;
}

/** Pin Chrome Web Store extension (fixed extension id). */
function pinStoreExtension(userDataDir, extId, extensionDir) {
  const absPath = path.resolve(extensionDir).replace(/\\/g, "/");
  const prefsFile = path.join(userDataDir, "Default", "Preferences");
  const prefs = readJson(prefsFile);

  healSecurePreferencesExtensionState(userDataDir, extId, absPath);

  prefs.extensions = prefs.extensions || {};
  const existingSettings = prefs.extensions.settings?.[extId];
  if (
    Array.isArray(prefs.extensions.pinned_extensions) &&
    prefs.extensions.pinned_extensions.includes(extId) &&
    Array.isArray(prefs.extensions.toolbar?.pinned_extension_ids) &&
    prefs.extensions.toolbar.pinned_extension_ids.includes(extId) &&
    existingSettings?.path === absPath &&
    Number(existingSettings?.state) === 1 &&
    existingSettings?.disable_reasons === undefined &&
    !(Array.isArray(existingSettings?.serviceworkerevents) && existingSettings.serviceworkerevents.length === 0)
  ) {
    return extId;
  }

  for (const key of PIN_KEYS) {
    prefs.extensions[key] = mergePinnedList(prefs.extensions[key], extId);
  }

  prefs.extensions.toolbar = prefs.extensions.toolbar || {};
  prefs.extensions.toolbar.pinned_extension_ids = mergePinnedList(
    prefs.extensions.toolbar.pinned_extension_ids,
    extId,
  );

  prefs.extensions.settings = prefs.extensions.settings || {};
  const existing = { ...(prefs.extensions.settings[extId] || {}) };
  delete existing.disable_reasons;
  if (Array.isArray(existing.serviceworkerevents) && existing.serviceworkerevents.length === 0) {
    delete existing.serviceworkerevents;
    delete existing.service_worker_registration_info;
  }
  let manifest = existing.manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(absPath, "manifest.json"), "utf8"));
  } catch {
    manifest = manifest || { name: "E0001 Cookie Bridge" };
  }

  prefs.extensions.settings[extId] = {
    ...existing,
    creation_flags: 1,
    from_webstore: true,
    incognito: true,
    location: 4,
    path: absPath,
    state: 1,
    was_installed_by_default: false,
    was_installed_by_oem: false,
    install_time: existing.install_time || String(Date.now() * 1000),
    manifest,
  };

  writeJson(prefsFile, prefs);
  return extId;
}

module.exports = {
  pinToolbarExtension,
  pinStoreExtension,
  healSecurePreferencesExtensionState,
  unpinExtensionFromProfile,
  unpackedExtensionId,
};
