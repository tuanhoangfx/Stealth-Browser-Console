const { getDb } = require("../db/init.cjs");
const {
  DEFAULT_EXTENSION_TOGGLES,
  normalizeExtensionToggles,
  anyExtensionToggleEnabled,
} = require("./extension-toggles.cjs");

const IDENTITY_DEBUG_KEY = "identity_debug_v1";
const PROFILE_EXTENSIONS_ENABLED_KEY = "profile_extensions_enabled_v1";
const EXTENSION_TOGGLES_KEY = "extension_toggles_v1";
function readRaw(key) {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(String(key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  try {
    getDb()
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .run(String(key), String(value));
  } catch {
    // DB not ready (early boot / teardown)
  }
}

function envIdentityDebug() {
  const raw = String(process.env.STEALTH_IDENTITY_DEBUG || "").toLowerCase();
  return raw === "1" || raw === "true";
}

function isIdentityDebugEnabled() {
  if (envIdentityDebug()) return true;
  return readRaw(IDENTITY_DEBUG_KEY) === "1";
}

function getIdentityDebugEnabled() {
  return isIdentityDebugEnabled();
}

function setIdentityDebugEnabled(enabled) {
  writeRaw(IDENTITY_DEBUG_KEY, enabled ? "1" : "0");
  return getIdentityDebugEnabled();
}

/** Per-extension global toggles (all profiles). Default: E0001 on, Surfshark + Web Store off. */
function getExtensionToggles() {
  const raw = readRaw(EXTENSION_TOGGLES_KEY);
  if (raw) {
    try {
      return normalizeExtensionToggles(JSON.parse(raw));
    } catch {
      // fall through to migration
    }
  }
  const legacy = readRaw(PROFILE_EXTENSIONS_ENABLED_KEY);
  if (legacy === "0") {
    return { e0001: false, surfshark: false, webStore: false };
  }
  if (legacy === "1") {
    return { e0001: true, surfshark: true, webStore: true };
  }
  return { ...DEFAULT_EXTENSION_TOGGLES };
}

function setExtensionToggles(patch = {}) {
  const next = normalizeExtensionToggles({ ...getExtensionToggles(), ...patch });
  writeRaw(EXTENSION_TOGGLES_KEY, JSON.stringify(next));
  return next;
}

/** True when any extension category is enabled (launch without --disable-extensions). */
function getProfileExtensionsEnabled() {
  return anyExtensionToggleEnabled(getExtensionToggles());
}

function setProfileExtensionsEnabled(enabled) {
  if (enabled) {
    return setExtensionToggles({ e0001: true, surfshark: true, webStore: true });
  }
  return setExtensionToggles({ e0001: false, surfshark: false, webStore: false });
}
module.exports = {
  IDENTITY_DEBUG_KEY,
  PROFILE_EXTENSIONS_ENABLED_KEY,
  EXTENSION_TOGGLES_KEY,
  isIdentityDebugEnabled,
  getIdentityDebugEnabled,
  setIdentityDebugEnabled,
  getExtensionToggles,
  setExtensionToggles,
  getProfileExtensionsEnabled,
  setProfileExtensionsEnabled,
};