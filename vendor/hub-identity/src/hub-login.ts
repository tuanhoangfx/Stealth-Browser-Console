/** Internal auth email domain for User ID sign-in (Supabase requires an email). */
import aliasRegistry from "../data/hub-login-id-aliases.json";

/** Retired username-derived domain — reject/hide only. Never invent. */
export const HUB_ID_EMAIL_DOMAIN = "@infix1.io.vn";

/** Retired legacy synthetic — reject/hide only. Never invent. */
export const HUB_ID_EMAIL_LEGACY_DOMAIN = "@id.hub.x1z10.local";

export const HUB_ID_EMAIL_DOMAINS = [HUB_ID_EMAIL_DOMAIN, HUB_ID_EMAIL_LEGACY_DOMAIN] as const;

/**
 * Immutable GoTrue address bound to auth.users.id (not username-derived).
 * Format: `u_<uuid>@auth.infi.internal`
 */
export const HUB_OPAQUE_AUTH_EMAIL_DOMAIN = "@auth.infi.internal";

export function isHubSyntheticEmail(email: string | null | undefined): boolean {
  const v = String(email ?? "").trim().toLowerCase();
  return HUB_ID_EMAIL_DOMAINS.some((domain) => v.endsWith(domain));
}

/** Username-derived synthetics only (`@infix1.io.vn` / legacy) — migrate script filter. */
export function isHubDeterministicSyntheticEmail(email: string | null | undefined): boolean {
  return isHubSyntheticEmail(email);
}

export function isHubOpaqueAuthEmail(email: string | null | undefined): boolean {
  const v = String(email ?? "").trim().toLowerCase();
  return Boolean(v) && v.endsWith(HUB_OPAQUE_AUTH_EMAIL_DOMAIN);
}

/** Synthetic or opaque — never treat as a user-linked contact / recovery inbox. */
export function isHubTechnicalAuthEmail(email: string | null | undefined): boolean {
  return isHubSyntheticEmail(email) || isHubOpaqueAuthEmail(email);
}

