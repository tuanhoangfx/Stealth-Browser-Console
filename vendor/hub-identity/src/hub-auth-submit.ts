import {
  extractAuthErrorText,
  fallbackAuthErrorText,
} from "./extract-auth-error-text";
import {
  classifyHubLoginIdentifier,
  hubAuthEmailFromLoginOrEmail,
  hubAuthEmailsForSignIn,
  sanitizeHubLoginInput,
} from "./hub-login";
import { HUB_AUTH_FETCH_TIMEOUT_MESSAGE } from "./hub-auth-fetch";
import {
  type HubResolveLoginLookup,
  resolveHubLoginEmails,
} from "./hub-resolve-login-client";

export const HUB_INVALID_LOGIN = /invalid login credentials/i;

/** Returned when resolve-login finds no profile for a username (not wrong password). */
export const HUB_UNKNOWN_USER_ID_MESSAGE =
  "Username not found — check spelling or sign in with your email.";

/** Returned when resolve-login finds no profile for a registered phone. */
export const HUB_UNKNOWN_PHONE_MESSAGE =
  "Phone number not found — check the number or sign in with username/email.";

/**
 * Returned when resolve-login finds a profile for the phone but password grant fails.
 * Avoids the generic invalid-credentials copy that implies the phone itself is wrong.
 */
export const HUB_PHONE_WRONG_PASSWORD_MESSAGE =
  "Incorrect password for the account linked to this phone. Sign in with username/email if this number belongs to a different account.";

/**
 * Returned when resolve-login finds a profile for the username but password grant fails.
 * Avoids the generic invalid-credentials copy that implies the username itself is wrong.
 */
export const HUB_USERNAME_WRONG_PASSWORD_MESSAGE =
  "Incorrect password for this username. If you recently changed your Tool Hub password, use the new one.";

/** Returned when resolve-login API is unreachable or returns a non-OK response. */
export const HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE =
  "Sign-in service unavailable. Try again in a moment or sign in with your email.";

/** Transient Hub path — Dual recover worker may bypass (timeout / 5xx / abort). */
export function isHubIdentityTransientFailure(message: string | null | undefined): boolean {
  const msg = String(message ?? "").trim();
  if (!msg) return false;
  if (msg === HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE) return true;
  if (msg === HUB_AUTH_FETCH_TIMEOUT_MESSAGE) return true;
  return /timed out|AUTH_TIMEOUT|unavailable|aborted/i.test(msg);
}

export const HUB_INVALID_USERNAME_MESSAGE =
  "Invalid username (use 3–32 letters, numbers, . _ -)";

/** GoTrue needs an email for username Sign Up; rebound to `u_<uuid>@auth.infi.internal` after create. */
function signupAuthEmails(login: string, loginId: string | null, kind: string): string[] {
  if (kind === "email") return hubAuthEmailsForSignIn(login);
  if (kind === "username" && loginId) {
    const resolved = hubAuthEmailFromLoginOrEmail({ loginId });
    if ("error" in resolved) return [];
    return [resolved.authEmail];
  }
  return [];
}

export type HubPasswordAuthResult<T> = {
  data: T | null;
  error: Error | null;
  authEmail: string | null;
};

function authErrorMessage(error: unknown): string {
  return extractAuthErrorText(error);
}

export type SignInWithHubPasswordOptions = {
  /** Real auth emails from resolve-login — required for username/phone (no @infix1 invent). */
  extraAuthEmails?: string[];
  /** Same-origin resolve-login API when extraAuthEmails omitted for User ID sign-in. */
  resolveLoginApiUrl?: string;
  /** Caller already ran resolve-login (dual sign-in) — skip a second 12s fetch. */
  resolveLookup?: HubResolveLoginLookup;
};

