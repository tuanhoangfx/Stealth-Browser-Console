const { getDb } = require("../db/init.cjs");

const IDENTITY_DEBUG_KEY = "identity_debug_v1";

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

module.exports = {
  IDENTITY_DEBUG_KEY,
  isIdentityDebugEnabled,
  getIdentityDebugEnabled,
  setIdentityDebugEnabled,
};