/** Bind auth.users.email to the immutable user id (signup / admin create). */
export function hubOpaqueAuthEmailFromUserId(userId: string): string {
  const id = String(userId ?? "").trim().toLowerCase();
  if (!id) throw new Error("Invalid Hub user id");
  return `u_${id}${HUB_OPAQUE_AUTH_EMAIL_DOMAIN}`;
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

/**
 * E.164-compatible digits for Hub phone login resolve (no leading +).
 * VN local `0xxxxxxxxx` → `84xxxxxxxxx`. Returns null when not dialable.
 */
export function normalizeHubPhoneForLookup(input: string): string | null {
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

/**
 * Phone-shaped login (not email). Pure digit strings of length 9–15 count as phone
 * so resolve runs server-side instead of inventing a synthetic username email.
 */
export function looksLikePhoneLogin(input: string): boolean {
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

export type HubLoginIdentifierKind = "email" | "username" | "phone" | "empty" | "invalid";

export type ClassifiedHubLoginIdentifier = {
  kind: HubLoginIdentifierKind;
  sanitized: string;
  loginId: string | null;
  phoneNormalized: string | null;
};

/** Classify username / email / registered phone before resolve + password grant. */
export function classifyHubLoginIdentifier(input: string): ClassifiedHubLoginIdentifier {
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

/** Workspace user ID: 3–32 chars, lowercase letter/digit/._- */
export function normalizeLoginId(raw: string): string | null {
  const id = sanitizeHubLoginInput(raw).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(id)) return null;
  return id;
}

/**
 * Known User ID aliases → canonical login_id (auth email local-part).
 * SSOT: Tool/docs/playbooks/_cards/hub-login-id-aliases.json
 */
export const HUB_LOGIN_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  ...aliasRegistry.aliases,
});

/** Derive login_id from real contact email local-part (before @). */
export function loginIdFromContactEmail(email: string | null | undefined): string | null {
  const mail = sanitizeHubLoginInput(String(email ?? "")).toLowerCase();
  if (!mail || !looksLikeEmail(mail) || isHubTechnicalAuthEmail(mail)) return null;
  return normalizeLoginId(mail.split("@")[0] ?? "");
}

/** Apply alias then normalize — null if invalid. */
export function canonicalLoginId(raw: string): string | null {
  const id = normalizeLoginId(raw);
  if (!id) return null;
  return HUB_LOGIN_ID_ALIASES[id] ?? id;
}

/** Retired — never invent username-derived GoTrue addresses. */
export function hubSyntheticEmailFromLoginId(_loginId: string): never {
  throw new Error("Synthetic username-derived auth emails are retired — use username + contact email");
}

/** Canonical synthetic auth email for a User ID or email input — LEGACY detector only. */
export function hubAuthEmailFromLogin(input: string): string {
  const emails = hubAuthEmailsFromLogin(input);
  if (!emails.length) {
    throw new Error("Username sign-in requires resolve-login (no @infix1 synthetic).");
  }
  return emails[0];
}

/**
 * @deprecated Leftover @infix1 / legacy rows only — do not use for new sign-in.
 * Prefer resolve-login → Hub opaque `u_<uuid>@auth.infi.internal`.
 */
export function hubAuthEmailsFromLogin(input: string): string[] {
  const classified = classifyHubLoginIdentifier(input);
  if (classified.kind === "empty") throw new Error("Enter your username, email, or phone");
  if (classified.kind === "phone") {
    throw new Error("Use username or email to create an account — phone is sign-in only.");
  }
  if (classified.kind === "email") {
    if (isHubSyntheticEmail(classified.sanitized)) return [];
    return [classified.sanitized];
  }
  if (classified.kind !== "username" || !classified.loginId) {
    throw new Error("Invalid username (use 3–32 letters, numbers, . _ -)");
  }
  // Kept for migrate/audit detectors only — empty for live sign-in paths.
  return [];
}

/**
 * Auth emails to try for password sign-in.
 * Username/phone → [] (caller must use resolve-login). Registered email → [email].
 * Never invents @infix1 / legacy synthetics.
 */
export function hubAuthEmailsForSignIn(input: string): string[] {
  const classified = classifyHubLoginIdentifier(input);
  if (classified.kind === "empty" || classified.kind === "invalid" || classified.kind === "phone") {
    return [];
  }
  if (classified.kind === "username") {
    return [];
  }
  const trimmed = classified.sanitized.toLowerCase();
  if (isHubSyntheticEmail(trimmed)) return [];
  return [trimmed];
}

export type ResolvedLogin = {
  authEmail: string;
  loginId: string | null;
  isEmailLogin: boolean;
  /** username | email | phone — phone has empty authEmail until gateway resolve. */
  kind: Exclude<HubLoginIdentifierKind, "empty" | "invalid">;
};

export function resolveHubLogin(input: string): ResolvedLogin {
  const classified = classifyHubLoginIdentifier(input);
  if (classified.kind === "empty") throw new Error("Enter your username, email, or phone");
  if (classified.kind === "invalid") {
    throw new Error("Invalid username (use 3–32 letters, numbers, . _ -)");
  }
  if (classified.kind === "email") {
    return {
      authEmail: classified.sanitized,
      loginId: null,
      isEmailLogin: true,
      kind: "email",
    };
  }
  if (classified.kind === "phone") {
    return {
      authEmail: "",
      loginId: null,
      isEmailLogin: false,
      kind: "phone",
    };
  }
  return {
    authEmail: "",
    loginId: classified.loginId,
    isEmailLogin: false,
    kind: "username",
  };
}

/** Email shown in UI — real contact first; never surface opaque or `@infix1.io.vn` synthetics. */
export function hubDisplayEmail(opts: {
  authEmail?: string | null;
  contactEmail?: string | null;
  profileEmail?: string | null;
}): string {
  const contact = (opts.contactEmail ?? "").trim().toLowerCase();
  if (contact && !isHubTechnicalAuthEmail(contact) && !isHubSyntheticEmail(contact)) return contact;
  const profileMail = (opts.profileEmail ?? "").trim().toLowerCase();
  if (profileMail && !isHubTechnicalAuthEmail(profileMail) && !isHubSyntheticEmail(profileMail)) {
    return profileMail;
  }
  const auth = (opts.authEmail ?? "").trim().toLowerCase();
  if (auth && !isHubTechnicalAuthEmail(auth) && !isHubSyntheticEmail(auth)) return auth;
  return "";
}

/**
 * Account modal / footer Credentials email — same SSOT as Users directory (`profiles.email`).
 * Never paints opaque or synthetic Hub auth addresses (`u_…@auth.infi.internal`, `@infix1.io.vn`).
 */
export function hubAccountEmailLabel(
  opts: {
    authEmail?: string | null;
    contactEmail?: string | null;
    profileEmail?: string | null;
  },
  emptyLabel = "Not linked",
): string {
  const shown = hubDisplayEmail(opts);
  return shown || emptyLabel;
}

export function hubDisplayLoginId(opts: {
  loginId?: string | null;
  authEmail?: string | null;
}): string {
  const explicit = (opts.loginId ?? "").trim().toLowerCase();
  if (explicit) return explicit;
  return loginIdFromContactEmail(opts.authEmail) ?? "";
}

export function hubAuthEmailFromLoginOrEmail(opts: {
  loginId?: string | null;
  email?: string | null;
}): { authEmail: string; loginId: string | null; contactEmail: string | null } | { error: string } {
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
    const contactEmail = mail && !isHubTechnicalAuthEmail(mail) ? mail : null;
    // Provisional GoTrue email until createUser returns id → bind u_<uuid>@auth.infi.internal.
    return {
      authEmail: `pending_${id}_${Date.now().toString(36)}@auth.infi.internal`,
      loginId: id,
      contactEmail,
    };
  }
  return { error: "login_id or email required" };
}

export function canUseEmailPasswordRecovery(email: string | null | undefined): boolean {
  const v = (email ?? "").trim();
  return Boolean(v) && !isHubTechnicalAuthEmail(v) && looksLikeEmail(v);
}
