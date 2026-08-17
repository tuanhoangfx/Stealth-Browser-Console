"use strict";

const fs = require("node:fs");
const path = require("node:path");

const HUB_ID_EMAIL_DOMAIN = "@infix1.io.vn";
const HUB_ID_EMAIL_LEGACY_DOMAIN = "@id.hub.x1z10.local";
const HUB_ID_EMAIL_DOMAINS = [HUB_ID_EMAIL_DOMAIN, HUB_ID_EMAIL_LEGACY_DOMAIN];
const HUB_OPAQUE_AUTH_EMAIL_DOMAIN = "@auth.infi.internal";

function isHubSyntheticEmail(email) {
  const v = String(email ?? "").trim().toLowerCase();
  return HUB_ID_EMAIL_DOMAINS.some((domain) => v.endsWith(domain));
}

function isHubDeterministicSyntheticEmail(email) {
  return isHubSyntheticEmail(email);
}

function isHubOpaqueAuthEmail(email) {
  const v = String(email ?? "").trim().toLowerCase();
  return Boolean(v) && v.endsWith(HUB_OPAQUE_AUTH_EMAIL_DOMAIN);
}

function isHubTechnicalAuthEmail(email) {
  return isHubSyntheticEmail(email) || isHubOpaqueAuthEmail(email);
}

