"use strict";

const fs = require("node:fs");
const path = require("node:path");

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

function loadLoginIdAliases() {
  const candidates = [
    path.join(__dirname, "../data/hub-login-id-aliases.json"),
    path.join(__dirname, "../../../Tool/docs/playbooks/_cards/hub-login-id-aliases.json"),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return parsed.aliases && typeof parsed.aliases === "object" ? parsed.aliases : {};
    } catch {
      /* try next */
    }
  }
  return {};
}

const HUB_LOGIN_ID_ALIASES = Object.freeze(loadLoginIdAliases());

function canonicalLoginId(raw) {
  const id = normalizeLoginId(raw);
  if (!id) return null;
  return HUB_LOGIN_ID_ALIASES[id] ?? id;
}

function loginIdFromContactEmail(email) {
  const mail = sanitizeHubLoginInput(String(email ?? "")).toLowerCase();
  if (!mail || !looksLikeEmail(mail) || isHubSyntheticEmail(mail)) return null;
  return normalizeLoginId(mail.split("@")[0] ?? "");
}

function hubAuthEmailsForSignIn(input) {
  const trimmed = sanitizeHubLoginInput(input).toLowerCase();
  if (!trimmed) return [];
  if (!looksLikeEmail(trimmed)) {
    const loginId = canonicalLoginId(trimmed);
    if (!loginId) return [];
    return [`${loginId}${HUB_ID_EMAIL_DOMAIN}`, `${loginId}${HUB_ID_EMAIL_LEGACY_DOMAIN}`];
  }
  const loginId = loginIdFromSyntheticEmail(trimmed);
  if (loginId) {
    const canonical = canonicalLoginId(loginId) ?? loginId;
    return [`${canonical}${HUB_ID_EMAIL_DOMAIN}`, `${canonical}${HUB_ID_EMAIL_LEGACY_DOMAIN}`];
  }
  return [trimmed];
}

function hubAuthEmailsFromLogin(input) {
  const trimmed = sanitizeHubLoginInput(input).toLowerCase();
  if (!trimmed) throw new Error("Invalid user ID");
  if (looksLikeEmail(trimmed)) return hubAuthEmailsForSignIn(trimmed);
  const loginId = canonicalLoginId(trimmed);
  if (!loginId) throw new Error("Invalid user ID");
  return [`${loginId}${HUB_ID_EMAIL_DOMAIN}`, `${loginId}${HUB_ID_EMAIL_LEGACY_DOMAIN}`];
}

function hubAuthEmailFromLogin(input) {
  return hubAuthEmailsFromLogin(input)[0];
}

function resolveHubLogin(input) {
  const trimmed = sanitizeHubLoginInput(input).toLowerCase();
  if (!trimmed) throw new Error("Enter your user ID or email");
  if (looksLikeEmail(trimmed)) {
    return { authEmail: trimmed, loginId: null, isEmailLogin: true };
  }
  const loginId = canonicalLoginId(trimmed);
  if (!loginId) throw new Error("Invalid user ID (use 3–32 letters, numbers, . _ -)");
  return {
    authEmail: `${loginId}${HUB_ID_EMAIL_DOMAIN}`,
    loginId,
    isEmailLogin: false,
  };
}

function hubAuthEmailFromLoginOrEmail({ loginId, email }) {
  const id = canonicalLoginId(String(loginId ?? "").trim()) ?? normalizeLoginId(String(loginId ?? "").trim());
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
    return { authEmail: mail, loginId: loginIdFromContactEmail(mail), contactEmail: mail };
  }
  return { error: "login_id or email required" };
}

module.exports = {
  HUB_ID_EMAIL_DOMAIN,
  HUB_ID_EMAIL_LEGACY_DOMAIN,
  HUB_ID_EMAIL_DOMAINS,
  HUB_LOGIN_ID_ALIASES,
  isHubSyntheticEmail,
  sanitizeHubLoginInput,
  normalizeLoginId,
  canonicalLoginId,
  loginIdFromSyntheticEmail,
  loginIdFromContactEmail,
  hubAuthEmailsForSignIn,
  hubAuthEmailFromLogin,
  hubAuthEmailsFromLogin,
  resolveHubLogin,
  hubAuthEmailFromLoginOrEmail,
};
