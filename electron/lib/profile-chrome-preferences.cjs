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

/** Chrome unpacked extension id from absolute path (stable per machine/path). */
function unpackedExtensionId(extensionDir) {
  const normalized = path.resolve(extensionDir).replace(/\\/g, "/").toLowerCase();
  const hash = crypto.createHash("sha256").update(normalized, "utf8").digest();
  const alphabet = "abcdefghijklmnop";
  let id = "";
  for (let i = 0; i < 16; i += 1) {
    const byte = hash[i];
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

/**
 * Auto-pin toolbar extension before Chrome reads Preferences at launch.
 * chrome.management has no pin API — merge Chromium prefs (same as enterprise policy targets).
 */
function pinToolbarExtension(userDataDir, extensionDir) {
  const extId = unpackedExtensionId(extensionDir);
  const absPath = path.resolve(extensionDir).replace(/\\/g, "/");
  const prefsFile = path.join(userDataDir, "Default", "Preferences");
  const prefs = readJson(prefsFile);

  prefs.extensions = prefs.extensions || {};
  const alreadyPinned =
    Array.isArray(prefs.extensions.pinned_extensions) && prefs.extensions.pinned_extensions[0] === extId;
  const existingSettings = prefs.extensions.settings?.[extId];
  if (
    alreadyPinned &&
    existingSettings?.path === absPath &&
    Number(existingSettings?.state) === 1
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
  const existing = prefs.extensions.settings[extId] || {};
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

  prefs.extensions = prefs.extensions || {};
  const existingSettings = prefs.extensions.settings?.[extId];
  if (
    Array.isArray(prefs.extensions.pinned_extensions) &&
    prefs.extensions.pinned_extensions[0] === extId &&
    existingSettings?.path === absPath &&
    Number(existingSettings?.state) === 1
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
  const existing = prefs.extensions.settings[extId] || {};
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
  unpinExtensionFromProfile,
  unpackedExtensionId,
};
