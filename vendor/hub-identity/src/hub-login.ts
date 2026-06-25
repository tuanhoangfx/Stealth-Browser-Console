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
  const id = sanitizeHubLoginInput(raw).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(id)) return null;
  return id;
}

/** Canonical @infix1.io.vn inbox for a normalized User ID. */
export function hubSyntheticEmailFromLoginId(loginId: string): string {
  const id = normalizeLoginId(loginId);
  if (!id) throw new Error("Invalid user ID");
  return `${id}${HUB_ID_EMAIL_DOMAIN}`;
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

/** Email shown in UI — real contact first; synthetic @infix1.io.vn until user links another. */
export function hubDisplayEmail(opts: {
  authEmail?: string | null;
  contactEmail?: string | null;
  profileEmail?: string | null;
}): string {
  const contact = (opts.contactEmail ?? "").trim().toLowerCase();
  if (contact && !isHubSyntheticEmail(contact)) return contact;
  const profileMail = (opts.profileEmail ?? "").trim().toLowerCase();
  if (profileMail && !isHubSyntheticEmail(profileMail)) return profileMail;
  const auth = (opts.authEmail ?? "").trim().toLowerCase();
  if (auth && !isHubSyntheticEmail(auth)) return auth;
  if (auth && isHubSyntheticEmail(auth)) return auth;
  if (profileMail && isHubSyntheticEmail(profileMail)) return profileMail;
  return "";
}

export function hubDisplayLoginId(opts: {
  loginId?: string | null;
  authEmail?: string | null;
}): string {
  const explicit = (opts.loginId ?? "").trim().toLowerCase();
  if (explicit) return explicit;
  return loginIdFromSyntheticEmail(opts.authEmail) ?? "";
}

export function hubAuthEmailFromLoginOrEmail(opts: {
  loginId?: string | null;
  email?: string | null;
}): { authEmail: string; loginId: string | null; contactEmail: string | null } | { error: string } {
  const id = normalizeLoginId(String(opts.loginId ?? "").trim());
  const mail = sanitizeHubLoginInput(String(opts.email ?? "")).toLowerCase();
  if (id) {
    const contactEmail = mail && !isHubSyntheticEmail(mail) ? mail : null;
    return {
      authEmail: `${id}${HUB_ID_EMAIL_DOMAIN}`,
      loginId: id,
      contactEmail,
    };
  }
  if (mail) {
    if (isHubSyntheticEmail(mail)) {
      const fromMail = loginIdFromSyntheticEmail(mail);
      if (!fromMail) return { error: "Invalid synthetic email" };
      return {
        authEmail: `${fromMail}${HUB_ID_EMAIL_DOMAIN}`,
        loginId: fromMail,
        contactEmail: null,
      };
    }
    return { authEmail: mail, loginId: null, contactEmail: mail };
  }
  return { error: "login_id or email required" };
}

export function canUseEmailPasswordRecovery(email: string | null | undefined): boolean {
  const v = (email ?? "").trim();
  return Boolean(v) && !isHubSyntheticEmail(v) && looksLikeEmail(v);
}
