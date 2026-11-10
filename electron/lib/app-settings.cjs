const { getDb } = require("../db/init.cjs");
const {
  DEFAULT_EXTENSION_TOGGLES,
  normalizeExtensionToggles,
  anyExtensionToggleEnabled,
} = require("./extension-toggles.cjs");

const IDENTITY_DEBUG_KEY = "identity_debug_v1";
const PROFILE_EXTENSIONS_ENABLED_KEY = "profile_extensions_enabled_v1";
const EXTENSION_TOGGLES_KEY = "extension_toggles_v1";
const COOKIE_BRIDGE_SOURCE_KEY = "cookie_bridge_source_v1";
const TARGET_MONITOR_KEY = "target_monitor_v1";
const MAX_HEADLESS_SESSIONS_KEY = "max_headless_sessions_v1";
const MAX_HEADLESS_DEFAULT_40_MIGRATED_KEY = "max_headless_default_40_migrated_v1";

const VALID_TARGET_MONITORS = new Set(["auto-secondary", "primary", "secondary", "cursor"]);
const DEFAULT_TARGET_MONITOR = "auto-secondary";
const DEFAULT_MAX_HEADLESS_SESSIONS = 40;
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
    return { e0001: false, e0002: false, surfshark: false, webStore: false };
  }
  if (legacy === "1") {
    return { e0001: true, e0002: true, surfshark: true, webStore: true };
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
    return setExtensionToggles({ e0001: true, e0002: true, surfshark: true, webStore: true });
  }
  return setExtensionToggles({ e0001: false, e0002: false, surfshark: false, webStore: false });
}

function getCookieBridgeSourceMode() {
  const raw = String(readRaw(COOKIE_BRIDGE_SOURCE_KEY) || "").trim().toLowerCase();
  if (raw === "workspace" || raw === "store") return raw;
  try {
    const { isDatabaseReady } = require("../db/init.cjs");
    if (typeof isDatabaseReady === "function" && isDatabaseReady()) {
      const { workspaceExtensionDir } = require("./cookie-bridge-store.cjs");
      if (workspaceExtensionDir()) {
        writeRaw(COOKIE_BRIDGE_SOURCE_KEY, "workspace");
        return "workspace";
      }
    }
  } catch {
    // fall through
  }
  return "store";
}

function setCookieBridgeSourceMode(mode) {
  const next = String(mode || "").trim().toLowerCase() === "workspace" ? "workspace" : "store";
  writeRaw(COOKIE_BRIDGE_SOURCE_KEY, next);
  return next;
}

function getTargetMonitor() {
  const raw = String(readRaw(TARGET_MONITOR_KEY) || "").trim().toLowerCase();
  return VALID_TARGET_MONITORS.has(raw) ? raw : DEFAULT_TARGET_MONITOR;
}

function setTargetMonitor(mode) {
  const clean = String(mode || "").trim().toLowerCase();
  const next = VALID_TARGET_MONITORS.has(clean) ? clean : DEFAULT_TARGET_MONITOR;
  writeRaw(TARGET_MONITOR_KEY, next);
  return next;
}

function getMaxHeadlessSessions() {
  if (readRaw(MAX_HEADLESS_DEFAULT_40_MIGRATED_KEY) !== "1") {
    const existing = Number(readRaw(MAX_HEADLESS_SESSIONS_KEY));
    if (!Number.isFinite(existing) || existing === 25) {
      writeRaw(MAX_HEADLESS_SESSIONS_KEY, String(DEFAULT_MAX_HEADLESS_SESSIONS));
    }
    writeRaw(MAX_HEADLESS_DEFAULT_40_MIGRATED_KEY, "1");
  }
  const raw = Number(readRaw(MAX_HEADLESS_SESSIONS_KEY));
  if (Number.isFinite(raw) && raw >= 1 && raw <= 200) {
    return Math.round(raw);
  }
  return DEFAULT_MAX_HEADLESS_SESSIONS;
}

function setMaxHeadlessSessions(val) {
  const n = Number(val);
  const next = Number.isFinite(n) ? Math.max(1, Math.min(200, Math.round(n))) : DEFAULT_MAX_HEADLESS_SESSIONS;
  writeRaw(MAX_HEADLESS_SESSIONS_KEY, String(next));
  process.env.STEALTH_MAX_HEADLESS_SESSIONS = String(next);
  return next;
}

function resolveTargetDisplayWorkArea(overrideMode = "") {
  try {
    const { screen } = require("electron");
    if (!screen || typeof screen.getAllDisplays !== "function") {
      const fallbackWa = { x: 0, y: 0, width: 1920, height: 1050 };
      return {
        ...fallbackWa,
        workArea: fallbackWa,
        displayIndex: 1,
        monitorIndex: 1,
        totalMonitors: 1,
        mode: "primary",
      };
    }
    const all = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const mode = VALID_TARGET_MONITORS.has(String(overrideMode || "").trim().toLowerCase())
      ? String(overrideMode).trim().toLowerCase()
      : getTargetMonitor();
    if (all.length >= 2 && (mode === "auto-secondary" || mode === "secondary")) {
      const secondary = all.find((d) => d.id !== primary?.id) || all[1] || primary;
      const wa = secondary?.workArea || { x: 1920, y: 0, width: 1920, height: 1050 };
      return {
        ...wa,
        workArea: wa,
        displayId: secondary?.id,
        displayIndex: 2,
        monitorIndex: 2,
        totalMonitors: all.length,
        mode,
      };
    }
    if (mode === "cursor" && typeof screen.getCursorScreenPoint === "function") {
      const pt = screen.getCursorScreenPoint();
      const curDisp = screen.getDisplayNearestPoint(pt) || primary;
      const idx = Math.max(0, all.findIndex((d) => d.id === curDisp?.id)) + 1;
      const wa = curDisp?.workArea || primary?.workArea || { x: 0, y: 0, width: 1920, height: 1050 };
      return {
        ...wa,
        workArea: wa,
        displayId: curDisp?.id,
        displayIndex: idx,
        monitorIndex: idx,
        totalMonitors: all.length,
        mode,
      };
    }
    const wa = primary?.workArea || { x: 0, y: 0, width: 1920, height: 1050 };
    return {
      ...wa,
      workArea: wa,
      displayId: primary?.id,
      displayIndex: 1,
      monitorIndex: 1,
      totalMonitors: all.length,
      mode,
    };
  } catch {
    const fallbackWa = { x: 0, y: 0, width: 1920, height: 1050 };
    return {
      ...fallbackWa,
      workArea: fallbackWa,
      displayIndex: 1,
      monitorIndex: 1,
      totalMonitors: 1,
      mode: "primary",
    };
  }
}

module.exports = {
  IDENTITY_DEBUG_KEY,
  PROFILE_EXTENSIONS_ENABLED_KEY,
  EXTENSION_TOGGLES_KEY,
  COOKIE_BRIDGE_SOURCE_KEY,
  TARGET_MONITOR_KEY,
  MAX_HEADLESS_SESSIONS_KEY,
  DEFAULT_TARGET_MONITOR,
  DEFAULT_MAX_HEADLESS_SESSIONS,
  isIdentityDebugEnabled,
  getIdentityDebugEnabled,
  setIdentityDebugEnabled,
  getExtensionToggles,
  setExtensionToggles,
  getProfileExtensionsEnabled,
  setProfileExtensionsEnabled,
  getCookieBridgeSourceMode,
  setCookieBridgeSourceMode,
  getTargetMonitor,
  setTargetMonitor,
  getMaxHeadlessSessions,
  setMaxHeadlessSessions,
  resolveTargetDisplayWorkArea,
};