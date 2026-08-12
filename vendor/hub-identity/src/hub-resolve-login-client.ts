import { hubResolveLoginApiUrl } from "./hub-api-routes";
import { canonicalLoginId, looksLikeEmail, sanitizeHubLoginInput } from "./hub-login";

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

/** Map User ID → real auth.users email via Hub profiles (server-side API). */
export async function resolveHubLoginEmails(
  loginInput: string,
  options: FetchResolvedHubAuthEmailsOptions = {},
): Promise<HubResolveLoginResult> {
  const login = sanitizeHubLoginInput(loginInput);
  if (!login || looksLikeEmail(login)) return { emails: [], lookup: "skipped" };
  const loginId = canonicalLoginId(login);
  if (!loginId) return { emails: [], lookup: "skipped" };

  const apiUrl = hubResolveLoginApiUrl(options.resolveLoginApiUrl);
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId }),
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
