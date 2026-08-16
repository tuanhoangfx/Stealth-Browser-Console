import { hubResolveLoginApiUrl } from "./hub-api-routes";
import {
  classifyHubLoginIdentifier,
  sanitizeHubLoginInput,
} from "./hub-login";

export type FetchResolvedHubAuthEmailsOptions = {
  /** Same-origin Tool Hub API — default `/api/hub/auth/resolve-login`. */
  resolveLoginApiUrl?: string;
};

export type HubResolveLoginLookup = "skipped" | "ok" | "not_found" | "unavailable";

export type HubResolveLoginResult = {
  emails: string[];
  lookup: HubResolveLoginLookup;
  httpStatus?: number;
};

/**
 * Map username or registered phone → real auth.users email via Hub gateway.
 * Email input skips (client already has the auth email).
 */
export async function resolveHubLoginEmails(
  loginInput: string,
  options: FetchResolvedHubAuthEmailsOptions = {},
): Promise<HubResolveLoginResult> {
  const classified = classifyHubLoginIdentifier(sanitizeHubLoginInput(loginInput));
  if (classified.kind !== "username" && classified.kind !== "phone") {
    return { emails: [], lookup: "skipped" };
  }
  const loginId =
    classified.kind === "phone" ? classified.phoneNormalized : classified.loginId;
  if (!loginId) return { emails: [], lookup: "skipped" };

  const apiUrl = hubResolveLoginApiUrl(options.resolveLoginApiUrl);
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginId,
        identifierKind: classified.kind,
      }),
    });
    if (!res.ok) {
      return { emails: [], lookup: "unavailable", httpStatus: res.status };
    }
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; authEmails?: string[] }
      | null;
    const emails = (Array.isArray(payload?.authEmails) ? payload.authEmails : [])
      .map((email) => String(email ?? "").trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5);
    return { emails, lookup: emails.length ? "ok" : "not_found" };
  } catch {
    return { emails: [], lookup: "unavailable" };
  }
}

/** @deprecated Prefer resolveHubLoginEmails for lookup status. */
export async function fetchResolvedHubAuthEmails(
  loginInput: string,
  options: FetchResolvedHubAuthEmailsOptions = {},
): Promise<string[]> {
  const result = await resolveHubLoginEmails(loginInput, options);
  return result.emails;
}
