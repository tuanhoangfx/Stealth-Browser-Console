"use strict";

const HUB_ID_EMAIL_DOMAIN = "@infix1.io.vn";
const HUB_ID_EMAIL_LEGACY_DOMAIN = "@id.hub.x1z10.local";
const HUB_ID_EMAIL_DOMAINS = [HUB_ID_EMAIL_DOMAIN, HUB_ID_EMAIL_LEGACY_DOMAIN];

function isHubSyntheticEmail(email) {
  const v = String(email ?? "").trim().toLowerCase();
  return HUB_ID_EMAIL_DOMAINS.some((domain) => v.endsWith(domain));
}

function looksLikeEmail(input) {
  return String(input).includes("@");
}

function normalizeLoginId(raw) {
  const id = String(raw ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(id)) return null;
  return id;
}

function hubAuthEmailsFromLogin(input) {
  const trimmed = String(input ?? "").trim().toLowerCase();
  if (looksLikeEmail(trimmed)) return [trimmed];
  const loginId = normalizeLoginId(trimmed);
  if (!loginId) throw new Error("Invalid user ID");
  return [`${loginId}${HUB_ID_EMAIL_DOMAIN}`, `${loginId}${HUB_ID_EMAIL_LEGACY_DOMAIN}`];
}

function hubAuthEmailFromLogin(input) {
  return hubAuthEmailsFromLogin(input)[0];
}

function resolveHubLogin(input) {
  const trimmed = String(input ?? "").trim().toLowerCase();
  if (!trimmed) return { error: "Missing login" };
  if (looksLikeEmail(trimmed)) {
    return { authEmail: trimmed, loginId: null, isEmailLogin: true };
  }
  const loginId = normalizeLoginId(trimmed);
  if (!loginId) return { error: "Invalid user ID" };
  return {
    authEmail: `${loginId}${HUB_ID_EMAIL_DOMAIN}`,
    loginId,
    isEmailLogin: false,
  };
}

function hubAuthEmailFromLoginOrEmail({ loginId, email }) {
  const mail = String(email ?? "").trim().toLowerCase();
  if (mail) return { authEmail: mail, loginId: null };
  const id = normalizeLoginId(String(loginId ?? "").trim());
  if (!id) return { error: "login_id or email required" };
  return { authEmail: `${id}${HUB_ID_EMAIL_DOMAIN}`, loginId: id };
}

module.exports = {
  HUB_ID_EMAIL_DOMAIN,
  HUB_ID_EMAIL_LEGACY_DOMAIN,
  HUB_ID_EMAIL_DOMAINS,
  isHubSyntheticEmail,
  normalizeLoginId,
  hubAuthEmailFromLogin,
  hubAuthEmailsFromLogin,
  resolveHubLogin,
  hubAuthEmailFromLoginOrEmail,
};
