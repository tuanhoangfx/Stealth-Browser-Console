import { hubResolveLoginApiUrl } from "./hub-api-routes";
import {
  classifyHubLoginIdentifier,
  looksLikeEmail,
  sanitizeHubLoginInput,
  type HubLoginIdentifierKind,
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

const resolveLoginInflight = new Map<string, Promise<HubResolveLoginResult>>();

function resolveLoginCacheKey(
  identifierKind: HubLoginIdentifierKind,
  loginId: string,
  resolveLoginApiUrl?: string,
): string {
  return `${identifierKind}|${loginId}|${String(resolveLoginApiUrl ?? "").trim()}`;
}

export function clearHubResolveLoginPrefetch(): void {
  resolveLoginInflight.clear();
}

async function fetchHubResolveLogin(
  loginId: string,
  identifierKind: "username" | "phone",
  options: FetchResolvedHubAuthEmailsOptions = {},
): Promise<HubResolveLoginResult> {
  const apiUrl = hubResolveLoginApiUrl(options.resolveLoginApiUrl);
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, identifierKind }),
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

/** Map User ID / phone → real auth.users email via Hub profiles (server-side API). */
export async function resolveHubLoginEmails(
  loginInput: string,
  options: FetchResolvedHubAuthEmailsOptions = {},
): Promise<HubResolveLoginResult> {
  const login = sanitizeHubLoginInput(loginInput);
  if (!login || looksLikeEmail(login)) return { emails: [], lookup: "skipped" };
  const classified = classifyHubLoginIdentifier(login);
  if (classified.kind !== "username" && classified.kind !== "phone") {
    return { emails: [], lookup: "skipped" };
  }
  const loginId =
    classified.kind === "phone" ? classified.phoneNormalized : classified.loginId;
  if (!loginId) return { emails: [], lookup: "skipped" };

  const key = resolveLoginCacheKey(classified.kind, loginId, options.resolveLoginApiUrl);
  const hit = resolveLoginInflight.get(key);
  if (hit) return hit;

  const pending = fetchHubResolveLogin(loginId, classified.kind, options);
  resolveLoginInflight.set(key, pending);
  try {
    return await pending;
  } catch (err) {
    resolveLoginInflight.delete(key);
    throw err;
  }
}

/** Debounced typeahead from HubAuthGateModal — same inflight cache as sign-in. */
export function prefetchHubResolveLogin(
  loginInput: string,
  options: FetchResolvedHubAuthEmailsOptions = {},
): Promise<HubResolveLoginResult> {
  return resolveHubLoginEmails(loginInput, options);
}

/** @deprecated Prefer resolveHubLoginEmails for lookup status. */
export async function fetchResolvedHubAuthEmails(
  loginInput: string,
  options: FetchResolvedHubAuthEmailsOptions = {},
): Promise<string[]> {
  const result = await resolveHubLoginEmails(loginInput, options);
  return result.emails;
}
