/**
 * Shared E0001 Cookie Bridge Sync & Vault Engine Core (SSOT).
 *
 * Used by BOTH the MV3 Service Worker (`background.js`) and the Direct In-Popup Fallback
 * (`popup-direct-ops.js`) so multi-domain cookie collection, SPA auth storage capture,
 * session login guards (Google / Facebook / ElevenLabs), snapshot RPCs, and encrypted
 * vault uploads (`note_vault_upsert_v3`) share 100% identical logic.
 */
import {
  formatSyncError,
  isJwtExpired,
  parseApiErrorBody,
  parseJwtPayload,
  rpcHeaders,
  userHeaders,
} from "./auth-session.js";
import {
  bindingRouteKey,
  fetchExistingVaultCount,
  fetchExistingVaultSummary,
  normalizeRouteDomain,
  summarizeCookieNames,
  uploadVaultForBinding,
} from "./vault-api.js";
import { canUseVault } from "./vault-crypto.js";
import { isSchemaRelatedVaultError, probeCookieSchemaOk } from "./schema-probe.js";
import {
  effectiveCookieDomain,
  elevenLabsSessionUrl,
  evaluateOpenTabsSyncBlockForDomain,
  extraCookieQueryUrls,
  extractHostnameFromUrlOrDomain,
  googleMailInboxUrl,
  googleOsidPassiveLoginUrl,
  googleOsidSessionUrl,
  hasGoogleOsidCookieForDomain,
  isElevenLabsDomain,
  isFacebookDomain,
  isGoogleAuthContextUrl,
  isGoogleDomain,
  isGoogleMarketingUrl,
  isGoogleOsidAppDomain,
  isGoogleSignInPromptUrl,
  isSpaStorageAuthDomain,
  openSiteHintHost,
  relatedCookieDomains,
  resolveGoogleOsidApp,
  shouldForceNavigateElevenLabsTab,
  shouldForceNavigateGoogleOsidTab,
  shouldForceNavigateGoogleTab,
  siteUrlForDomain,
  summarizeGoogleCookieNames,
  tabMatchesRoute,
  urlMatchesCookieDomain,
} from "./domain-routes.js";
import {
  captureSiteAuthStorageForDomain,
  extractAuthStorageIdentity,
  hasElevenLabsAuthSession,
  hasNonEmptyAuthStorage,
  summarizeAuthStorageLines,
} from "./site-auth-storage.js";
import { routeSourceLockState } from "./route-access.js";

const STORAGE_BINDING_STATUS = "e0001-binding-status-v1";
export const GOOGLE_TAB_WAIT_MS = 6000;

