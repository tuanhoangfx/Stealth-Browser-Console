/**
 * Concurrent-profile policy — standing order 2026-08-27:
 * NEVER auto-close a profile, even if 100 are open.
 *
 * GPU freeze is accepted. Do not re-introduce eviction, env caps, or
 * scheduled --apply closers. User Close / API close only.
 */
"use strict";

/** Historical GPU-safe hint only — never used as a live cap. */
const MAX_RUNNING_STEALTH_PROFILES = 8;

/**
 * @param {NodeJS.ProcessEnv} [_env]
 * @returns {number} always 0 — unlimited; env is ignored
 */
function resolveMaxRunningProfiles(_env = process.env) {
  return 0;
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
 * Always empty — auto-evict is forbidden.
 * @returns {Array<{ id: string, name?: string }>}
 */
function pickCloseTargets(_running, _opts) {
  return [];
}

module.exports = {
  MAX_RUNNING_STEALTH_PROFILES,
  resolveMaxRunningProfiles,
  PROTECTED_NAMES,
  isProtectedName,
  pickCloseTargets,
};
