import {
  describeSiteClearTarget,
  elevenLabsSessionUrl,
  extractHostnameFromUrlOrDomain,
  extractRegistrableDomain,
  googleOsidPassiveLoginUrl,
  googleOsidSessionUrl,
  hasGoogleOsidCookieForDomain,
  isElevenLabsDomain,
  isGoogleOsidAppDomain,
  resolveGoogleOsidApp,
  resolveSiteClearCookieDomains,
  shouldForceNavigateElevenLabsTab,
  shouldForceNavigateGoogleOsidTab,
} from "./domain-routes.js";
import {
  applySiteAuthStorageForDomain,
  captureSiteAuthStorageForDomain,
  extractAuthStorageIdentity,
  hasNonEmptyAuthStorage,
} from "./site-auth-storage.js";
import {
  applyCookiesToBrowser,
  formatCookiesJson,
  prepareCookiesForApply,
} from "./vault-api.js";

export function extractSiteSessionIdentityHint(domain, cookies = [], storage = null) {
  const host = String(domain || "")
    .replace(/^\.+/, "")
    .toLowerCase();
  const storageIdentity = extractAuthStorageIdentity(storage);
  if (storageIdentity?.isAuthenticated) {
    return {
      sessionHint:
        storageIdentity.email ||
        (storageIdentity.uid ? `UID ${storageIdentity.uid}` : "Signed in"),
      isAuthenticated: true,
    };
  }
  const byName = new Map();
  const nameSet = new Set();
  for (const c of Array.isArray(cookies) ? cookies : []) {
    const name = String(c?.name ?? "").trim();
    if (!name) continue;
    nameSet.add(name);
    if (!byName.has(name) && c?.value != null && String(c.value).trim()) {
      byName.set(name, String(c.value).trim());
    }
  }

  if (host === "facebook.com" || host === "messenger.com" || host.endsWith(".facebook.com")) {
    const cUser = byName.get("c_user") || "";
    if (/^\d{5,22}$/.test(cUser) && nameSet.has("xs")) {
      return { sessionHint: `UID ${cUser}`, isAuthenticated: true };
    }
    if (/^\d{5,22}$/.test(cUser)) {
      return { sessionHint: `ID ${cUser}`, isAuthenticated: false };
    }
  }

  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const dsUserId = byName.get("ds_user_id") || "";
    if (/^\d{4,22}$/.test(dsUserId) && nameSet.has("sessionid")) {
      return { sessionHint: `UID ${dsUserId}`, isAuthenticated: true };
    }
  }

  if (host === "x.com" || host === "twitter.com") {
    if (nameSet.has("auth_token")) {
      let uid = "";
      try {
        const twid = decodeURIComponent(byName.get("twid") || "");
        const m = twid.match(/u=(\d{4,24})/);
        if (m) uid = m[1];
      } catch {
        /* ignore */
      }
      return { sessionHint: uid ? `UID ${uid}` : "Signed in", isAuthenticated: true };
    }
  }

  if (host === "github.com") {
    if (nameSet.has("user_session") || nameSet.has("__Host-user_session_same_site")) {
      const ghUser = byName.get("dotcom_user") || "";
      return { sessionHint: ghUser ? `@${ghUser}` : "Signed in", isAuthenticated: true };
    }
  }

  if (
    host === "google.com" ||
    host === "youtube.com" ||
    isGoogleOsidAppDomain(host) ||
    host.endsWith(".google.com")
  ) {
    if (
      (nameSet.has("SID") && nameSet.has("HSID")) ||
      nameSet.has("__Secure-1PSID") ||
      nameSet.has("__Secure-3PSID") ||
      nameSet.has("OSID")
    ) {
      return { sessionHint: "Signed in", isAuthenticated: true };
    }
  }

  if (
    host === "live.com" ||
    host === "outlook.com" ||
    host === "office.com" ||
    host === "microsoft.com" ||
    host === "microsoftonline.com"
  ) {
    if (
      nameSet.has("WLSSC") ||
      nameSet.has("__Host-MSAAUTH") ||
      nameSet.has("RPSSecAuth") ||
      nameSet.has("ESTSAUTHPERSISTENT")
    ) {
      return { sessionHint: "Signed in", isAuthenticated: true };
    }
  }

  if (host === "tiktok.com") {
    if (nameSet.has("sessionid") || nameSet.has("sessionid_ss") || nameSet.has("sid_tt")) {
      return { sessionHint: "Signed in", isAuthenticated: true };
    }
  }

  if (host === "chatgpt.com" || host === "openai.com") {
    if (nameSet.has("__Secure-next-auth.session-token")) {
      return { sessionHint: "Signed in", isAuthenticated: true };
    }
  }

  if (host === "claude.ai" || host === "claude.com" || host === "anthropic.com") {
    if (nameSet.has("sessionKey")) {
      return { sessionHint: "Signed in", isAuthenticated: true };
    }
  }

  if (host === "elevenlabs.io" || host.endsWith(".elevenlabs.io")) {
    const secIdRaw = byName.get("__sec_id") || "";
    if (secIdRaw) {
      try {
        const parsed = JSON.parse(decodeURIComponent(secIdRaw));
        const uname = String(parsed?.username ?? "").trim();
        if (uname) return { sessionHint: uname, isAuthenticated: true };
      } catch {
        /* ignore */
      }
    }
    if (nameSet.has("xi_website_user") && nameSet.has("fern_token")) {
      return { sessionHint: "Signed in", isAuthenticated: true };
    }
  }

  if (host === "kalodata.com" || host.endsWith(".kalodata.com")) {
    if (nameSet.has("SESSION") || nameSet.has("kalo_token")) {
      return { sessionHint: "Signed in", isAuthenticated: true };
    }
  }

  return { sessionHint: "", isAuthenticated: false };
}