export function maskValue(value) {
  if (!value || value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function toSnapshotLines(cookies, storage = null) {
  const cookieLines = cookies.map((c) => `${c.name} = ${maskValue(c.value)}`);
  const storageLines = summarizeAuthStorageLines(storage, maskValue);
  return [...storageLines, ...cookieLines];
}

export function jwtPayload(auth) {
  return parseJwtPayload(auth?.access_token) || {};
}

export function jwtEmailFromAuth(auth) {
  if (auth?.user_email) return String(auth.user_email);
  if (!auth?.access_token) return null;
  try {
    const payload = jwtPayload(auth);
    return payload.email ?? payload.user_metadata?.email ?? null;
  } catch {
    return null;
  }
}

export function authUserId(auth) {
  return auth?.user_id ?? auth?.user?.id ?? jwtPayload(auth).sub ?? null;
}

export function vaultUpdaterLabel(auth, browserId) {
  const email = jwtEmailFromAuth(auth);
  const short = String(browserId ?? "").slice(0, 8);
  return email ? `${email} · ${short}` : short || "unknown";
}

export function sourceLockStateForBinding(
  binding,
  browserId,
  auth = null,
  identity = null,
  overrideSourceId = null,
) {
  const dataUid = authUserId(auth);
  const identityUid = authUserId(identity) || auth?.hubIdentityUserId || null;
  return routeSourceLockState(
    binding,
    browserId,
    {
      userId: dataUid || identityUid || null,
      dataUserId: dataUid,
      hubIdentityUserId: identityUid,
      userEmail:
        jwtEmailFromAuth(auth) ||
        auth?.user_email ||
        jwtEmailFromAuth(identity) ||
        identity?.user_email ||
        null,
    },
    overrideSourceId,
  );
}

/** Read cookies for a single host scope — requires `<all_urls>` host permission in manifest. */
export async function collectCookiesForSingleScope(rawDomain) {
  const raw = effectiveCookieDomain(String(rawDomain ?? "").trim());
  if (!raw) return [];

  const base = raw.replace(/^\./, "").toLowerCase();
  const hostVariants = [raw, `.${base}`, base, `www.${base}`];

  const byKey = new Map();
  const add = (list) => {
    for (const c of list ?? []) {
      byKey.set(`${c.name}\0${c.domain}\0${c.path}`, c);
    }
  };

  for (const host of hostVariants) {
    try {
      add(await chrome.cookies.getAll({ domain: host }));
      if (!host.startsWith(".")) {
        add(await chrome.cookies.getAll({ domain: `.${host.replace(/^\./, "")}` }));
      }
    } catch {
      /* ignore host variant query error */
    }
  }

  const urlVariants = [
    `https://${base}/`,
    `https://www.${base}/`,
    `https://m.${base}/`,
    ...extraCookieQueryUrls(base),
  ];
  for (const url of urlVariants) {
    try {
      add(await chrome.cookies.getAll({ url }));
    } catch {
      /* ignore url variant query error */
    }
  }

  try {
    const all = await chrome.cookies.getAll({});
    for (const c of all) {
      const cd = (c.domain ?? "").replace(/^\./, "").toLowerCase();
      if (cd === base || cd.endsWith(`.${base}`) || base.endsWith(`.${cd}`)) {
        byKey.set(`${c.name}\0${c.domain}\0${c.path}`, c);
      }
    }
  } catch {
    /* ignore global jar fallback error */
  }

  return [...byKey.values()];
}

/** Jar for a route — unions related SSO hosts (e.g. `.claude.com` ↔ `.claude.ai` ↔ `.anthropic.com`). */
export async function getCookiesForDomain(domain) {
  const scopes = relatedCookieDomains(domain);
  if (!scopes.length) return collectCookiesForSingleScope(domain);

  const byKey = new Map();
  for (const scope of scopes) {
    for (const c of await collectCookiesForSingleScope(scope)) {
      byKey.set(`${c.name}\0${c.domain}\0${c.path}`, c);
    }
  }
  return [...byKey.values()];
}

export async function removeSingleCookieEverywhere(cookie, fallbackDomain = "") {
  const host = (cookie.domain ?? fallbackDomain).replace(/^\./, "") || openSiteHintHost(fallbackDomain);
  if (!host) return false;
  const cookiePath = cookie.path?.startsWith("/") ? cookie.path : `/${cookie.path ?? ""}`;
  const schemes = cookie.secure ? ["https", "http"] : ["http", "https"];
  const partitionOpt = cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {};

  for (const scheme of schemes) {
    const url = `${scheme}://${host}${cookiePath}`;
    try {
      const res = await chrome.cookies.remove({
        url,
        name: cookie.name,
        storeId: cookie.storeId,
        ...partitionOpt,
      });
      if (res) return true;
    } catch {
      if (cookie.partitionKey) {
        try {
          const fallbackRes = await chrome.cookies.remove({
            url,
            name: cookie.name,
            storeId: cookie.storeId,
          });
          if (fallbackRes) return true;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return false;
}

export async function clearCookiesForDomain(domain = "") {
  const cookies = await getCookiesForDomain(domain);
  let removed = 0;
  for (const cookie of cookies) {
    if (await removeSingleCookieEverywhere(cookie, domain)) {
      removed += 1;
    }
  }
  return { ok: true, removed, domain };
}

/**
 * Remove only host-scoped cookies on an OSID app's own sub-origin (e.g. `flow.google.com`)
 * without touching shared `.google.com` or `accounts.google.com` cookies.
 */
export async function clearOsidAppHostCookies(domain = "") {
  const osidApp = resolveGoogleOsidApp(domain);
  if (!osidApp?.osidHosts?.length) return { ok: true, removed: 0, domain };
  const hostSet = new Set(osidApp.osidHosts.map((h) => String(h).replace(/^\./, "").toLowerCase()));
  const byKey = new Map();
  for (const host of hostSet) {
    for (const c of await collectCookiesForSingleScope(host)) {
      const cd = (c.domain ?? "").replace(/^\./, "").toLowerCase();
      if (hostSet.has(cd)) {
        byKey.set(`${c.name}\0${c.domain}\0${c.path}`, c);
      }
    }
  }
  let removed = 0;
  for (const cookie of byKey.values()) {
    if (await removeSingleCookieEverywhere(cookie, domain)) {
      removed += 1;
    }
  }
  return { ok: true, removed, domain };
}

export async function waitForTabComplete(tabId, timeoutMs = 12000) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
  } catch {
    return;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  await new Promise((r) => setTimeout(r, 350));
}

export function domainNeedsForceNavigate(url, domain, forceNavigate) {
  if (forceNavigate) return true;
  return (
    shouldForceNavigateGoogleOsidTab(url, domain) ||
    shouldForceNavigateGoogleTab(url, domain) ||
    shouldForceNavigateElevenLabsTab(url, domain)
  );
}

/** Open/navigate the site before applying cookies; Chrome rejects some writes without context. */
export async function ensureSiteTabForDomain(domain, opts = {}) {
  const activate = opts.activate !== false;
  const forceNavigate = opts.forceNavigate === true;
  const waitMs = Math.max(0, Number(opts.waitMs) || 350);
  const createdDelayMs = Math.max(0, Number(opts.createdDelayMs) || waitMs);
  const tabWaitMs = Math.max(0, Number(opts.tabWaitMs) || 12000);
  let open = null;
  if (opts.preferredTabId) {
    try {
      open = await chrome.tabs.get(opts.preferredTabId);
    } catch {
      open = null;
    }
  }
  if (!open) {
    const tabs = await chrome.tabs.query({});
    const matching = tabs.filter(
      (t) => t.url && (tabMatchesRoute(t.url, domain) || urlMatchesCookieDomain(t.url, domain)),
    );
    open = matching.find((t) => t.active) ?? matching[0] ?? null;
  }
  const openOsidApp =
    !resolveGoogleOsidApp(domain) && open?.url ? resolveGoogleOsidApp(open.url) : null;
  const effectiveTargetDomain = openOsidApp ? openOsidApp.canonicalDomain : domain;
  const targetUrl =
    opts.targetUrl || (openOsidApp ? openOsidApp.sessionUrl : siteUrlForDomain(domain));
  const mustNavigate = open?.url
    ? domainNeedsForceNavigate(open.url, effectiveTargetDomain, forceNavigate)
    : true;
  if (open?.id) {
    if (mustNavigate) {
      await chrome.tabs.update(open.id, { url: targetUrl, active: activate });
      await waitForTabComplete(open.id, tabWaitMs);
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    } else if (activate) {
      await chrome.tabs.update(open.id, { active: true });
    }
    return { tabId: open.id, created: false, navigated: mustNavigate };
  }
  const tab = await chrome.tabs.create({ url: targetUrl, active: activate });
  await waitForTabComplete(tab.id, tabWaitMs);
  if (createdDelayMs > 0) await new Promise((r) => setTimeout(r, createdDelayMs));
  return { tabId: tab.id, created: true, navigated: true };
}

/**
 * Park open Google / Google OSID tabs on `about:blank` right before clearing & writing vault cookies
 * so background Google XHRs (`RotateCookies` / `CheckCookie`) cannot race or overwrite the incoming session.
 */
export async function parkGoogleTabsBeforeCookieSwap(domain) {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const explicitOsidApp = resolveGoogleOsidApp(domain);
  const targets = tabs.filter((t) => {
    if (!t?.id || !t?.url || !/^https?:\/\//i.test(t.url)) return false;
    if (explicitOsidApp) {
      const tabOsid = resolveGoogleOsidApp(t.url);
      if (tabOsid?.id === explicitOsidApp.id) return true;
      try {
        return new URL(t.url).hostname.toLowerCase() === "accounts.google.com";
      } catch {
        return false;
      }
    }
    return urlMatchesCookieDomain(t.url, domain);
  });
  if (!targets.length) return { parkedTabIds: [], preferredTabId: null };
  const preferred = targets.find((t) => t.active) ?? targets[0];
  const parkedTabIds = [];
  for (const tab of targets) {
    try {
      await chrome.tabs.update(tab.id, { url: "about:blank" });
      parkedTabIds.push(tab.id);
    } catch {
      /* ignore closed tab */
    }
  }
  if (parkedTabIds.length) {
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    parkedTabIds,
    preferredTabId: preferred?.id ?? parkedTabIds[0] ?? null,
  };
}

/** Reload open tabs for domain (no new tab). Google: navigate to inbox or Google AI workspace; ElevenLabs: navigate sign-in/landing to `/app`. */
export async function refreshTabsForDomain(domain, opts = {}) {
  const tabs = await chrome.tabs.query({});
  let refreshed = 0;
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !urlMatchesCookieDomain(tab.url, domain)) continue;
    const osidApp = resolveGoogleOsidApp(domain) || resolveGoogleOsidApp(tab.url);
    if (osidApp) {
      const hasOsid = opts.hasOsid ?? opts.hasFlowOsid;
      const appUrl =
        hasOsid === false
          ? googleOsidPassiveLoginUrl(osidApp.canonicalDomain)
          : googleOsidSessionUrl(osidApp.canonicalDomain);
      if (shouldForceNavigateGoogleOsidTab(tab.url, osidApp.canonicalDomain) || hasOsid === false) {
        await chrome.tabs.update(tab.id, { url: appUrl });
      } else {
        await chrome.tabs.reload(tab.id);
      }
      await waitForTabComplete(tab.id);
      refreshed += 1;
      continue;
    }
    if (isGoogleDomain(domain) && shouldForceNavigateGoogleTab(tab.url, domain)) {
      await chrome.tabs.update(tab.id, { url: googleMailInboxUrl() });
      await waitForTabComplete(tab.id);
      refreshed += 1;
      continue;
    }
    if (isElevenLabsDomain(domain) && shouldForceNavigateElevenLabsTab(tab.url, domain)) {
      await chrome.tabs.update(tab.id, { url: elevenLabsSessionUrl() });
      await waitForTabComplete(tab.id);
      refreshed += 1;
      continue;
    }
    await chrome.tabs.reload(tab.id);
    await waitForTabComplete(tab.id);
    refreshed += 1;
  }
  return refreshed;
}

async function waitForGoogleTabSettle(tabId, maxSettleMs = 2400) {
  const stepMs = 400;
  const deadline = Date.now() + maxSettleMs;
  let lastUrl = "";
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(tabId);
      lastUrl = tab.url ?? "";
      if (isGoogleMarketingUrl(lastUrl) || isGoogleSignInPromptUrl(lastUrl)) {
        return lastUrl;
      }
    } catch {
      return "";
    }
    await new Promise((r) => setTimeout(r, stepMs));
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.url ?? lastUrl;
  } catch {
    return lastUrl;
  }
}

export async function confirmGoogleInboxTab(domain, opts = {}) {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const explicitOsidApp = resolveGoogleOsidApp(domain);
  const openTabOsidApp =
    explicitOsidApp ||
    tabs.map((t) => (t?.url ? resolveGoogleOsidApp(t.url) : null)).find(Boolean) ||
    null;
  let hasOsid = false;
  let targetUrl = undefined;
  if (openTabOsidApp) {
    const jarCookies = await getCookiesForDomain(openTabOsidApp.canonicalDomain).catch(() => []);
    hasOsid = Boolean(
      opts.hasOsid ??
        opts.hasFlowOsid ??
        hasGoogleOsidCookieForDomain(jarCookies, openTabOsidApp.canonicalDomain),
    );
    targetUrl = hasOsid
      ? googleOsidSessionUrl(openTabOsidApp.canonicalDomain)
      : googleOsidPassiveLoginUrl(openTabOsidApp.canonicalDomain);
  }
  const effectiveDomain = openTabOsidApp ? openTabOsidApp.canonicalDomain : domain;
  const ensured = await ensureSiteTabForDomain(effectiveDomain, {
    activate: opts.activate !== false,
    forceNavigate: true,
    preferredTabId: opts.preferredTabId ?? null,
    targetUrl,
    waitMs: 0,
    createdDelayMs: 0,
    tabWaitMs: GOOGLE_TAB_WAIT_MS,
  });
  if (!ensured.tabId) return { ok: false, tabId: null, reason: "no_tab" };

  let tabUrl = await waitForGoogleTabSettle(ensured.tabId, openTabOsidApp ? 2400 : 1000);
  if (!tabUrl) {
    return { ok: false, tabId: ensured.tabId, reason: "tab_gone" };
  }

  // If vault had a stale/rotated OSID cookie on an OSID app (`flow.google.com`), retry once via passive ServiceLogin to mint a fresh OSID from `.google.com` + `LSID`.
  if (openTabOsidApp && hasOsid && isGoogleMarketingUrl(tabUrl)) {
    const passiveUrl = googleOsidPassiveLoginUrl(openTabOsidApp.canonicalDomain);
    try {
      await chrome.tabs.update(ensured.tabId, {
        url: passiveUrl,
        active: opts.activate !== false,
      });
      await waitForTabComplete(ensured.tabId, GOOGLE_TAB_WAIT_MS);
      tabUrl = await waitForGoogleTabSettle(ensured.tabId, 2400);
    } catch {
      return { ok: false, tabId: ensured.tabId, reason: "tab_gone" };
    }
  }

  if (isGoogleSignInPromptUrl(tabUrl)) {
    return { ok: false, tabId: ensured.tabId, reason: "google_session_revoked", url: tabUrl };
  }
  if (isGoogleMarketingUrl(tabUrl)) {
    return { ok: false, tabId: ensured.tabId, reason: "marketing_redirect", url: tabUrl };
  }
  if (!isGoogleAuthContextUrl(tabUrl)) {
    return { ok: false, tabId: ensured.tabId, reason: "unexpected_url", url: tabUrl };
  }
  return { ok: true, tabId: ensured.tabId, url: tabUrl };
}

export function isMissingRpcError(msg) {
  const s = String(msg);
  return (
    s.includes("note_sync_cookies") ||
    s.includes("42883") ||
    s.includes("PGRST202") ||
    s.includes("does not exist")
  );
}

export function isJwtPatchable(auth) {
  return Boolean(auth?.access_token && !isJwtExpired(auth));
}

export async function patchNote(auth, noteId, payload) {
  const base = String(auth.supabase_url).replace(/\/$/, "");
  const url = `${base}/rest/v1/notes?id=eq.${noteId}`;
  if (!isJwtPatchable(auth)) {
    throw new Error("Session expired — open Cookie sync in Tool and click Link extension again.");
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers: userHeaders(auth, {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatSyncError(`Patch ${noteId} ${res.status}: ${parseApiErrorBody(text)}`));
  }
}

export async function rpcSyncCookies(auth, { syncId, pass, domain }, cookies, lines, opts = {}) {
  const base = String(auth.supabase_url).replace(/\/$/, "");
  const res = await fetch(`${base}/rest/v1/rpc/note_sync_cookies`, {
    method: "POST",
    headers: rpcHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      p_sync_id: syncId,
      p_pass: pass || null,
      p_snapshot: lines,
      p_domain: domain,
      p_touch_synced_at: opts.manual === true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC ${syncId} ${res.status}: ${parseApiErrorBody(text)}`);
  }
  return { lines: lines.length, cookies: cookies.length };
}

export async function rpcSyncCookiesByNoteId(
  auth,
  { noteId, pass, domain },
  cookies,
  lines,
  opts = {},
) {
  const base = String(auth.supabase_url).replace(/\/$/, "");
  const res = await fetch(`${base}/rest/v1/rpc/note_sync_cookies_by_note_id`, {
    method: "POST",
    headers: rpcHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      p_note_id: noteId,
      p_pass: pass || null,
      p_snapshot: lines,
      p_domain: domain,
      p_touch_synced_at: opts.manual === true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC note ${noteId} ${res.status}: ${parseApiErrorBody(text)}`);
  }
  return { lines: lines.length, cookies: cookies.length };
}

/** RPC by note UUID, else `sync_id`; fallback JWT PATCH only when RPC missing + fresh session. */
export async function rpcSyncBinding(auth, binding, preloadedCookies = null, opts = {}) {
  const domain = binding.domain?.trim();
  const noteId = binding.noteId?.trim();
  const syncId = binding.syncId?.trim();
  const manual = opts.manual === true;
  const cookies = preloadedCookies ?? (await getCookiesForDomain(domain));
  const lines = toSnapshotLines(cookies, opts.storage ?? null);
  const payload = {
    cookie_snapshot: lines,
    sync_status: lines.length ? "synced" : "pending",
    domain,
    ...(manual ? { synced_at: new Date().toISOString() } : {}),
  };

  if (noteId) {
    try {
      return await rpcSyncCookiesByNoteId(auth, { ...binding, domain }, cookies, lines, { manual });
    } catch (err) {
      if (isMissingRpcError(err) && isJwtPatchable(auth)) {
        await patchNote(auth, noteId, payload);
        return { lines: lines.length, cookies: cookies.length, mode: "jwt_patch" };
      }
      throw new Error(formatSyncError(err));
    }
  }

  if (syncId) {
    try {
      return await rpcSyncCookies(auth, { ...binding, domain }, cookies, lines, { manual });
    } catch (err) {
      if (isMissingRpcError(err) && noteId && isJwtPatchable(auth)) {
        await patchNote(auth, noteId, payload);
        return { lines: lines.length, cookies: cookies.length, mode: "jwt_patch" };
      }
      throw new Error(formatSyncError(err));
    }
  }

  throw new Error("Binding needs noteId or syncId");
}

export async function recordRouteActivityOnCloud(auth, binding, kind, opts = {}) {
  const noteId = binding?.noteId?.trim();
  const domain = normalizeRouteDomain(binding?.domain);
  if (!auth?.supabase_url || !auth?.access_token || isJwtExpired(auth) || !noteId || !domain) {
    return { ok: false, error: "session_required", at: null };
  }
  const rpc = kind === "sync" ? "cookie_route_record_sync" : "cookie_route_record_load";
  const base = String(auth.supabase_url).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: userHeaders(auth, { "Content-Type": "application/json" }),
      body: JSON.stringify({ p_note_id: noteId, p_domain: domain }),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok || data?.ok === false) {
      const err = data?.error ?? parseApiErrorBody(text);
      return { ok: false, error: String(err), at: null };
    }
    if (typeof opts.onBumpUiTick === "function") {
      await opts.onBumpUiTick();
    }
    const at = kind === "sync" ? data?.activity?.last_sync_at : data?.activity?.last_load_at;
    if (at && opts.persistStatus !== false) {
      const key = bindingRouteKey(binding);
      if (key) {
        const stored = await chrome.storage.local.get(STORAGE_BINDING_STATUS);
        const status = stored[STORAGE_BINDING_STATUS] ?? {};
        const prev = status[key] ?? {};
        status[key] = {
          ...prev,
          ...(kind === "sync" ? { userSyncedAt: at } : { userLoadedAt: at, loadedAt: at }),
        };
        await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: status });
      }
    }
    return { ok: true, at: at ?? null };
  } catch (err) {
    return { ok: false, error: String(err), at: null };
  }
}

