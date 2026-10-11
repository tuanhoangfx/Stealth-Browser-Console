/** Synced from packages/hub-identity/hub-resolve-login-client - E0001 browser module. */

import { classifyHubLoginIdentifier, sanitizeHubLoginInput } from "./hub-login.js";

/** CF Worker gateway - extensions have no same-origin /api. */
export const HUB_RESOLVE_LOGIN_API_URL = "https://api.infi.io.vn/hub/auth/resolve-login";

const RESOLVE_TIMEOUT_MS = 8000;
const RESOLVE_CACHE_TTL_MS = 10 * 60 * 1000;
const RESOLVE_CACHE_KEY_PREFIX = "e0001:hub-resolve-login:";

function resolveCacheKey(identifierKind, loginId) {
  return `${RESOLVE_CACHE_KEY_PREFIX}${identifierKind}:${String(loginId).toLowerCase()}`;
}

async function readCachedResolveResult(cacheKey) {
  if (!globalThis.chrome?.storage?.session) return null;
  try {
    const stored = await chrome.storage.session.get(cacheKey);
    const cached = stored?.[cacheKey];
    if (!cached || Date.now() - Number(cached.cachedAt) >= RESOLVE_CACHE_TTL_MS) {
      if (cached) await chrome.storage.session.remove(cacheKey);
      return null;
    }
    if (!Array.isArray(cached.emails) || !["ok", "not_found"].includes(cached.lookup)) {
      return null;
    }
    return { emails: cached.emails, lookup: cached.lookup, cached: true };
  } catch {
    return null;
  }
}

async function cacheResolveResult(cacheKey, result) {
  if (!globalThis.chrome?.storage?.session || !["ok", "not_found"].includes(result.lookup)) return;
  try {
    await chrome.storage.session.set({
      [cacheKey]: { emails: result.emails, lookup: result.lookup, cachedAt: Date.now() },
    });
  } catch {
    // Session storage is an optimization only; authentication must still proceed.
  }
}

/**
 * Map username or registered phone -> real auth.users email via Hub gateway.
 * Email input skips (client already has the auth email).
 */
export async function resolveHubLoginEmails(loginInput, options = {}) {
  const classified = classifyHubLoginIdentifier(sanitizeHubLoginInput(loginInput));
  if (classified.kind !== "username" && classified.kind !== "phone") {
    return { emails: [], lookup: "skipped" };
  }
  const loginId = classified.kind === "phone" ? classified.phoneNormalized : classified.loginId;
  if (!loginId) return { emails: [], lookup: "skipped" };

  const apiUrl = options.resolveLoginApiUrl || HUB_RESOLVE_LOGIN_API_URL;
  const cacheKey = resolveCacheKey(classified.kind, loginId);
  const cached = await readCachedResolveResult(cacheKey);
  if (cached) return cached;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs ?? RESOLVE_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, identifierKind: classified.kind }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { emails: [], lookup: "unavailable", httpStatus: res.status };
    const payload = await res.json().catch(() => null);
    const emails = (Array.isArray(payload?.authEmails) ? payload.authEmails : [])
      .map((email) => String(email ?? "").trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5);
    const result = { emails, lookup: emails.length ? "ok" : "not_found" };
    await cacheResolveResult(cacheKey, result);
    return result;
  } catch {
    return { emails: [], lookup: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
