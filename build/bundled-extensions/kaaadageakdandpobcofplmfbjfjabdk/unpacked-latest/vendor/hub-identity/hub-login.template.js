/** Synced from packages/hub-identity - browser ES module for E0001 (hand-validated). */

export const HUB_ID_EMAIL_DOMAIN = "@infix1.io.vn";
export const HUB_ID_EMAIL_LEGACY_DOMAIN = "@id.hub.x1z10.local";
export const HUB_ID_EMAIL_DOMAINS = [HUB_ID_EMAIL_DOMAIN, HUB_ID_EMAIL_LEGACY_DOMAIN];

/** Immutable GoTrue address bound to auth.users.id. */
export const HUB_OPAQUE_AUTH_EMAIL_DOMAIN = "@auth.infi.internal";

/** SSOT: packages/hub-identity/data/hub-login-id-aliases.json */
export const HUB_LOGIN_ID_ALIASES = Object.freeze({
  enzyadmin: "enzy.admin",
  crpgo: "czpgo",
  phuongkt01: "phuongkd01",
});

export function isHubSyntheticEmail(email) {
  const v = String(email ?? "").trim().toLowerCase();
  return HUB_ID_EMAIL_DOMAINS.some((domain) => v.endsWith(domain));
}

export function isHubOpaqueAuthEmail(email) {
  const v = String(email ?? "").trim().toLowerCase();
  return Boolean(v) && v.endsWith(HUB_OPAQUE_AUTH_EMAIL_DOMAIN);
}

export function isHubTechnicalAuthEmail(email) {
  return isHubSyntheticEmail(email) || isHubOpaqueAuthEmail(email);
}

/** Bind auth.users.email to the immutable user id (signup / admin create). */
export function hubOpaqueAuthEmailFromUserId(userId) {
  const id = String(userId ?? "").trim().toLowerCase();
  if (!id) throw new Error("Invalid Hub user id");
  return `u_${id}${HUB_OPAQUE_AUTH_EMAIL_DOMAIN}`;
}

/** Derive login_id from real contact email local-part (before @). */
export function loginIdFromContactEmail(email) {
  const mail = sanitizeHubLoginInput(String(email ?? "")).toLowerCase();
  if (!mail || !looksLikeEmail(mail) || isHubTechnicalAuthEmail(mail)) return null;
  return normalizeLoginId(mail.split("@")[0] ?? "");
}

export function loginIdFromSyntheticEmail(email) {
  if (!email || !isHubSyntheticEmail(email)) return null;
  const local = email.split("@")[0]?.trim().toLowerCase();
  return local || null;
}

export function looksLikeEmail(input) {
  return input.includes("@");
}

export function sanitizeHubLoginInput(input) {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

export function normalizeLoginId(raw) {
  const id = sanitizeHubLoginInput(raw).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(id)) return null;
  return id;
}

export function canonicalLoginId(raw) {
  const id = normalizeLoginId(raw);
  if (!id) return null;
  return HUB_LOGIN_ID_ALIASES[id] ?? id;
}