const OSID_HTML_EMAIL_RE = /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;
const OSID_IGNORED_EMAIL_DOMAINS = new Set([
  "google.com",
  "gstatic.com",
  "googleapis.com",
  "googleusercontent.com",
  "gtempaccount.com",
  "example.com",
  "example.org",
  "sentry.io",
]);

export function extractSignedInEmailsFromWizHtml(html = "") {
  const found = [];
  const seen = new Set();
  const normalizedHtml = String(html || "").replace(
    /\\x22|\\u0022|&quot;|&#34;|\\x27|\\u0027|&#39;/gi,
    '"',
  );
  const matches = normalizedHtml.match(OSID_HTML_EMAIL_RE) || [];
  for (const raw of matches) {
    const rawEmail = raw.trim().toLowerCase();
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|ttf|map)$/i.test(rawEmail)) continue;
    const atIdx = rawEmail.indexOf("@");
    if (atIdx <= 0) continue;
    const local = rawEmail.slice(0, atIdx).replace(/^datalab_prefs_/i, "");
    const dom = rawEmail.slice(atIdx + 1);
    if (!local || !dom) continue;
    if (OSID_IGNORED_EMAIL_DOMAINS.has(dom)) continue;
    if (/^(no[_-]?reply|support|help|info|abuse|postmaster|security)/i.test(local)) continue;
    const email = `${local}@${dom}`;
    if (seen.has(email)) continue;
    seen.add(email);
    found.push(email);
  }
  return found;
}

