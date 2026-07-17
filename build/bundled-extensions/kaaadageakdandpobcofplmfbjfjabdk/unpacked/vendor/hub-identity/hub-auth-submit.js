/** Synced from packages/hub-identity — browser ES module for E0001. */

import { hubAuthEmailsForSignIn, sanitizeHubLoginInput } from "./hub-login.js";

export const HUB_INVALID_LOGIN = /invalid login credentials/i;

function authErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message ?? "");
  }
  return String(error ?? "");
}

/** Try canonical then legacy synthetic email for User ID sign-in. */
export async function signInWithHubPassword(loginInput, attempt, mode = "signin") {
  const authEmails = hubAuthEmailsForSignIn(sanitizeHubLoginInput(loginInput));
  if (!authEmails.length) {
    return { data: null, error: new Error("Enter your user ID or email"), authEmail: null };
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
    if (mode === "signup" || !message || !HUB_INVALID_LOGIN.test(message)) {
      break;
    }
  }

  return { data: null, error: lastError, authEmail: authEmails[0] ?? null };
}
