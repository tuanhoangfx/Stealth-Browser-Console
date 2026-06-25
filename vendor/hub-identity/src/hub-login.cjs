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

function sanitizeHubLoginInput(input) {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function loginIdFromSyntheticEmail(email) {
  if (!email || !isHubSyntheticEmail(email)) return null;
  const local = email.split("@")[0]?.trim().toLowerCase();
  return local || null;
}

function normalizeLoginId(raw) {
  const id = sanitizeHubLoginInput(raw).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(id)) return null;
  return id;
}

function hubAuthEmailsFromLogin(input) {
  const trimmed = sanitizeHubLoginInput(input).toLowerCase();
  if (!trimmed) throw new Error("Invalid user ID");
  if (looksLikeEmail(trimmed)) return [trimmed];
  const loginId = normalizeLoginId(trimmed);
  if (!loginId) throw new Error("Invalid user ID");
  return [`${loginId}${HUB_ID_EMAIL_DOMAIN}`, `${loginId}${HUB_ID_EMAIL_LEGACY_DOMAIN}`];
}

function hubAuthEmailFromLogin(input) {
  return hubAuthEmailsFromLogin(input)[0];
}

function resolveHubLogin(input) {
  const trimmed = sanitizeHubLoginInput(input).toLowerCase();
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
  const id = normalizeLoginId(String(loginId ?? "").trim());
  const mail = sanitizeHubLoginInput(String(email ?? "")).toLowerCase();
  if (id) {
    const contactEmail = mail && !isHubSyntheticEmail(mail) ? mail : null;
    return { authEmail: `${id}${HUB_ID_EMAIL_DOMAIN}`, loginId: id, contactEmail };
  }
  if (mail) {
    if (isHubSyntheticEmail(mail)) {
      const fromMail = loginIdFromSyntheticEmail(mail);
      if (!fromMail) return { error: "Invalid synthetic email" };
      return { authEmail: `${fromMail}${HUB_ID_EMAIL_DOMAIN}`, loginId: fromMail, contactEmail: null };
    }
    return { authEmail: mail, loginId: null, contactEmail: mail };
  }
  return { error: "login_id or email required" };
}

module.exports = {
  HUB_ID_EMAIL_DOMAIN,
  HUB_ID_EMAIL_LEGACY_DOMAIN,
  HUB_ID_EMAIL_DOMAINS,
  isHubSyntheticEmail,
  sanitizeHubLoginInput,
  normalizeLoginId,
  loginIdFromSyntheticEmail,
  hubAuthEmailFromLogin,
  hubAuthEmailsFromLogin,
  resolveHubLogin,
  hubAuthEmailFromLoginOrEmail,
};
