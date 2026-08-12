import { canonicalLoginId, hubAuthEmailsForSignIn, looksLikeEmail, sanitizeHubLoginInput } from "./hub-login";
import {
  type HubResolveLoginLookup,
  resolveHubLoginEmails,
} from "./hub-resolve-login-client";

export const HUB_INVALID_LOGIN = /invalid login credentials/i;

/** Returned when resolve-login finds no profile for a User ID (not wrong password). */
export const HUB_UNKNOWN_USER_ID_MESSAGE =
  "User ID not found — check spelling or sign in with your email.";

/** Returned when resolve-login API is unreachable or returns a non-OK response. */
export const HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE =
  "Sign-in service unavailable. Try again in a moment or sign in with your email.";

export type HubPasswordAuthResult<T> = {
  data: T | null;
  error: Error | null;
  authEmail: string | null;
};

function authErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message ?? "");
  }
  return String(error ?? "");
}

export type SignInWithHubPasswordOptions = {
  /** Real auth emails from profiles.login_id lookup — tried before synthetic @infix1.io.vn. */
  extraAuthEmails?: string[];
  /** Same-origin resolve-login API when extraAuthEmails omitted for User ID sign-in. */
  resolveLoginApiUrl?: string;
};

/** Try canonical then legacy synthetic email for User ID sign-in. */
export async function signInWithHubPassword<T extends { session: unknown | null }>(
  loginInput: string,
  attempt: (authEmail: string) => Promise<{ data: T; error: unknown | null }>,
  mode: "signin" | "signup" = "signin",
  options: SignInWithHubPasswordOptions = {},
): Promise<HubPasswordAuthResult<T>> {
  const login = sanitizeHubLoginInput(loginInput);
  let extraEmails = (options.extraAuthEmails ?? [])
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  let resolveLookupUsed = false;
  let resolveLookup: HubResolveLoginLookup = "skipped";
  if (mode === "signin" && !looksLikeEmail(login) && !extraEmails.length) {
    resolveLookupUsed = true;
    const resolved = await resolveHubLoginEmails(login, {
      resolveLoginApiUrl: options.resolveLoginApiUrl,
    });
    extraEmails = resolved.emails;
    resolveLookup = resolved.lookup;
  }
  const baseEmails = hubAuthEmailsForSignIn(login);
  const authEmails = [...new Set([...extraEmails, ...baseEmails])];
  if (!authEmails.length) {
    return { data: null, error: new Error("Enter your user ID or email"), authEmail: null };
  }

  let lastError: Error | null = null;
  for (let i = 0; i < authEmails.length; i += 1) {
    const authEmail = authEmails[i];
    const result = await attempt(authEmail);
    if (!result.error && result.data.session) {
      return { data: result.data, error: null, authEmail };
    }
    const message = authErrorMessage(result.error);
    lastError = result.error instanceof Error ? result.error : new Error(message);
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
    if (extraEmails.length === 0 && canonicalLoginId(login)) {
      return { data: null, error: new Error(HUB_UNKNOWN_USER_ID_MESSAGE), authEmail: authEmails[0] ?? null };
    }
  }

  return { data: null, error: lastError, authEmail: authEmails[0] ?? null };
}
