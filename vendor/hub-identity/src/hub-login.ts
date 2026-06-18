/** Internal auth email domain for User ID sign-in (Supabase requires an email). */
export const HUB_ID_EMAIL_DOMAIN = "@infix1.io.vn";

/** Legacy synthetic domain — kept for matching existing auth.users rows. */
export const HUB_ID_EMAIL_LEGACY_DOMAIN = "@id.hub.x1z10.local";

export const HUB_ID_EMAIL_DOMAINS = [HUB_ID_EMAIL_DOMAIN, HUB_ID_EMAIL_LEGACY_DOMAIN] as const;

export function isHubSyntheticEmail(email: string | null | undefined): boolean {
  const v = String(email ?? "").trim().toLowerCase();
  return HUB_ID_EMAIL_DOMAINS.some((domain) => v.endsWith(domain));
}

export function loginIdFromSyntheticEmail(email: string | null | undefined): string | null {
  if (!email || !isHubSyntheticEmail(email)) return null;
  const local = email.split("@")[0]?.trim().toLowerCase();
  return local || null;
}

export function looksLikeEmail(input: string): boolean {
  return input.includes("@");
}

/** Trim + NFKC — avoids invisible chars breaking User ID sign-in. */
export function sanitizeHubLoginInput(input: string): string {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

/** Workspace user ID: 3–32 chars, lowercase letter/digit/._- */
export function normalizeLoginId(raw: string): string | null {
  const id = raw.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(id)) return null;
  return id;
}

/** Canonical synthetic auth email for a User ID or email input. */
export function hubAuthEmailFromLogin(input: string): string {
  return hubAuthEmailsFromLogin(input)[0];
}

/** Primary + legacy synthetic emails for sign-in fallback on migrated Hub accounts. */
export function hubAuthEmailsFromLogin(input: string): string[] {
  const trimmed = sanitizeHubLoginInput(input).toLowerCase();
  if (!trimmed) throw new Error("Enter your user ID or email");
  if (looksLikeEmail(trimmed)) return hubAuthEmailsForSignIn(trimmed);
  const loginId = normalizeLoginId(trimmed);
  if (!loginId) throw new Error("Invalid user ID (use 3–32 letters, numbers, . _ -)");
  return [`${loginId}${HUB_ID_EMAIL_DOMAIN}`, `${loginId}${HUB_ID_EMAIL_LEGACY_DOMAIN}`];
}

/** All auth emails to try for password sign-in (User ID, synthetic, or real email). */
export function hubAuthEmailsForSignIn(input: string): string[] {
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

export type ResolvedLogin = {
  authEmail: string;
  loginId: string | null;
  isEmailLogin: boolean;
};

export function resolveHubLogin(input: string): ResolvedLogin {
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

/** Email shown in UI (contact / linked), not the internal auth address. */
export function hubDisplayEmail(opts: {
  authEmail?: string | null;
  contactEmail?: string | null;
  profileEmail?: string | null;
}): string {
  const contact = (opts.contactEmail ?? opts.profileEmail ?? "").trim();
  if (contact && !isHubSyntheticEmail(contact)) return contact;
  const auth = (opts.authEmail ?? "").trim();
  if (auth && !isHubSyntheticEmail(auth)) return auth;
  return "";
}

export function hubDisplayLoginId(opts: {
  loginId?: string | null;
  authEmail?: string | null;
}): string {
  const explicit = (opts.loginId ?? "").trim();
  if (explicit) return explicit;
  return loginIdFromSyntheticEmail(opts.authEmail) ?? "";
}

export function canUseEmailPasswordRecovery(email: string | null | undefined): boolean {
  const v = (email ?? "").trim();
  return Boolean(v) && !isHubSyntheticEmail(v) && looksLikeEmail(v);
}