function hubOpaqueAuthEmailFromUserId(userId) {
  const id = String(userId ?? "").trim().toLowerCase();
  if (!id) throw new Error("Invalid Hub user id");
  return `u_${id}${HUB_OPAQUE_AUTH_EMAIL_DOMAIN}`;
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

function normalizeHubPhoneForLookup(input) {
  const sanitized = sanitizeHubLoginInput(input);
  if (!sanitized || looksLikeEmail(sanitized)) return null;
  let digits = sanitized.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 11) {
    digits = `84${digits.slice(1)}`;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

function looksLikePhoneLogin(input) {
  const sanitized = sanitizeHubLoginInput(input);
  if (!sanitized || looksLikeEmail(sanitized)) return false;
  const compact = sanitized.replace(/[\s()./-]/g, "");
  if (/^\+?\d{9,15}$/.test(compact)) {
    return normalizeHubPhoneForLookup(sanitized) != null;
  }
  if (/^[+\d][\d\s()./-]*$/.test(sanitized) && /[+\s()./-]/.test(sanitized)) {
    return normalizeHubPhoneForLookup(sanitized) != null;
  }
  return false;
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

function classifyHubLoginIdentifier(input) {
  const sanitized = sanitizeHubLoginInput(input);
  if (!sanitized) {
    return { kind: "empty", sanitized: "", loginId: null, phoneNormalized: null };
  }
  if (looksLikeEmail(sanitized)) {
    return {
      kind: "email",
      sanitized: sanitized.toLowerCase(),
      loginId: null,
      phoneNormalized: null,
    };
  }
  if (looksLikePhoneLogin(sanitized)) {
    return {
      kind: "phone",
      sanitized,
      loginId: null,
      phoneNormalized: normalizeHubPhoneForLookup(sanitized),
    };
  }
  const loginId = canonicalLoginId(sanitized);
  if (loginId) {
    return { kind: "username", sanitized, loginId, phoneNormalized: null };
  }
  return { kind: "invalid", sanitized, loginId: null, phoneNormalized: null };
}

function loginIdFromContactEmail(email) {
  const mail = sanitizeHubLoginInput(String(email ?? "")).toLowerCase();
  if (!mail || !looksLikeEmail(mail) || isHubSyntheticEmail(mail)) return null;
  return normalizeLoginId(mail.split("@")[0] ?? "");
}

function hubAuthEmailsForSignIn(input) {
  const classified = classifyHubLoginIdentifier(input);
  if (classified.kind === "empty" || classified.kind === "invalid" || classified.kind === "phone") {
    return [];
  }
  if (classified.kind === "username" && classified.loginId) {
    return [`${classified.loginId}${HUB_ID_EMAIL_DOMAIN}`, `${classified.loginId}${HUB_ID_EMAIL_LEGACY_DOMAIN}`];
  }
  const trimmed = classified.sanitized.toLowerCase();
  const loginId = loginIdFromSyntheticEmail(trimmed);
  if (loginId) {
    const canonical = canonicalLoginId(loginId) ?? loginId;
    return [`${canonical}${HUB_ID_EMAIL_DOMAIN}`, `${canonical}${HUB_ID_EMAIL_LEGACY_DOMAIN}`];
  }
  return [trimmed];
}

function hubAuthEmailsFromLogin(input) {
  const classified = classifyHubLoginIdentifier(input);
  if (classified.kind === "empty") throw new Error("Enter your username, email, or phone");
  if (classified.kind === "phone") {
    throw new Error("Use username or email to create an account — phone is sign-in only.");
  }
  if (classified.kind === "email") return hubAuthEmailsForSignIn(classified.sanitized);
  if (classified.kind !== "username" || !classified.loginId) {
    throw new Error("Invalid username (use 3–32 letters, numbers, . _ -)");
  }
  return [
    `${classified.loginId}${HUB_ID_EMAIL_DOMAIN}`,
    `${classified.loginId}${HUB_ID_EMAIL_LEGACY_DOMAIN}`,
  ];
}

function hubAuthEmailFromLogin(input) {
  return hubAuthEmailsFromLogin(input)[0];
}

function resolveHubLogin(input) {
  const classified = classifyHubLoginIdentifier(input);
  if (classified.kind === "empty") throw new Error("Enter your username, email, or phone");
  if (classified.kind === "invalid") {
    throw new Error("Invalid username (use 3–32 letters, numbers, . _ -)");
  }
  if (classified.kind === "email") {
    return { authEmail: classified.sanitized, loginId: null, isEmailLogin: true, kind: "email" };
  }
  if (classified.kind === "phone") {
    return { authEmail: "", loginId: null, isEmailLogin: false, kind: "phone" };
  }
  return {
    authEmail: `${classified.loginId}${HUB_ID_EMAIL_DOMAIN}`,
    loginId: classified.loginId,
    isEmailLogin: false,
    kind: "username",
  };
}

function hubAuthEmailFromLoginOrEmail({ loginId, email }) {
  const id = canonicalLoginId(String(loginId ?? "").trim()) ?? normalizeLoginId(String(loginId ?? "").trim());
  const mail = sanitizeHubLoginInput(String(email ?? "")).toLowerCase();
  if (id) {
    const contactEmail = mail && !isHubTechnicalAuthEmail(mail) ? mail : null;
    return { authEmail: `${id}${HUB_ID_EMAIL_DOMAIN}`, loginId: id, contactEmail };
  }
  if (mail) {
    if (isHubOpaqueAuthEmail(mail)) {
      return { error: "Opaque Hub auth email cannot be used as contact" };
    }
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
  HUB_OPAQUE_AUTH_EMAIL_DOMAIN,
  HUB_LOGIN_ID_ALIASES,
  isHubSyntheticEmail,
  isHubDeterministicSyntheticEmail,
  isHubOpaqueAuthEmail,
  isHubTechnicalAuthEmail,
  hubOpaqueAuthEmailFromUserId,
  sanitizeHubLoginInput,
  normalizeLoginId,
  canonicalLoginId,
  normalizeHubPhoneForLookup,
  looksLikePhoneLogin,
  classifyHubLoginIdentifier,
  loginIdFromSyntheticEmail,
  loginIdFromContactEmail,
  hubAuthEmailsForSignIn,
  hubAuthEmailFromLogin,
  hubAuthEmailsFromLogin,
  resolveHubLogin,
  hubAuthEmailFromLoginOrEmail,
};
