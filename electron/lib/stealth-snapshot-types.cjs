"use strict";

const STEALTH_SNAPSHOT_VERSION = 1;

const STEALTH_STATUS = Object.freeze([
  "unknown",
  "not_logged_in",
  "challenged",
  "logged_in",
  "running",
]);

const STEALTH_RESULT_CODES = Object.freeze([
  "inbox_ok",
  "login_page",
  "google_challenge",
  "microsoft_challenge",
  "2fa_pending",
  "google_cookies",
  "microsoft_cookies",
  "partial_auth_cookies",
  "session_ambiguous",
  "detect_failed",
  "no_vault_match",
]);

function normalizeStealthStatus(value) {
  const v = String(value || "").trim().toLowerCase();
  return STEALTH_STATUS.includes(v) ? v : "unknown";
}

function normalizeStealthResultCode(value) {
  const v = String(value || "").trim().toLowerCase();
  return STEALTH_RESULT_CODES.includes(v) ? v : "detect_failed";
}

function buildStealthSnapshot(partial = {}) {
  const assigned = partial.assigned_browser ? String(partial.assigned_browser).trim() : "";
  const actual = partial.actual_browser ? String(partial.actual_browser).trim() : "";
  const mismatch =
    typeof partial.mismatch === "boolean"
      ? partial.mismatch
      : Boolean(assigned && actual && assigned !== actual);

  return {
    v: STEALTH_SNAPSHOT_VERSION,
    status: normalizeStealthStatus(partial.status),
    result_code: normalizeStealthResultCode(partial.result_code),
    checked_at: partial.checked_at || new Date().toISOString(),
    source: String(partial.source || "auto").trim() || "auto",
    assigned_browser: assigned || null,
    actual_browser: actual || null,
    mismatch,
    profile_id: partial.profile_id ? String(partial.profile_id) : null,
    evidence: String(partial.evidence || "").slice(0, 240),
    note: String(partial.note || "").slice(0, 240),
  };
}

module.exports = {
  STEALTH_SNAPSHOT_VERSION,
  STEALTH_STATUS,
  STEALTH_RESULT_CODES,
  normalizeStealthStatus,
  normalizeStealthResultCode,
  buildStealthSnapshot,
};
