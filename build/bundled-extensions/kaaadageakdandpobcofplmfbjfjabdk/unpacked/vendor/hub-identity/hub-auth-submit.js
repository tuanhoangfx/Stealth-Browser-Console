/** Synced from packages/hub-identity - browser ES module for E0001. */

import {
  classifyHubLoginIdentifier,
  hubAuthEmailFromLoginOrEmail,
  hubAuthEmailsForSignIn,
  sanitizeHubLoginInput,
} from "./hub-login.js";
import { resolveHubLoginEmails } from "./hub-resolve-login.js";

export const HUB_INVALID_LOGIN = /invalid login credentials/i;

export const HUB_UNKNOWN_USER_ID_MESSAGE =
  "Username not found - check spelling or sign in with your email.";

export const HUB_UNKNOWN_PHONE_MESSAGE =
  "Phone number not found - check the number or sign in with username/email.";

export const HUB_PHONE_WRONG_PASSWORD_MESSAGE =
  "Incorrect password for the account linked to this phone. Sign in with username/email if this number belongs to a different account.";

export const HUB_USERNAME_WRONG_PASSWORD_MESSAGE =
  "Incorrect password for this username. If you recently changed your Tool Hub password, use the new one.";

export const HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE =
  "Sign-in service unavailable. Try again in a moment or sign in with your email.";

export const HUB_INVALID_USERNAME_MESSAGE =
  "Invalid username (use 3–32 letters, numbers, . _ -)";

/** GoTrue needs an email for username Sign Up; rebound to `u_<uuid>@auth.infi.internal` after create. */
function signupAuthEmails(login, loginId, kind) {
  if (kind === "email") return hubAuthEmailsForSignIn(login);
  if (kind === "username" && loginId) {
    const resolved = hubAuthEmailFromLoginOrEmail({ loginId });
    if ("error" in resolved) return [];
    return [resolved.authEmail];
  }
  return [];
}

function authErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message ?? "");
  }
  return String(error ?? "");
}

/**
 * Try resolver emails then synthetic fallbacks for username/email/phone sign-in.
 * @param {object} options extraAuthEmails / resolveLookup (pre-resolved by caller) / resolveLoginApiUrl
 */
export async function signInWithHubPassword(loginInput, attempt, mode = "signin", options = {}) {
  const login = sanitizeHubLoginInput(loginInput);
  const classified = classifyHubLoginIdentifier(login);
  if (classified.kind === "empty") {
    return { data: null, error: new Error("Enter your username, email, or phone"), authEmail: null };
  }
  if (classified.kind === "invalid") {
    return { data: null, error: new Error(HUB_INVALID_USERNAME_MESSAGE), authEmail: null };
  }
  if (mode === "signup" && classified.kind === "phone") {
    return {
      data: null,
      error: new Error("Use username or email to create an account - phone is sign-in only."),
      authEmail: null,
    };
  }

  let extraEmails = (options.extraAuthEmails ?? [])
    .map((email) => String(email ?? "").trim().toLowerCase())
    .filter(Boolean);
  // Caller may pre-resolve once and share across auth planes.
  let resolveLookup = options.resolveLookup ?? "skipped";
  let resolveLookupUsed = resolveLookup !== "skipped";

  const needsResolve =
    mode === "signin" &&
    !extraEmails.length &&
    !resolveLookupUsed &&
    (classified.kind === "username" || classified.kind === "phone");
  if (needsResolve) {
    resolveLookupUsed = true;
    const resolved = await resolveHubLoginEmails(login, {
      resolveLoginApiUrl: options.resolveLoginApiUrl,
    });
    extraEmails = resolved.emails;
    resolveLookup = resolved.lookup;
  }

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
        return { data: null, error: new Error(HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE), authEmail: null };
      }
      return { data: null, error: new Error(HUB_UNKNOWN_PHONE_MESSAGE), authEmail: null };
    }
    return { data: null, error: new Error("Enter your username, email, or phone"), authEmail: null };
  }

  let lastError = null;
  for (let i = 0; i < authEmails.length; i += 1) {
    const authEmail = authEmails[i];
    const result = await attempt(authEmail);
    if (!result.error && result.data?.session) {
      return { data: result.data, error: null, authEmail };
    }
    const message = authErrorMessage(result.error);
    lastError = result.error instanceof Error ? result.error : new Error(message);
    if (mode === "signup" || !message || !HUB_INVALID_LOGIN.test(message)) break;
  }

  if (mode === "signin" && resolveLookupUsed && lastError && HUB_INVALID_LOGIN.test(lastError.message)) {
    if (resolveLookup === "unavailable") {
      return {
        data: null,
        error: new Error(HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE),
        authEmail: authEmails[0] ?? null,
      };
    }
    if (extraEmails.length === 0) {
      if (classified.kind === "phone") {
        return { data: null, error: new Error(HUB_UNKNOWN_PHONE_MESSAGE), authEmail: authEmails[0] ?? null };
      }
      if (classified.kind === "username") {
        return { data: null, error: new Error(HUB_UNKNOWN_USER_ID_MESSAGE), authEmail: authEmails[0] ?? null };
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
