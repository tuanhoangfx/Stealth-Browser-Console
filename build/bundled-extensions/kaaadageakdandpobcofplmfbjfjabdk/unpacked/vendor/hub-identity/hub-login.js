/** Synced from packages/hub-identity — browser ES module for E0001 (hand-validated). */

export const HUB_ID_EMAIL_DOMAIN = "@infix1.io.vn";
export const HUB_ID_EMAIL_LEGACY_DOMAIN = "@id.hub.x1z10.local";
export const HUB_ID_EMAIL_DOMAINS = [HUB_ID_EMAIL_DOMAIN, HUB_ID_EMAIL_LEGACY_DOMAIN];

export function isHubSyntheticEmail(email) {
  const v = String(email ?? "").trim().toLowerCase();
  return HUB_ID_EMAIL_DOMAINS.some((domain) => v.endsWith(domain));
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

export function hubAuthEmailsForSignIn(input) {
  const trimmed = sanitizeHubLoginInput(input).toLowerCase();
  if (!trimmed) return [];
  if (!looksLikeEmail(trimmed)) {
    const loginId = normalizeLoginId(trimmed);
    if (!loginId) return [];
    return [`${loginId}${HUB_ID_EMAIL_DOMAIN}`, `${loginId}${HUB_ID_EMAIL_LEGACY_DOMAIN}`];
  }
  const loginId = loginIdFromSyntheticEmail(trimmed);
  if (loginId) {
    return [`${loginId}${HUB_ID_EMAIL_DOMAIN}`, `${loginId}${HUB_ID_EMAIL_LEGACY_DOMAIN}`];
  }
  return [trimmed];
}

export function hubAuthEmailFromLogin(input) {
  const emails = hubAuthEmailsForSignIn(input);
  if (!emails.length) throw new Error("Invalid user ID (use 3–32 letters, numbers, . _ -)");
  return emails[0];
}

export function hubAuthEmailsFromLogin(input) {
  return hubAuthEmailsForSignIn(input);
}

export function resolveHubLogin(input) {
  const trimmed = sanitizeHubLoginInput(input).toLowerCase();
  if (!trimmed) throw new Error("Enter your user ID or email");
  if (looksLikeEmail(trimmed)) {
    return { authEmail: trimmed, loginId: null, isEmailLogin: true };
  }
  const loginId = normalizeLoginId(trimmed);
  if (!loginId) throw new Error("Invalid user ID (use 3–32 letters, numbers, . _ -)");
  return {
    authEmail: `${loginId}${HUB_ID_EMAIL_DOMAIN}`,
    loginId,
    isEmailLogin: false,
  };
}

export function hubDisplayEmail(opts = {}) {
  const contact = (opts.contactEmail ?? opts.profileEmail ?? "").trim();
  if (contact && !isHubSyntheticEmail(contact)) return contact;
  const auth = (opts.authEmail ?? "").trim();
  if (auth && !isHubSyntheticEmail(auth)) return auth;
  return "";
}

export function hubDisplayLoginId(opts = {}) {
  const explicit = (opts.loginId ?? "").trim();
  if (explicit) return explicit;
  return loginIdFromSyntheticEmail(opts.authEmail) ?? "";
}

export function canUseEmailPasswordRecovery(email) {
  const v = (email ?? "").trim();
  return Boolean(v) && !isHubSyntheticEmail(v) && looksLikeEmail(v);
}
