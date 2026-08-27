/**
 * Optional cap on concurrent headed Stealth Chromium.
 *
 * 19+ gpu-process can freeze the Windows mouse (NVIDIA TDR / DWM) on this
 * dual-Xeon desk — but a default of 8 silently closed burst-open profiles
 * (looked like “stuck then auto-close”). Default is **off**.
 *
 * Set STEALTH_MAX_RUNNING_PROFILES=16 (or any N>0) to re-enable eviction.
 * 0 / off / unset = do not auto-close.
 *
 * Protected names stay up unless still over the cap after evicting browse profiles.
 */
"use strict";

/** Legacy GPU-safe hint — not the default. Use resolveMaxRunningProfiles(). */
const MAX_RUNNING_STEALTH_PROFILES = 8;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number} 0 = unlimited (no silent close)
 */
function resolveMaxRunningProfiles(env = process.env) {
  const raw = String(env?.STEALTH_MAX_RUNNING_PROFILES ?? "").trim();
  if (!raw || /^(0|off|false|none|unlimited)$/i.test(raw)) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

const PROTECTED_NAMES = new Set([
  "0059",
  "0012",
  "0021",
  "0069",
  "1000",
  "9990",
  "9991",
  "9992",
  "9993",
  "9994",
  "9995",
  "9996",
  "9997",
  "9998",
  "9999",
]);

function nameKey(name) {
  return String(name || "").trim();
}

function isProtectedName(name, keepName) {
  const n = nameKey(name);
  if (keepName && n === nameKey(keepName)) return true;
  return PROTECTED_NAMES.has(n);
}

/**
 * @param {Array<{ id: string, name?: string }>} running
 * @param {{ max?: number, keepName?: string }} [opts]
 * @returns {Array<{ id: string, name?: string }>}
 */
function pickCloseTargets(running, { max = MAX_RUNNING_STEALTH_PROFILES, keepName } = {}) {
  const rows = Array.isArray(running) ? running.filter((r) => r && r.id) : [];
  if (rows.length <= max) return [];
  const overflow = rows.length - max;
  const evict = [];
  const keep = [];
  for (const row of rows) {
    if (isProtectedName(row.name, keepName)) keep.push(row);
    else evict.push(row);
  }
  const out = evict.slice(0, overflow);
  if (out.length < overflow) {
    const extra = keep.filter(
      (row) => nameKey(row.name) !== "0059" && nameKey(row.name) !== nameKey(keepName),
    );
    out.push(...extra.slice(0, overflow - out.length));
  }
  return out;
}

module.exports = {
  MAX_RUNNING_STEALTH_PROFILES,
  resolveMaxRunningProfiles,
  PROTECTED_NAMES,
  isProtectedName,
  pickCloseTargets,
};