/**
 * Inspect open browser tabs for a Google / Google OSID route so clicking `Sync` while standing
 * on a logged-out landing page (`flow.google.com/about?pli=1`, `notebook.google`, `firebase.studio`)
 * or `ServiceLogin` prompt NEVER overwrites a live Cloud Vault with stale jar cookies.
 */
export async function inspectOpenGoogleTabsForSyncGuard(
  domain = "",
  tabsApi = globalThis.chrome?.tabs,
) {
  if (!tabsApi?.query) return { blocked: false, loggedOutUrl: null, reason: "" };
  try {
    const tabs = await tabsApi.query({});
    const res = evaluateOpenTabsSyncBlockForDomain(domain, tabs);
    return {
      blocked: res.blocked,
      loggedOutUrl: res.loggedOutUrl,
      reason: res.reason,
    };
  } catch {
    return { blocked: false, loggedOutUrl: null, reason: "" };
  }
}

/**
 * Server-side session liveness probe across the Google AI / Subdomain OSID suite
 * (`Google Flow`, `Google AI Studio`, `NotebookLM`, `Firebase Studio`, `Google Gemini`, `Google Colab`).
 * Distinguishes live sessions (which embed the signed-in email in `WIZ_global_data` / `gbar_` / `AiSandboxAngularFrontend` HTML)
 * from revoked/logged-out jar cookies (which redirect to `ServiceLogin` / marketing hosts or render guest Wiz HTML with 0 user emails).
 * Gracefully returns `{ checked: false, live: true }` in offline unit tests where `fetch` is mocked only for Supabase.
 */
