/** Empty JSON / Object.prototype leftovers must never reach the auth gate. */
const EMPTY_AUTH_ERROR_TEXT = /^(?:\{\}|\[\]|\[object Object\])$/i;

export const HUB_SIGNUP_FAILED_MESSAGE =
  "Sign-up failed. Try a different User ID, or Sign In if this account already exists.";

export const HUB_SIGNIN_FAILED_MESSAGE = "Sign-in failed. Please try again.";

export const HUB_SIGNUP_ALREADY_REGISTERED_MESSAGE =
  "This User ID is already registered. Use Sign In.";

export function isEmptyAuthErrorText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^\d+$/.test(t)) return true;
  return EMPTY_AUTH_ERROR_TEXT.test(t);
}

/**
 * Pull a human string from GoTrue / supabase-js AuthError / empty JSON bodies.
 * `JSON.stringify({}) === "{}"` and `String({}) === "[object Object]"` both become "".
 */
export function extractAuthErrorText(raw: unknown, depth = 0): string {
  if (raw == null || typeof raw === "number" || typeof raw === "boolean") return "";
  if (typeof raw === "string") {
    const text = raw.trim();
    return isEmptyAuthErrorText(text) ? "" : text;
  }
  if (depth > 2) return "";
  if (raw instanceof Error) {
    const fromMessage = extractAuthErrorText(raw.message, depth + 1);
    if (fromMessage) return fromMessage;
    return extractAuthErrorText(
      {
        error_description: (raw as { error_description?: unknown }).error_description,
        msg: (raw as { msg?: unknown }).msg,
        error: (raw as { error?: unknown }).error,
      },
      depth + 1,
    );
  }
  if (typeof raw !== "object") return "";
  const rec = raw as Record<string, unknown>;
  for (const key of ["error_description", "msg", "message", "error"] as const) {
    const value = rec[key];
    if (value == null || value === raw) continue;
    const nested = extractAuthErrorText(value, depth + 1);
    if (nested) return nested;
  }
  return "";
}

export function fallbackAuthErrorText(
  raw: unknown,
  intent: "signin" | "signup" = "signin",
): string {
  return extractAuthErrorText(raw) || (intent === "signup" ? HUB_SIGNUP_FAILED_MESSAGE : HUB_SIGNIN_FAILED_MESSAGE);
}