function cookieRemovalUrl(cookie, protocolOverride = null) {
  const rawDomain = String(cookie?.domain ?? "").replace(/^\.+/, "");
  if (!rawDomain) return null;
  const protocol = protocolOverride ?? (cookie?.secure ? "https:" : "http:");
  const path = cookie?.path && String(cookie.path).startsWith("/") ? cookie.path : "/";
  return `${protocol}//${rawDomain}${path}`;
}

export async function removeSingleCookieEverywhere(cookie) {
  const primaryUrl = cookieRemovalUrl(cookie);
  if (!primaryUrl || !cookie?.name) return false;
  const BaseDetails = {
    url: primaryUrl,
    name: cookie.name,
  };
  if (cookie.storeId) BaseDetails.storeId = cookie.storeId;
  if (cookie.partitionKey) BaseDetails.partitionKey = cookie.partitionKey;

  let removed = false;
  try {
    const r = await chrome.cookies.remove(BaseDetails);
    if (r) removed = true;
  } catch {
    // Retry without partitionKey or alternate protocol below
  }
  if (!removed && BaseDetails.partitionKey) {
    try {
      const noPart = { ...BaseDetails };
      delete noPart.partitionKey;
      const r = await chrome.cookies.remove(noPart);
      if (r) removed = true;
    } catch {
      /* ignore */
    }
  }
  const altUrl = cookieRemovalUrl(cookie, cookie?.secure ? "http:" : "https:");
  if (altUrl && altUrl !== primaryUrl) {
    try {
      const altDetails = { ...BaseDetails, url: altUrl };
      const r = await chrome.cookies.remove(altDetails);
      if (r) removed = true;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

function cookieMatchesAnyScope(cookieDomain, scopes) {
  const host = String(cookieDomain ?? "").replace(/^\.+/, "").toLowerCase();
  if (!host) return false;
  return scopes.some((scope) => {
    const base = String(scope ?? "").replace(/^\.+/, "").toLowerCase();
    return Boolean(base) && (host === base || host.endsWith(`.${base}`));
  });
}

export async function getCookiesForSiteClear(urlOrDomain) {
  const scopes = resolveSiteClearCookieDomains(urlOrDomain);
  if (!scopes.length) return { scopes: [], cookies: [] };

  const allCookies = [];
  try {
    const standardJar = await chrome.cookies.getAll({});
    for (const c of standardJar) {
      if (cookieMatchesAnyScope(c.domain, scopes)) allCookies.push(c);
    }
  } catch {
    for (const scope of scopes) {
      const base = scope.replace(/^\.+/, "");
      try {
        const list = await chrome.cookies.getAll({ domain: base });
        allCookies.push(...list);
      } catch {
        /* ignore */
      }
    }
  }

  // Also query partitioned cookies (CHIPS) used by Adobe, Microsoft/Outlook, Google, etc.
  try {
    const partitionedJar = await chrome.cookies.getAll({ partitionKey: {} });
    for (const c of partitionedJar) {
      if (cookieMatchesAnyScope(c.domain, scopes)) {
        allCookies.push(c);
      }
    }
  } catch {
    /* Older Chromium without partitionKey filter support */
  }

  const byKey = new Map();
  for (const c of allCookies) {
    const partKey = c.partitionKey?.topLevelSite ? String(c.partitionKey.topLevelSite) : "";
    const k = `${c.name}\0${c.domain}\0${c.path}\0${c.storeId ?? ""}\0${partKey}`;
    byKey.set(k, c);
  }
  const sorted = [...byKey.values()].sort((a, b) => {
    const domCmp = String(a.domain || "").localeCompare(String(b.domain || ""));
    if (domCmp !== 0) return domCmp;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  return { scopes, cookies: sorted };
}

export async function resolveActiveWebTab() {
  try {
    const activeCurrent = await chrome.tabs.query({ active: true, currentWindow: true });
    const webCurrent = activeCurrent.find((t) => /^https?:\/\//i.test(t?.url ?? ""));
    if (webCurrent) return webCurrent;
  } catch {
    /* ignore */
  }
  try {
    const activeFocused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const webFocused = activeFocused.find((t) => /^https?:\/\//i.test(t?.url ?? ""));
    if (webFocused) return webFocused;
  } catch {
    /* ignore */
  }
  try {
    const allActive = await chrome.tabs.query({ active: true });
    const webActive = allActive.find((t) => /^https?:\/\//i.test(t?.url ?? ""));
    if (webActive) return webActive;
  } catch {
    /* ignore */
  }
  try {
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const webAny = allTabs.find((t) => /^https?:\/\//i.test(t?.url ?? ""));
    if (webAny) return webAny;
  } catch {
    /* ignore */
  }
  return null;
}

export async function collectOpenWebTabDomains() {
  try {
    const tabs = await chrome.tabs.query({});
    const domains = new Set();
    for (const t of tabs) {
      const url = String(t?.url ?? "");
      if (!/^https?:\/\//i.test(url)) continue;
      const base = extractRegistrableDomain(url);
      if (base) domains.add(base);
    }
    return [...domains].sort();
  } catch {
    return [];
  }
}

function serializeCookieItem(c) {
  const val = String(c?.value ?? "");
  const valuePreview = !val
    ? "—"
    : val.length <= 24
      ? val
      : `${val.slice(0, 16)}…${val.slice(-4)}`;
  return {
    name: String(c?.name ?? ""),
    domain: String(c?.domain ?? ""),
    path: String(c?.path ?? "/"),
    valuePreview,
    secure: Boolean(c?.secure),
    httpOnly: Boolean(c?.httpOnly),
    sameSite: String(c?.sameSite ?? ""),
    session: Boolean(c?.session),
    expirationDate: typeof c?.expirationDate === "number" ? c.expirationDate : null,
    storeId: c?.storeId ? String(c.storeId) : "",
    partitionKey: c?.partitionKey ?? null,
    raw: c,
  };
}

export async function getCurrentSiteCookieInfo(overrideDomain = "") {
  const activeTab = await resolveActiveWebTab();
  const activeUrl = String(activeTab?.url ?? "");
  const targetInput = String(overrideDomain ?? "").trim() || activeUrl;
  const target = describeSiteClearTarget(targetInput);
  const { scopes, cookies } = target.baseDomain
    ? await getCookiesForSiteClear(targetInput)
    : { scopes: [], cookies: [] };
  const openTabDomains = await collectOpenWebTabDomains();

  return {
    ok: true,
    activeTabId: activeTab?.id ?? null,
    activeTabUrl: activeUrl,
    activeTabTitle: String(activeTab?.title ?? ""),
    activeTabHost: extractHostnameFromUrlOrDomain(activeUrl),
    activeTabDomain: extractRegistrableDomain(activeUrl),
    targetDomain: target.baseDomain,
    host: target.host,
    displayDomain: target.displayDomain,
    familyLabel: target.familyLabel,
    scopes,
    cookieCount: cookies.length,
    cookies: cookies.map(serializeCookieItem),
    openTabDomains,
  };
}

export async function clearWebStorageOnTab(tabId) {
  if (!tabId || !chrome.scripting?.executeScript) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        try {
          window.localStorage?.clear();
        } catch {
          /* ignore */
        }
        try {
          window.sessionStorage?.clear();
        } catch {
          /* ignore */
        }
        try {
          if (typeof document !== "undefined" && document.cookie) {
            const parts = document.cookie.split(";");
            const hostParts = location.hostname.split(".");
            const candidateDomains = ["", location.hostname, `.${location.hostname}`];
            if (hostParts.length >= 2) {
              const base = hostParts.slice(-2).join(".");
              candidateDomains.push(base, `.${base}`);
            }
            for (const raw of parts) {
              const eq = raw.indexOf("=");
              const name = (eq > -1 ? raw.slice(0, eq) : raw).trim();
              if (!name) continue;
              for (const dom of candidateDomains) {
                const domAttr = dom ? `; domain=${dom}` : "";
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domAttr}`;
              }
            }
          }
        } catch {
          /* ignore */
        }
        try {
          if (typeof caches !== "undefined" && caches?.keys) {
            const keys = await caches.keys();
            await Promise.allSettled(keys.map((k) => caches.delete(k)));
          }
        } catch {
          /* ignore */
        }
        try {
          if (typeof indexedDB !== "undefined" && indexedDB?.databases) {
            const dbs = await indexedDB.databases();
            await Promise.allSettled(
              (dbs || []).map((db) =>
                db?.name
                  ? new Promise((resolve) => {
                      const req = indexedDB.deleteDatabase(db.name);
                      req.onsuccess = () => resolve(true);
                      req.onerror = () => resolve(false);
                      req.onblocked = () => resolve(false);
                    })
                  : Promise.resolve(false),
              ),
            );
          }
        } catch {
          /* ignore */
        }
        return true;
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearSiteCookiesComplete(
  urlOrDomain,
  { clearStorage = true, reloadTabs = true } = {},
) {
  const activeTab = await resolveActiveWebTab();
  const targetInput = String(urlOrDomain ?? "").trim() || String(activeTab?.url ?? "");
  const target = describeSiteClearTarget(targetInput);
  if (!target.baseDomain && !target.host) {
    return {
      ok: false,
      error: "No active web site domain found to clear cookies.",
    };
  }

  const { scopes, cookies: pass1 } = await getCookiesForSiteClear(targetInput);
  let removedCount = 0;
  for (const c of pass1) {
    if (await removeSingleCookieEverywhere(c)) {
      removedCount += 1;
    }
  }

  // Second pass to catch cookies recreated or missed on first pass
  const { cookies: pass2 } = await getCookiesForSiteClear(targetInput);
  for (const c of pass2) {
    if (await removeSingleCookieEverywhere(c)) {
      removedCount += 1;
    }
  }

  let matchingTabs = [];
  try {
    const allTabs = await chrome.tabs.query({});
    matchingTabs = allTabs.filter((t) => {
      const host = extractHostnameFromUrlOrDomain(t?.url ?? "");
      return host && cookieMatchesAnyScope(host, scopes);
    });
  } catch {
    /* ignore */
  }

  let storageClearedTabs = 0;
  if (clearStorage && matchingTabs.length) {
    for (const t of matchingTabs) {
      if (t.id && (await clearWebStorageOnTab(t.id))) {
        storageClearedTabs += 1;
      }
    }
  }

  let tabsReloaded = 0;
  if (reloadTabs && matchingTabs.length) {
    for (const t of matchingTabs) {
      if (!t.id) continue;
      try {
        await chrome.tabs.reload(t.id);
        tabsReloaded += 1;
      } catch {
        /* ignore */
      }
    }
  }

  const { cookies: remaining } = await getCookiesForSiteClear(targetInput);
  return {
    ok: true,
    targetDomain: target.baseDomain,
    displayDomain: target.displayDomain,
    familyLabel: target.familyLabel,
    scopes,
    found: pass1.length,
    removed: removedCount,
    remaining: remaining.length,
    storageClearedTabs,
    tabsReloaded,
  };
}

export async function listAllCookieSitesForDirectory() {
  const activeTab = await resolveActiveWebTab();
  const activeUrl = String(activeTab?.url ?? "");
  const activeTabDomain = extractRegistrableDomain(activeUrl);

  const openTabsByDomain = new Map();
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      const url = String(t?.url ?? "");
      if (!/^https?:\/\//i.test(url)) continue;
      const dom = extractRegistrableDomain(url);
      if (!dom) continue;
      const list = openTabsByDomain.get(dom) || [];
      list.push({ id: t.id, title: String(t.title || dom), url });
      openTabsByDomain.set(dom, list);
    }
  } catch {
    /* ignore */
  }

  const rawCookies = [];
  try {
    const standardJar = await chrome.cookies.getAll({});
    rawCookies.push(...standardJar);
  } catch {
    /* ignore */
  }
  try {
    const partitionedJar = await chrome.cookies.getAll({ partitionKey: {} });
    rawCookies.push(...partitionedJar);
  } catch {
    /* ignore */
  }

  const dedupedCookies = new Map();
  for (const c of rawCookies) {
    const partKey = c?.partitionKey?.topLevelSite ? String(c.partitionKey.topLevelSite) : "";
    const k = `${c?.name ?? ""}\0${c?.domain ?? ""}\0${c?.path ?? ""}\0${c?.storeId ?? ""}\0${partKey}`;
    dedupedCookies.set(k, c);
  }
  const allCookies = [...dedupedCookies.values()];

  const cookiesByDomain = new Map();
  for (const c of allCookies) {
    const dom = extractRegistrableDomain(c?.domain ?? "");
    if (!dom) continue;
    let bucket = cookiesByDomain.get(dom);
    if (!bucket) {
      bucket = [];
      cookiesByDomain.set(dom, bucket);
    }
    bucket.push(c);
  }

  const allSiteDomains = new Set([
    ...openTabsByDomain.keys(),
    ...cookiesByDomain.keys(),
  ]);
  if (activeTabDomain) allSiteDomains.add(activeTabDomain);

  const sites = [];
  for (const domain of allSiteDomains) {
    const target = describeSiteClearTarget(domain);
    const scopes = Array.isArray(target.scopes) && target.scopes.length ? target.scopes : [`.${domain}`];
    const directCookies = cookiesByDomain.get(domain) || [];
    const scopeCookies =
      scopes.length > 1
        ? allCookies.filter((c) => cookieMatchesAnyScope(c?.domain ?? "", scopes))
        : directCookies;

    let httpOnlyCount = 0;
    let secureCount = 0;
    let sessionCount = 0;
    let chipsCount = 0;
    let maxExpirySec = null;
    let authExpirySec = null;
    const cookieNames = [];

    for (const c of directCookies) {
      if (c?.httpOnly) httpOnlyCount += 1;
      if (c?.secure) secureCount += 1;
      if (c?.partitionKey) chipsCount += 1;
      if (c?.session || typeof c?.expirationDate !== "number") {
        sessionCount += 1;
      } else {
        if (maxExpirySec === null || c.expirationDate > maxExpirySec) {
          maxExpirySec = c.expirationDate;
        }
        if (c?.httpOnly && (authExpirySec === null || c.expirationDate > authExpirySec)) {
          authExpirySec = c.expirationDate;
        }
      }
      if (c?.name && cookieNames.length < 25) {
        cookieNames.push(String(c.name));
      }
    }

    const openTabs = openTabsByDomain.get(domain) || [];
    const isPrimaryActiveTab = Boolean(activeTabDomain && domain === activeTabDomain);
    const isOpenTab = isPrimaryActiveTab || openTabs.length > 0;
    let tabAuthStorage = null;
    if (isOpenTab) {
      tabAuthStorage = await captureSiteAuthStorageForDomain(`.${domain}`, {
        ensureTabIfMissing: false,
      }).catch(() => null);
    }
    const identity = extractSiteSessionIdentityHint(
      domain,
      scopeCookies.length >= directCookies.length ? scopeCookies : directCookies,
      tabAuthStorage,
    );

    sites.push({
      domain,
      displayDomain: target.displayDomain || domain,
      familyLabel: target.familyLabel || "",
      scopes,
      isMultiSso: scopes.length > 1,
      isActiveTab: isPrimaryActiveTab,
      isOpenTab,
      openTabCount: openTabs.length,
      openTabTitle: openTabs[0]?.title || "",
      cookieCount: directCookies.length,
      scopeCookieCount: scopeCookies.length,
      httpOnlyCount,
      secureCount,
      sessionCount,
      chipsCount,
      maxExpirySec,
      authExpirySec,
      effectiveExpirySec: authExpirySec ?? maxExpirySec,
      cookieNames,
      sessionHint: identity.sessionHint,
      isAuthenticated: identity.isAuthenticated,
    });
  }

  sites.sort((a, b) => {
    if (a.isActiveTab !== b.isActiveTab) return a.isActiveTab ? -1 : 1;
    if (a.isOpenTab !== b.isOpenTab) return a.isOpenTab ? -1 : 1;
    if (b.cookieCount !== a.cookieCount) return b.cookieCount - a.cookieCount;
    return a.domain.localeCompare(b.domain);
  });

  return {
    ok: true,
    activeTabId: activeTab?.id ?? null,
    activeTabUrl: activeUrl,
    activeTabDomain: activeTabDomain || "",
    totalCookiesInJar: allCookies.length,
    sites,
  };
}

export function parseCookiesInputForSite(rawText, fallbackDomain = "") {
  const trimmed = String(rawText ?? "").trim();
  if (!trimmed) {
    throw new Error("Paste Cookie-Editor JSON or a cookie header string (name=value; ...).");
  }
  const fallbackBase =
    extractRegistrableDomain(fallbackDomain) ||
    String(fallbackDomain || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .replace(/^\.+/, "")
      .toLowerCase();

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed = null;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`Invalid JSON: ${err?.message || String(err)}`);
    }
    const rawList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.cookies)
        ? parsed.cookies
        : parsed && typeof parsed === "object" && parsed.name
          ? [parsed]
          : [];
    const storage =
      !Array.isArray(parsed) && parsed?.storage && typeof parsed.storage === "object"
        ? parsed.storage
        : null;
    const normalized = [];
    let firstDomain = "";
    for (const item of rawList) {
      const name = String(item?.name ?? "").trim();
      if (!name) continue;
      let dom = String(item?.domain ?? "").trim();
      if (!dom && fallbackBase) {
        dom = `.${fallbackBase}`;
      }
      if (!firstDomain && dom) {
        firstDomain = extractRegistrableDomain(dom) || dom.replace(/^\.+/, "").toLowerCase();
      }
      normalized.push({
        ...item,
        name,
        domain: dom,
        value: item?.value != null ? String(item.value) : "",
        path: item?.path || "/",
        secure: item?.secure !== undefined ? Boolean(item.secure) : true,
        httpOnly: Boolean(item?.httpOnly),
        hostOnly: Boolean(item?.hostOnly),
      });
    }
    const prepared = prepareCookiesForApply(normalized);
    if (!prepared.length && !hasNonEmptyAuthStorage(storage)) {
      throw new Error("No valid cookie entries found in JSON.");
    }
    return {
      cookies: prepared,
      storage,
      inferredDomain: fallbackBase || firstDomain || "",
    };
  }

  // Raw Cookie header string (`c_user=...; xs=...` or `Cookie: ...`)
  if (!fallbackBase || !fallbackBase.includes(".")) {
    throw new Error("Enter a target domain (e.g. facebook.com) when pasting name=value cookies.");
  }
  const body = trimmed.replace(/^cookie\s*:\s*/i, "");
  const segments = body
    .split(/[;\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultExp = Math.floor(Date.now() / 1000) + 180 * 86400;
  const cookies = [];
  for (const seg of segments) {
    const eqIdx = seg.indexOf("=");
    if (eqIdx <= 0) continue;
    const name = seg.slice(0, eqIdx).trim();
    const value = seg.slice(eqIdx + 1).trim();
    if (!name || /^(path|domain|expires|max-age|samesite|secure|httponly|priority)$/i.test(name)) {
      continue;
    }
    cookies.push({
      domain: `.${fallbackBase}`,
      expirationDate: defaultExp,
      hostOnly: false,
      httpOnly: false,
      name,
      path: "/",
      sameSite: "unspecified",
      secure: true,
      session: false,
      value,
    });
  }
  if (!cookies.length) {
    throw new Error("Could not parse any name=value cookies from input.");
  }
  return { cookies, inferredDomain: fallbackBase };
}

export async function exportSiteCookiesForDirectory(
  urlOrDomain,
  { includeSsoScope = true } = {},
) {
  const baseDomain =
    extractRegistrableDomain(urlOrDomain) ||
    String(urlOrDomain || "")
      .trim()
      .replace(/^\.+/, "")
      .toLowerCase();
  if (!baseDomain) {
    return { ok: false, error: "Select a site domain to export cookies." };
  }
  const { scopes, cookies: scopedCookies } = await getCookiesForSiteClear(baseDomain);
  const cookies = includeSsoScope
    ? scopedCookies
    : scopedCookies.filter((c) => extractRegistrableDomain(c?.domain ?? "") === baseDomain);
  const storage = await captureSiteAuthStorageForDomain(`.${baseDomain}`, {
    ensureTabIfMissing: false,
  }).catch(() => null);
  if (!cookies.length && !hasNonEmptyAuthStorage(storage)) {
    return { ok: false, error: `No cookies found in jar for ${baseDomain}.` };
  }
  return {
    ok: true,
    domain: baseDomain,
    scopes,
    count: cookies.length,
    json: formatCookiesJson(cookies, storage),
  };
}

export async function importSiteCookiesFromJsonForDirectory(
  targetDomain,
  rawText,
  { replaceExisting = false, reloadTabs = true } = {},
) {
  const { cookies, storage, inferredDomain } = parseCookiesInputForSite(rawText, targetDomain);
  const effectiveDomain =
    extractRegistrableDomain(targetDomain) ||
    inferredDomain ||
    String(targetDomain || "")
      .trim()
      .replace(/^\.+/, "")
      .toLowerCase();

  let clearedBefore = 0;
  if (replaceExisting && effectiveDomain) {
    const cleared = await clearSiteCookiesComplete(effectiveDomain, {
      clearStorage: false,
      reloadTabs: false,
    });
    if (cleared?.ok) clearedBefore = Number(cleared.removed ?? 0);
  }

  const applied = cookies.length
    ? await applyCookiesToBrowser(cookies, {
        rounds: 2,
        retryDelayMs: 120,
      })
    : { applied: 0, failed: 0, total: 0, appliedNames: [], failedNames: [], failedDetails: [] };

  let storageApplied = 0;
  if (effectiveDomain && hasNonEmptyAuthStorage(storage)) {
    const storageRes = await applySiteAuthStorageForDomain(`.${effectiveDomain}`, storage).catch(() => null);
    storageApplied = storageRes?.applied ?? 0;
  }

  let tabsReloaded = 0;
  if (reloadTabs && (applied.applied > 0 || storageApplied > 0) && effectiveDomain) {
    const scopes = resolveSiteClearCookieDomains(effectiveDomain);
    const effectiveScopes = scopes.length ? scopes : [`.${effectiveDomain}`];
    try {
      const allTabs = await chrome.tabs.query({});
      for (const t of allTabs) {
        if (!t.id) continue;
        const host = extractHostnameFromUrlOrDomain(t?.url ?? "");
        if (host && cookieMatchesAnyScope(host, effectiveScopes)) {
          try {
            const osidApp = resolveGoogleOsidApp(host) || resolveGoogleOsidApp(effectiveDomain);
            if (osidApp) {
              const hasOsid = hasGoogleOsidCookieForDomain(cookies, osidApp.canonicalDomain);
              if (shouldForceNavigateGoogleOsidTab(t.url, osidApp.canonicalDomain) || !hasOsid) {
                await chrome.tabs.update(t.id, {
                  url: hasOsid
                    ? googleOsidSessionUrl(osidApp.canonicalDomain)
                    : googleOsidPassiveLoginUrl(osidApp.canonicalDomain),
                });
              } else {
                await chrome.tabs.reload(t.id);
              }
            } else if (
              (isElevenLabsDomain(host) || isElevenLabsDomain(effectiveDomain)) &&
              shouldForceNavigateElevenLabsTab(t.url, effectiveDomain)
            ) {
              await chrome.tabs.update(t.id, { url: elevenLabsSessionUrl() });
            } else {
              await chrome.tabs.reload(t.id);
            }
            tabsReloaded += 1;
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {
    ok: applied.applied > 0 || storageApplied > 0,
    domain: effectiveDomain,
    clearedBefore,
    tabsReloaded,
    storageApplied,
    ...applied,
  };
}

export async function clearMultipleSitesCookies(
  domains = [],
  { clearStorage = true, reloadTabs = true } = {},
) {
  const uniqueDomains = Array.from(
    new Set(
      (Array.isArray(domains) ? domains : [])
        .map((d) => extractRegistrableDomain(d) || String(d || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (!uniqueDomains.length) {
    return { ok: false, error: "No site domains selected to clear." };
  }
  let totalRemoved = 0;
  let totalRemaining = 0;
  let totalTabsReloaded = 0;
  let totalStorageCleared = 0;
  const results = [];

  for (const domain of uniqueDomains) {
    const res = await clearSiteCookiesComplete(domain, { clearStorage, reloadTabs });
    if (res?.ok) {
      totalRemoved += Number(res.removed ?? 0);
      totalRemaining += Number(res.remaining ?? 0);
      totalTabsReloaded += Number(res.tabsReloaded ?? 0);
      totalStorageCleared += Number(res.storageClearedTabs ?? 0);
      results.push(res);
    }
  }

  return {
    ok: true,
    clearedSitesCount: uniqueDomains.length,
    domains: uniqueDomains,
    removed: totalRemoved,
    remaining: totalRemaining,
    tabsReloaded: totalTabsReloaded,
    storageClearedTabs: totalStorageCleared,
    results,
  };
}

