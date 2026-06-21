const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PIN_KEYS = ["pinned_extensions", "toolbar_pinned_extension_ids"];

function mergePinnedList(list, extId) {
  const next = Array.isArray(list) ? list.filter((id) => id !== extId) : [];
  next.unshift(extId);
  return next;
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
    manifest: existing.manifest || { name: path.basename(absPath) },
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

module.exports = { pinToolbarExtension, pinStoreExtension, unpackedExtensionId };