/** Try resolver emails then synthetic email fallbacks for username/email sign-in. */
export async function signInWithHubPassword<T extends { session: unknown | null }>(
  loginInput: string,
  attempt: (authEmail: string) => Promise<{ data: T; error: unknown | null }>,
  mode: "signin" | "signup" = "signin",
  options: SignInWithHubPasswordOptions = {},
): Promise<HubPasswordAuthResult<T>> {
  const login = sanitizeHubLoginInput(loginInput);
  const classified = classifyHubLoginIdentifier(login);
  if (classified.kind === "empty") {
    return {
      data: null,
      error: new Error("Enter your username, email, or phone"),
      authEmail: null,
    };
  }
  if (classified.kind === "invalid") {
    return {
      data: null,
      error: new Error(HUB_INVALID_USERNAME_MESSAGE),
      authEmail: null,
    };
  }
  if (mode === "signup" && classified.kind === "phone") {
    return {
      data: null,
      error: new Error("Use username or email to create an account — phone is sign-in only."),
      authEmail: null,
    };
  }

  let extraEmails = (options.extraAuthEmails ?? [])
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  let resolveLookupUsed = false;
  let resolveLookup: HubResolveLoginLookup = "skipped";
  const needsResolve =
    mode === "signin" &&
    !extraEmails.length &&
    (classified.kind === "username" || classified.kind === "phone");
  if (needsResolve && options.resolveLookup && options.resolveLookup !== "skipped") {
    resolveLookupUsed = true;
    resolveLookup = options.resolveLookup;
  } else if (needsResolve) {
    resolveLookupUsed = true;
    const resolved = await resolveHubLoginEmails(login, {
      resolveLoginApiUrl: options.resolveLoginApiUrl,
    });
    extraEmails = resolved.emails;
    resolveLookup = resolved.lookup;
  } else if (mode === "signin" && extraEmails.length > 0) {
    // Dual first hop already mapped User ID → auth emails — keep wrong-password copy.
    resolveLookupUsed = true;
    resolveLookup =
      options.resolveLookup && options.resolveLookup !== "skipped" ? options.resolveLookup : "ok";
  }
  // Resolve-login already mapped username/phone → real auth.users email(s).
  // Do not also hammer synthetic @infix1 / legacy fallbacks — each GoTrue attempt
  // costs ~5–8s and turns a wrong password into a long "Please wait…" hang.
  const baseEmails =
    extraEmails.length > 0
      ? []
      : classified.kind === "phone"
        ? []
        : mode === "signup"
          ? signupAuthEmails(login, classified.loginId, classified.kind)
          : hubAuthEmailsForSignIn(login);
  const authEmails = [...new Set([...extraEmails, ...baseEmails])];
  if (!authEmails.length) {
    if (classified.kind === "phone") {
      if (resolveLookup === "unavailable") {
        return {
          data: null,
          error: new Error(HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE),
          authEmail: null,
        };
      }
      return { data: null, error: new Error(HUB_UNKNOWN_PHONE_MESSAGE), authEmail: null };
    }
    if (classified.kind === "username" && resolveLookupUsed) {
      if (resolveLookup === "unavailable") {
        return {
          data: null,
          error: new Error(HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE),
          authEmail: null,
        };
      }
      return { data: null, error: new Error(HUB_UNKNOWN_USER_ID_MESSAGE), authEmail: null };
    }
    return {
      data: null,
      error: new Error("Enter your username, email, or phone"),
      authEmail: null,
    };
  }

  let lastError: Error | null = null;
  for (let i = 0; i < authEmails.length; i += 1) {
    const authEmail = authEmails[i];
    const result = await attempt(authEmail);
    if (!result.error && result.data.session) {
      return { data: result.data, error: null, authEmail };
    }
    const message = authErrorMessage(result.error) || fallbackAuthErrorText(result.error, mode);
    lastError = result.error instanceof Error && extractAuthErrorText(result.error) ? result.error : new Error(message);
    if (mode === "signup" || !message || !HUB_INVALID_LOGIN.test(message)) {
      break;
    }
  }

  if (
    mode === "signin" &&
    resolveLookupUsed &&
    lastError &&
    HUB_INVALID_LOGIN.test(lastError.message)
  ) {
    if (resolveLookup === "unavailable") {
      return {
        data: null,
        error: new Error(HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE),
        authEmail: authEmails[0] ?? null,
      };
    }
    if (extraEmails.length === 0) {
      if (classified.kind === "phone") {
        return {
          data: null,
          error: new Error(HUB_UNKNOWN_PHONE_MESSAGE),
          authEmail: authEmails[0] ?? null,
        };
      }
      if (classified.kind === "username") {
        return {
          data: null,
          error: new Error(HUB_UNKNOWN_USER_ID_MESSAGE),
          authEmail: authEmails[0] ?? null,
        };
      }
    }
    if (classified.kind === "phone" && extraEmails.length > 0) {
      return {
        data: null,
        error: new Error(HUB_PHONE_WRONG_PASSWORD_MESSAGE),
        authEmail: authEmails[0] ?? null,
      };
    }
    if (classified.kind === "username" && extraEmails.length > 0) {
      return {
        data: null,
        error: new Error(HUB_USERNAME_WRONG_PASSWORD_MESSAGE),
        authEmail: authEmails[0] ?? null,
      };
    }
  }

  return { data: null, error: lastError, authEmail: authEmails[0] ?? null };
}