export async function probeGoogleOsidSessionLive(
  osidApp,
  { fetchFn = globalThis.fetch, timeoutMs = 3500 } = {},
) {
  const isRealExtensionRuntime = globalThis.location?.protocol === "chrome-extension:";
  if (
    !osidApp?.sessionUrl ||
    typeof fetchFn !== "function" ||
    (fetchFn === globalThis.fetch && !isRealExtensionRuntime)
  ) {
    return { checked: false, live: true, email: "" };
  }
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetchFn(osidApp.sessionUrl, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    if (!res) return { checked: false, live: true, email: "" };
    const finalUrl = String(res.url || "");
    if (finalUrl && (isGoogleMarketingUrl(finalUrl) || isGoogleSignInPromptUrl(finalUrl))) {
      return { checked: true, live: false, email: "" };
    }
    if (!res.ok || typeof res.text !== "function") {
      return { checked: false, live: true, email: "" };
    }
    const html = await res.text();
    const isGoogleAppHtml =
      html.includes("AiSandboxAngularFrontend") ||
      html.includes("WIZ_global_data") ||
      html.includes("window['ppConfig']") ||
      html.includes("_DumpException") ||
      html.includes("gbar_");
    if (!isGoogleAppHtml) {
      return { checked: false, live: true, email: "" };
    }
    const emails = extractSignedInEmailsFromWizHtml(html);
    if (emails.length > 0) {
      return { checked: true, live: true, email: emails[0] };
    }
    return { checked: true, live: false, email: "" };
  } catch {
    return { checked: false, live: true, email: "" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Canonical single-route Cookie + SPA Storage + Encrypted Vault Sync engine.
 * Shared identically by `background.js` (`syncBindingWithVault`) and `popup-direct-ops.js`.
 */
export async function syncSingleRouteWithVault(auth, b, browserId, opts = {}) {
  const sourceLock = sourceLockStateForBinding(
    b,
    browserId,
    auth,
    opts.identity ?? null,
    opts.sourceBrowserId ?? null,
  );
  if (!sourceLock.canWrite) {
    return {
      ok: true,
      lines: 0,
      cookies: 0,
      vault: sourceLock.state,
      vaultError: sourceLock.message,
      sourceLock,
      skippedSync: true,
    };
  }

  const domain = b.domain.trim();
  const cookies = await getCookiesForDomain(domain);
  const liveStorage = await captureSiteAuthStorageForDomain(domain, {
    ensureTabIfMissing: opts.manual === true && isSpaStorageAuthDomain(domain),
  }).catch(() => null);
  let storage = liveStorage;
  const count = cookies.length;
  const currentVaultNames = summarizeCookieNames(cookies);
  const currentGoogleNames =
    isGoogleDomain(domain) || isGoogleOsidAppDomain(domain)
      ? summarizeGoogleCookieNames(cookies)
      : null;

  const summaryPassOpt = Object.prototype.hasOwnProperty.call(opts, "vaultPassOverride")
    ? { passphrase: opts.vaultPassOverride }
    : {};

  if (
    isElevenLabsDomain(domain) &&
    !hasElevenLabsAuthSession(cookies, liveStorage) &&
    opts.allowIncompleteElevenLabsVault !== true &&
    canUseVault(b)
  ) {
    const existing = await fetchExistingVaultSummary(auth, b, summaryPassOpt).catch(() => ({
      exists: false,
    }));
    if (existing?.exists) {
      return {
        ok: true,
        lines: count,
        cookies: count,
        vaultNames: currentVaultNames,
        vault: "skipped",
        skippedSync: true,
        existingVault: existing.vaultNames ?? null,
        vaultError:
          "Guard: ElevenLabs tab is not signed in (missing Firebase Auth session); skipped vault overwrite.",
      };
    }
  }

  const osidApp = resolveGoogleOsidApp(domain);
  if (
    (isGoogleDomain(domain) || Boolean(osidApp)) &&
    opts.allowIncompleteGoogleVault !== true &&
    canUseVault(b)
  ) {
    const targetName = osidApp ? osidApp.label : "Google";
    const targetHost = osidApp ? osidApp.primaryHost : "Google";
    if (currentGoogleNames?.hasGoogleLogin !== true) {
      const existing = await fetchExistingVaultSummary(auth, b, summaryPassOpt).catch(() => ({
        exists: false,
      }));
      return {
        ok: true,
        lines: count,
        cookies: count,
        vaultNames: currentVaultNames,
        vault: "skipped",
        skippedSync: true,
        existingVault: existing?.exists ? existing.vaultNames ?? null : null,
        vaultError: existing?.exists
          ? `Guard: ${targetName} jar missing login cookies (SID/HSID); skipped vault overwrite.`
          : `Guard: ${targetName} jar missing login cookies (SID/HSID) — sign in on ${targetHost} first; skipped vault upload.`,
      };
    }

    const tabGuard = await inspectOpenGoogleTabsForSyncGuard(domain);
    if (tabGuard.blocked) {
      const existing = await fetchExistingVaultSummary(auth, b, summaryPassOpt).catch(() => ({
        exists: false,
      }));
      const isSignInScreen = isGoogleSignInPromptUrl(tabGuard.loggedOutUrl || "");
      return {
        ok: true,
        lines: count,
        cookies: count,
        vaultNames: currentVaultNames,
        vault: "skipped",
        skippedSync: true,
        existingVault: existing?.exists ? existing.vaultNames ?? null : null,
        vaultError: isSignInScreen
          ? `${targetName} tab is on the Google sign-in page — click Load (not Sync) to apply cloud cookies onto this browser, or sign in on ${targetHost} before clicking Sync.`
          : `${targetName} tab is on the signed-out landing page — click Load (not Sync) to apply cloud cookies onto this browser, or sign in on ${targetHost} before clicking Sync.`,
      };
    }

    if (osidApp && opts.manual === true) {
      const liveProbe = await probeGoogleOsidSessionLive(osidApp);
      if (liveProbe.checked && !liveProbe.live) {
        const existing = await fetchExistingVaultSummary(auth, b, summaryPassOpt).catch(() => ({
          exists: false,
        }));
        return {
          ok: true,
          lines: count,
          cookies: count,
          vaultNames: currentVaultNames,
          vault: "skipped",
          skippedSync: true,
          existingVault: existing?.exists ? existing.vaultNames ?? null : null,
          vaultError: `Local ${targetName} session on this browser is signed out/expired — click Load to apply cloud cookies, or sign in on ${targetHost} before clicking Sync.`,
        };
      }
    }
  }

  if (!hasNonEmptyAuthStorage(storage) && canUseVault(b)) {
    const existing = await fetchExistingVaultSummary(auth, b, summaryPassOpt).catch(() => null);
    if (hasNonEmptyAuthStorage(existing?.storage)) {
      storage = existing.storage;
    }
  }

  const storageIdentity = extractAuthStorageIdentity(storage);
  const r = await rpcSyncBinding(auth, b, cookies, {
    manual: opts.manual === true,
    storage,
  });
  const base = {
    ...r,
    lines: r.lines ?? count,
    cookies: count,
    vaultNames: currentVaultNames,
    sourceLock,
    storageEmail: storageIdentity.email || null,
    storageUid: storageIdentity.uid || null,
    storageCount: storageIdentity.storageCount || 0,
  };

  if (!canUseVault(b)) {
    return { ...base, vault: "skipped" };
  }
  if (opts.uploadVault === false || opts.suppressUpload === true) {
    return { ...base, vault: "skipped" };
  }
  if (
    isFacebookDomain(domain) &&
    currentVaultNames.hasFacebookLogin !== true &&
    opts.allowIncompleteFacebookVault !== true
  ) {
    const existing = await fetchExistingVaultSummary(auth, b, summaryPassOpt).catch(() => ({
      exists: false,
    }));
    return {
      ...base,
      vault: "skipped",
      existingVault: existing.exists ? existing.vaultNames : null,
      vaultError: `Guard: Facebook jar missing login cookies (${currentVaultNames.count} cookies: ${currentVaultNames.keyNames.join(", ") || "none"}); skipped vault upload.`,
    };
  }
  if (opts.guardVaultDowngrade) {
    const existing = await fetchExistingVaultCount(auth, b).catch(() => ({ exists: false, count: 0 }));
    if (existing.exists && count < existing.count) {
      return {
        ...base,
        vault: "skipped",
        vaultError: `Guard: jar ${count} < vault cloud ${existing.count}; skipped auto-upload.`,
      };
    }
  }

  try {
    const updater = vaultUpdaterLabel(auth, browserId);
    const uploadOpts = { storage };
    if (Object.prototype.hasOwnProperty.call(opts, "vaultPassOverride")) {
      uploadOpts.passphrase = opts.vaultPassOverride;
    }
    const vault = await uploadVaultForBinding(auth, b, cookies, browserId, updater, uploadOpts);
    return {
      ...base,
      vault:
        vault.promoted === false ? "skipped" : vault.ok ? "uploaded" : vault.reason ?? "skipped",
      vaultCount: vault.storedCount ?? count,
      vaultVersion: vault.vault_version ?? null,
      vaultUpdatedBy: vault.updated_by ?? updater,
      vaultError: vault.promoted === false ? vault.reason : undefined,
    };
  } catch (vaultErr) {
    const vaultError = formatSyncError(vaultErr);
    let vault = "failed";
    if (/invalid pass/i.test(vaultError)) {
      vault = "pass_mismatch";
    } else if (isSchemaRelatedVaultError(vaultError)) {
      const schemaOk = await probeCookieSchemaOk(auth, [b]).catch(() => false);
      vault = schemaOk ? "failed" : "rpc_missing";
    }
    return { ...base, vault, vaultError };
  }
}