/** E.164-compatible digits (no leading +). VN local 0xxxxxxxxx -> 84xxxxxxxxx. */
export function normalizeHubPhoneForLookup(input) {
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

export function looksLikePhoneLogin(input) {
  const sanitized = sanitizeHubLoginInput(input);
  if (!sanitized || looksLikeEmail(sanitized)) return false;
  const compact = sanitized.replace(/[\s()./-]/g, "");
  if (/^\+?\d{9,15}$/.test(compact)) return normalizeHubPhoneForLookup(sanitized) != null;
  if (/^[+\d][\d\s()./-]*$/.test(sanitized) && /[+\s()./-]/.test(sanitized)) {
    return normalizeHubPhoneForLookup(sanitized) != null;
  }
  return false;
}

/** Classify username / email / registered phone before resolve + password grant. */
export function classifyHubLoginIdentifier(input) {
  const sanitized = sanitizeHubLoginInput(input);
  if (!sanitized) return { kind: "empty", sanitized: "", loginId: null, phoneNormalized: null };
  if (looksLikeEmail(sanitized)) {
    return { kind: "email", sanitized: sanitized.toLowerCase(), loginId: null, phoneNormalized: null };
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
  if (loginId) return { kind: "username", sanitized, loginId, phoneNormalized: null };
  return { kind: "invalid", sanitized, loginId: null, phoneNormalized: null };
}

/** Username/phone → [] (caller must use resolve-login). Never invent @infix1. */
export function hubAuthEmailsForSignIn(input) {
  const classified = classifyHubLoginIdentifier(input);
  if (classified.kind === "empty" || classified.kind === "invalid" || classified.kind === "phone") {
    return [];
  }
  if (classified.kind === "username") {
    return [];
  }
  const trimmed = classified.sanitized.toLowerCase();
  if (typeof isHubSyntheticEmail === "function" && isHubSyntheticEmail(trimmed)) return [];
  return [trimmed];
}

export function hubAuthEmailFromLogin(input) {
  const emails = hubAuthEmailsForSignIn(input);
  if (!emails.length) throw new Error("Enter your username, email, or phone");
  return emails[0];
}

export function hubAuthEmailsFromLogin(input) {
  return hubAuthEmailsForSignIn(input);
}

export function resolveHubLogin(input) {
  const classified = classifyHubLoginIdentifier(input);
  if (classified.kind === "empty") throw new Error("Enter your username, email, or phone");
  if (classified.kind === "invalid") {
    throw new Error("Invalid username (use 3-32 letters, numbers, . _ -)");
  }
  if (classified.kind === "email") {
    return { authEmail: classified.sanitized, loginId: null, isEmailLogin: true, kind: "email" };
  }
  if (classified.kind === "phone") {
    return { authEmail: "", loginId: null, isEmailLogin: false, kind: "phone" };
  }
  return {
    authEmail: "",
    loginId: classified.loginId,
    isEmailLogin: false,
    kind: "username",
  };
}

/** Email shown in UI — real contact first; never surface opaque or `@infix1.io.vn`. */
export function hubDisplayEmail(opts = {}) {
  const contact = String(opts.contactEmail ?? "").trim().toLowerCase();
  if (contact && !isHubTechnicalAuthEmail(contact)) return contact;
  const profileMail = String(opts.profileEmail ?? "").trim().toLowerCase();
  if (profileMail && !isHubTechnicalAuthEmail(profileMail)) return profileMail;
  const auth = String(opts.authEmail ?? "").trim().toLowerCase();
  if (auth && !isHubTechnicalAuthEmail(auth)) return auth;
  return "";
}

export function hubAccountEmailLabel(opts = {}, emptyLabel = "Not linked") {
  return hubDisplayEmail(opts) || emptyLabel;
}

export function hubDisplayLoginId(opts = {}) {
  const explicit = String(opts.loginId ?? "").trim().toLowerCase();
  if (explicit) return explicit;
  return loginIdFromContactEmail(opts.authEmail) ?? "";
}

/**
 * Header / toast identity — P0004 footer parity.
 * Display User ID, else contact local-part, else leftover auth local-part.
 * Never paints `@infix1.io.vn` or `u_<uuid>@auth.infi.internal`.
 */
export function hubWorkspaceIdentityLabel(opts = {}) {
  const loginId = hubDisplayLoginId({
    loginId: opts.loginId,
    authEmail: opts.contactEmail || opts.profileEmail || "",
  });
  if (loginId) return loginId;
  const contact = hubDisplayEmail(opts);
  if (contact) {
    const local = contact.split("@")[0]?.trim() ?? "";
    if (local) return local;
  }
  const auth = String(opts.authEmail ?? "").trim().toLowerCase();
  if (auth && !isHubOpaqueAuthEmail(auth) && !auth.startsWith("pending_")) {
    const local = auth.split("@")[0]?.trim() ?? "";
    if (local && !/^u_[0-9a-f-]{8,}$/i.test(local) && !local.startsWith("pending_")) {
      return local;
    }
  }
  return "";
}

export function hubAuthEmailFromLoginOrEmail(opts = {}) {
  const id = canonicalLoginId(String(opts.loginId ?? "").trim());
  const mail = sanitizeHubLoginInput(String(opts.email ?? "")).toLowerCase();
  if (mail) {
    if (isHubOpaqueAuthEmail(mail)) {
      return { error: "Opaque Hub auth email cannot be used as contact" };
    }
    if (isHubSyntheticEmail(mail)) {
      return { error: "Synthetic @infix1 emails are retired — use username + contact email" };
    }
    return { authEmail: mail, loginId: id ?? loginIdFromContactEmail(mail), contactEmail: mail };
  }
  if (id) {
    return {
      authEmail: `pending_${id}_${Date.now().toString(36)}@auth.infi.internal`,
      loginId: id,
      contactEmail: mail && !isHubTechnicalAuthEmail(mail) ? mail : null,
    };
  }
  return { error: "login_id or email required" };
}

export function canUseEmailPasswordRecovery(email) {
  const v = (email ?? "").trim();
  return Boolean(v) && !isHubTechnicalAuthEmail(v) && looksLikeEmail(v);
}
