import {
  formatSyncError,
  isJwtExpired,
  parseApiErrorBody,
  userHeaders,
} from "./auth-session.js";
import { COOKIE_BRAND_ICON_REGISTRY } from "./cookie-brand-icons.generated.js";
import {
  effectiveCookieDomain,
  extractRegistrableDomain,
  isClaudeFamilyDomain,
  isElevenLabsDomain,
  isFacebookDomain,
  isGoogleDomain,
  isGoogleOsidAppDomain,
  normalizeDomainHost,
  relatedCookieDomains,
  resolveGoogleOsidApp,
  summarizeGoogleCookieNames,
} from "./domain-routes.js";
import {
  captureSiteAuthStorageForDomain,
  extractAuthStorageIdentity,
  hasNonEmptyAuthStorage,
} from "./site-auth-storage.js";
import { extractSiteSessionIdentityHint } from "./site-cookie-cleaner.js";
import { authUserId, getCookiesForDomain } from "./sync-engine-core.js";
import { bindingRouteKey, getBrowserId } from "./vault-api.js";

const INTERNAL_HOST_PATTERNS = [
  /(^|\.)databox\.infi28\.com$/i,
  /(^|\.)hub\.infi28\.com$/i,
  /^tool-manager-zeta\.vercel\.app$/i,
  /^(127\.0\.0\.1|localhost):(3004|5176|5177)$/i,
];

const IDENTITY_PROVIDER_DOMAINS = new Set([
  "google.com",
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "live.com",
  "hotmail.com",
  "msn.com",
  "microsoft.com",
  "office.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "gmx.com",
  "mail.com",
  "aol.com",
  "fastmail.com",
  "infi28.com",
  "infix1.io.vn",
  "infi.io.vn",
  "fviainboxes.com",
]);

const REJECTED_EMAIL_LOCAL_PARTS = new Set([
  "support",
  "help",
  "info",
  "contact",
  "sales",
  "marketing",
  "admin",
  "administrator",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "privacy",
  "legal",
  "security",
  "abuse",
  "billing",
  "press",
  "media",
  "careers",
  "jobs",
  "hr",
  "feedback",
  "hello",
  "hi",
  "team",
  "service",
  "customerservice",
  "customercare",
  "cs",
  "bd",
  "partner",
  "partners",
  "affiliate",
  "sentry",
  "postmaster",
  "webmaster",
  "hostmaster",
  "example",
  "test",
  "demo",
  "sample",
]);

const REJECTED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "domain.com",
  "email.com",
  "yourdomain.com",
  "company.com",
  "sentry.io",
  "sentry-next.wixpress.com",
  "wixpress.com",
  "users.noreply.github.com",
]);

const EMAIL_CANDIDATE_RE = /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;

function withTimeout(promise, ms, fallback = null) {
  let timer = null;
  const guarded = Promise.resolve(promise).catch(() => fallback);
  return Promise.race([
    guarded.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

export function isInternalWorkspaceUrl(url = "") {
  try {
    const parsed = new URL(url);
    const hostPort = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    return INTERNAL_HOST_PATTERNS.some(
      (re) => re.test(parsed.hostname) || re.test(hostPort),
    );
  } catch {
    return false;
  }
}

/**
 * Resolve the currently active website tab in the user's browser window.
 */
export async function resolveActiveCurrentTab(tabsApi = globalThis.chrome?.tabs) {
  if (!tabsApi?.query) {
    return { ok: false, error: "Browser tabs API is unavailable." };
  }
  let candidate = null;
  try {
    const currentWinTabs = await tabsApi.query({ active: true, currentWindow: true });
    candidate = currentWinTabs?.[0] ?? null;
    if (!candidate || String(candidate.url || "").startsWith("chrome-extension://")) {
      const focusedTabs = await tabsApi.query({ active: true, lastFocusedWindow: true });
      const nonExt = (focusedTabs || []).find(
        (t) => t?.url && !String(t.url).startsWith("chrome-extension://"),
      );
      if (nonExt) candidate = nonExt;
    }
    if (!candidate || String(candidate.url || "").startsWith("chrome-extension://")) {
      const normalTabs = await tabsApi.query({ active: true, windowType: "normal" });
      const httpTab = (normalTabs || []).find((t) => /^https?:\/\//i.test(String(t?.url || "")));
      if (httpTab) candidate = httpTab;
    }
  } catch (err) {
    return { ok: false, error: err?.message || "Unable to read active tab." };
  }

  const rawUrl = String(candidate?.url || candidate?.pendingUrl || "").trim();
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return {
      ok: false,
      error: "Open the target website tab first, then click New.",
    };
  }
  if (isInternalWorkspaceUrl(rawUrl)) {
    return {
      ok: false,
      error: "Switch to the target website tab (not Data Box / Tool Hub), then click New.",
    };
  }
  return { ok: true, tab: candidate, url: rawUrl };
}

function titleCaseBrandSlug(slug = "") {
  return String(slug || "")
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

/**
 * Map a website URL to E0001's canonical route domain and human-readable Platform label.
 */
export function resolveCanonicalRouteDomainAndPlatform(
  url = "",
  brandRegistry = COOKIE_BRAND_ICON_REGISTRY,
) {
  const parsed = new URL(url);
  const rawHost = parsed.hostname.toLowerCase();
  const cleanHost = rawHost.replace(/^www\./i, "");
  const registrable = extractRegistrableDomain(cleanHost) || cleanHost;

  const osidApp = resolveGoogleOsidApp(url) || resolveGoogleOsidApp(cleanHost);
  let canonicalDomain = "";
  if (osidApp) {
    canonicalDomain = effectiveCookieDomain(cleanHost);
  } else if (isClaudeFamilyDomain(cleanHost)) {
    canonicalDomain = ".claude.ai";
  } else if (isElevenLabsDomain(cleanHost)) {
    canonicalDomain = ".elevenlabs.io";
  } else if (isFacebookDomain(cleanHost)) {
    canonicalDomain = ".facebook.com";
  } else if (isGoogleDomain(cleanHost)) {
    canonicalDomain = ".google.com";
  } else {
    canonicalDomain = effectiveCookieDomain(registrable || cleanHost);
  }

  let platformLabel = "";
  if (cleanHost === "mail.google.com") {
    platformLabel = "Gmail";
  } else if (osidApp) {
    platformLabel = osidApp.label;
  } else if (isClaudeFamilyDomain(cleanHost)) {
    platformLabel = "Claude";
  } else if (isElevenLabsDomain(cleanHost)) {
    platformLabel = "ElevenLabs";
  } else if (isFacebookDomain(cleanHost)) {
    platformLabel = "Facebook";
  } else if (Array.isArray(brandRegistry)) {
    const exactHit =
      brandRegistry.find((item) => new RegExp(item.match, "i").test(cleanHost)) ||
      brandRegistry.find((item) => new RegExp(item.match, "i").test(registrable));
    if (exactHit?.label) {
      platformLabel = exactHit.label.replace(/^Acc\s+/i, "").trim();
    }
  }

  if (!platformLabel) {
    const primaryName = String(registrable || cleanHost).split(".")[0] || cleanHost;
    platformLabel = titleCaseBrandSlug(primaryName) || cleanHost;
  }

  return {
    canonicalDomain,
    host: cleanHost,
    registrableDomain: registrable,
    platformLabel,
  };
}

/**
 * Filter candidate emails so site support/footer emails (`support@kalodata.com`, `noreply@...`) are never mistaken for the logged-in user.
 */
export function isLikelyUserAccountEmail(candidate = "", siteRegistrableDomain = "") {
  const email = String(candidate || "")
    .trim()
    .replace(/^[<("']+|[>)"',;]+$/g, "")
    .toLowerCase();
  if (!/^[a-z0-9._%+-]{1,64}@[a-z0-9.-]+\.[a-z]{2,24}$/.test(email)) {
    return false;
  }
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|ttf|map)$/i.test(email)) {
    return false;
  }
  const atIdx = email.indexOf("@");
  if (atIdx <= 0) return false;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (!local || !domain || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false;
  }
  if (REJECTED_EMAIL_DOMAINS.has(domain)) return false;
  const normalizedLocal = local.split("+")[0];
  if (REJECTED_EMAIL_LOCAL_PARTS.has(local) || REJECTED_EMAIL_LOCAL_PARTS.has(normalizedLocal)) {
    return false;
  }
  if (/^(no[_-]?reply|support|customer[_-]?service|helpdesk|sentry)/i.test(local)) {
    return false;
  }
  const siteRoot = normalizeDomainHost(siteRegistrableDomain);
  if (siteRoot && !IDENTITY_PROVIDER_DOMAINS.has(siteRoot)) {
    if (domain === siteRoot || domain.endsWith(`.${siteRoot}`)) {
      return false;
    }
  }
  return true;
}

function decodeJwtPayloadSafe(token = "") {
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3 || !parts[1] || parts[0].length < 8) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const obj = JSON.parse(json);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function extractFirstValidEmailFromText(text = "", siteRegistrableDomain = "") {
  const raw = String(text || "");
  if (!raw || !raw.includes("@")) return "";
  const matches = raw.match(EMAIL_CANDIDATE_RE);
  if (!matches) return "";
  for (const m of matches) {
    if (isLikelyUserAccountEmail(m, siteRegistrableDomain)) {
      return m.toLowerCase();
    }
  }
  return "";
}

const USER_IDENTITY_JSON_KEYS = [
  "email",
  "userEmail",
  "user_email",
  "accountEmail",
  "account_email",
  "loginEmail",
  "primaryEmail",
  "upn",
  "preferred_username",
  "unique_name",
  "mail",
];

const USER_HANDLE_JSON_KEYS = [
  "username",
  "userName",
  "user_name",
  "login",
  "handle",
  "screen_name",
  "nickName",
  "nickname",
  "phone",
  "phoneNumber",
  "mobile",
];

function scanObjectForUserIdentity(node, siteRegistrableDomain = "", depth = 0) {
  if (!node || depth > 5) return { email: "", handle: "" };
  if (typeof node === "string") {
    if (node.startsWith("eyJ") && node.includes(".")) {
      const jwt = decodeJwtPayloadSafe(node);
      if (jwt) return scanObjectForUserIdentity(jwt, siteRegistrableDomain, depth + 1);
    }
    const email = extractFirstValidEmailFromText(node, siteRegistrableDomain);
    return { email, handle: "" };
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < Math.min(node.length, 12); i += 1) {
      const hit = scanObjectForUserIdentity(node[i], siteRegistrableDomain, depth + 1);
      if (hit.email) return hit;
    }
    return { email: "", handle: "" };
  }
  if (typeof node !== "object") return { email: "", handle: "" };

  let fallbackHandle = "";
  for (const key of USER_IDENTITY_JSON_KEYS) {
    const val = node[key];
    if (typeof val === "string" && isLikelyUserAccountEmail(val, siteRegistrableDomain)) {
      return { email: val.trim().toLowerCase(), handle: "" };
    }
  }
  for (const key of USER_HANDLE_JSON_KEYS) {
    const val = node[key];
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (isLikelyUserAccountEmail(trimmed, siteRegistrableDomain)) {
        return { email: trimmed.toLowerCase(), handle: "" };
      }
      if (
        !fallbackHandle &&
        trimmed.length >= 3 &&
        trimmed.length <= 40 &&
        !/^https?:\/\//i.test(trimmed) &&
        !/^[0-9a-f-]{24,}$/i.test(trimmed) &&
        !/^(true|false|null|undefined|guest|anonymous|admin|default)$/i.test(trimmed)
      ) {
        fallbackHandle = trimmed;
      }
    }
  }

  const priorityNested = [
    "user",
    "currentUser",
    "profile",
    "account",
    "me",
    "viewer",
    "session",
    "data",
    "state",
    "userInfo",
    "auth",
    "claims",
  ];
  for (const nestedKey of priorityNested) {
    if (nestedKey in node && node[nestedKey] && typeof node[nestedKey] === "object") {
      const hit = scanObjectForUserIdentity(node[nestedKey], siteRegistrableDomain, depth + 1);
      if (hit.email) return hit;
      if (!fallbackHandle && hit.handle) fallbackHandle = hit.handle;
    }
  }

  for (const [k, v] of Object.entries(node)) {
    if (priorityNested.includes(k)) continue;
    if (v && typeof v === "object") {
      const hit = scanObjectForUserIdentity(v, siteRegistrableDomain, depth + 1);
      if (hit.email) return hit;
      if (!fallbackHandle && hit.handle) fallbackHandle = hit.handle;
    } else if (typeof v === "string" && v.startsWith("eyJ") && v.includes(".")) {
      const jwt = decodeJwtPayloadSafe(v);
      if (jwt) {
        const hit = scanObjectForUserIdentity(jwt, siteRegistrableDomain, depth + 1);
        if (hit.email) return hit;
      }
    }
  }

  return { email: "", handle: fallbackHandle };
}

/**
 * Scan cookies and Web Storage maps for authenticated email / username / JWT claims.
 */
export function extractAccountFromCookiesAndStorage({
  cookies = [],
  storage = null,
  siteRegistrableDomain = "",
} = {}) {
  const storageIdentity = extractAuthStorageIdentity(storage);
  if (
    storageIdentity?.email &&
    isLikelyUserAccountEmail(storageIdentity.email, siteRegistrableDomain)
  ) {
    return {
      identity: storageIdentity.email.trim().toLowerCase(),
      kind: "email",
      source: "spa-auth-storage",
    };
  }

  let bestHandle = "";

  const scanKeyValueMap = (mapObj, sourceName) => {
    if (!mapObj || typeof mapObj !== "object") return null;
    const entries = Object.entries(mapObj);
    entries.sort(([ka], [kb]) => {
      const aPri = /user|account|auth|profile|session|token|member|login|me|store|persist/i.test(ka)
        ? 0
        : 1;
      const bPri = /user|account|auth|profile|session|token|member|login|me|store|persist/i.test(kb)
        ? 0
        : 1;
      return aPri - bPri;
    });
    for (const [key, rawVal] of entries) {
      if (typeof rawVal !== "string" || !rawVal.trim() || rawVal.length > 100_000) continue;
      const trimmed = rawVal.trim();
      if (isLikelyUserAccountEmail(trimmed, siteRegistrableDomain)) {
        return { identity: trimmed.toLowerCase(), kind: "email", source: sourceName };
      }
      if (trimmed.startsWith("eyJ") && trimmed.includes(".")) {
        const jwt = decodeJwtPayloadSafe(trimmed);
        if (jwt) {
          const hit = scanObjectForUserIdentity(jwt, siteRegistrableDomain);
          if (hit.email) return { identity: hit.email, kind: "email", source: `${sourceName}:jwt` };
          if (!bestHandle && hit.handle) bestHandle = hit.handle;
        }
      }
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          const parsed = JSON.parse(trimmed);
          const hit = scanObjectForUserIdentity(parsed, siteRegistrableDomain);
          if (hit.email) return { identity: hit.email, kind: "email", source: `${sourceName}:json` };
          if (
            !bestHandle &&
            hit.handle &&
            /user|account|auth|profile|session|member|login/i.test(key)
          ) {
            bestHandle = hit.handle;
          }
        } catch {
          const email = extractFirstValidEmailFromText(trimmed, siteRegistrableDomain);
          if (email) return { identity: email, kind: "email", source: `${sourceName}:text` };
        }
      } else if (/email|user|account|login|profile/i.test(key)) {
        const email = extractFirstValidEmailFromText(trimmed, siteRegistrableDomain);
        if (email) return { identity: email, kind: "email", source: `${sourceName}:key` };
      }
    }
    return null;
  };

  const lsHit = scanKeyValueMap(storage?.localStorage, "localStorage");
  if (lsHit) return lsHit;
  const ssHit = scanKeyValueMap(storage?.sessionStorage, "sessionStorage");
  if (ssHit) return ssHit;

  for (const c of Array.isArray(cookies) ? cookies : []) {
    const name = String(c?.name ?? "").trim();
    const rawValue = String(c?.value ?? "").trim();
    if (!name || !rawValue || rawValue.length > 16_384) continue;
    let decoded = rawValue;
    if (rawValue.includes("%")) {
      try {
        decoded = decodeURIComponent(rawValue);
      } catch {
        decoded = rawValue;
      }
    }
    if (isLikelyUserAccountEmail(decoded, siteRegistrableDomain)) {
      return { identity: decoded.toLowerCase(), kind: "email", source: `cookie:${name}` };
    }
    if (decoded.startsWith("eyJ") && decoded.includes(".")) {
      const jwt = decodeJwtPayloadSafe(decoded);
      if (jwt) {
        const hit = scanObjectForUserIdentity(jwt, siteRegistrableDomain);
        if (hit.email) return { identity: hit.email, kind: "email", source: `cookie-jwt:${name}` };
        if (!bestHandle && hit.handle) bestHandle = hit.handle;
      }
    }
    if (decoded.startsWith("{") && decoded.endsWith("}")) {
      try {
        const parsed = JSON.parse(decoded);
        const hit = scanObjectForUserIdentity(parsed, siteRegistrableDomain);
        if (hit.email) return { identity: hit.email, kind: "email", source: `cookie-json:${name}` };
        if (!bestHandle && hit.handle) bestHandle = hit.handle;
      } catch {
        /* ignore */
      }
    }
    if (/email|user|account|login/i.test(name)) {
      const email = extractFirstValidEmailFromText(decoded, siteRegistrableDomain);
      if (email) return { identity: email, kind: "email", source: `cookie:${name}` };
    }
  }

  if (bestHandle) {
    return { identity: bestHandle, kind: "handle", source: "storage-handle" };
  }
  if (storageIdentity?.uid) {
    return {
      identity: `UID ${String(storageIdentity.uid).trim().slice(0, 18)}`,
      kind: "uid",
      source: "spa-auth-uid",
    };
  }
  return { identity: "", kind: "", source: "" };
}

function inspectTabDomAndStorageScript() {
  const out = {
    title: "",
    domEmails: [],
    storageMap: {},
    stateJsonEmails: [],
  };
  try {
    out.title = String(document.title || "").slice(0, 300);
  } catch {
    /* ignore */
  }

  const emailRe = /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;
  const seenEmails = new Set();
  const pushEmails = (text, target) => {
    if (!text || typeof text !== "string" || !text.includes("@")) return;
    const matches = text.match(emailRe);
    if (!matches) return;
    for (const m of matches) {
      const lower = m.toLowerCase();
      if (!seenEmails.has(lower) && target.length < 25) {
        seenEmails.add(lower);
        target.push(lower);
      }
    }
  };

  try {
    pushEmails(out.title, out.domEmails);
    const selectors = [
      "[data-email]",
      "[data-user-email]",
      "[aria-label*='@']",
      "[title*='@']",
      "header",
      "nav",
      "[class*='profile' i]",
      "[class*='account' i]",
      "[class*='avatar' i]",
      "[class*='user' i]",
      "[class*='member' i]",
    ];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      for (let i = 0; i < Math.min(nodes.length, 20); i += 1) {
        const el = nodes[i];
        if (el.closest && el.closest("footer")) continue;
        pushEmails(el.getAttribute?.("data-email") || "", out.domEmails);
        pushEmails(el.getAttribute?.("data-user-email") || "", out.domEmails);
        pushEmails(el.getAttribute?.("aria-label") || "", out.domEmails);
        pushEmails(el.getAttribute?.("title") || "", out.domEmails);
        const text = String(el.textContent || "").trim();
        if (text && text.length <= 400) {
          pushEmails(text, out.domEmails);
        }
      }
      if (out.domEmails.length >= 12) break;
    }
  } catch {
    /* ignore DOM read errors */
  }

  try {
    const stateScripts = [
      document.getElementById("__NEXT_DATA__"),
      document.getElementById("__NUXT_DATA__"),
    ].filter(Boolean);
    for (const sc of stateScripts) {
      const raw = String(sc.textContent || "").slice(0, 120_000);
      pushEmails(raw, out.stateJsonEmails);
    }
    if (out.domEmails.length === 0 && out.stateJsonEmails.length === 0) {
      const inlineScripts = document.querySelectorAll("script:not([src])");
      for (let i = 0; i < Math.min(inlineScripts.length, 30); i += 1) {
        const raw = String(inlineScripts[i]?.textContent || "");
        if (
          raw.length > 0 &&
          raw.includes("@") &&
          (/__next_f|WIZ_global_data|AF_initDataCallback|"email"|\\"email\\"/i.test(raw))
        ) {
          pushEmails(raw.slice(0, 80_000), out.stateJsonEmails);
          if (out.stateJsonEmails.length >= 12) break;
        }
      }
    }
  } catch {
    /* ignore */
  }

  const collectWebStorage = (store, prefix) => {
    try {
      if (!store) return;
      const count = Math.min(store.length, 150);
      for (let i = 0; i < count; i += 1) {
        const key = store.key(i);
        if (!key) continue;
        const val = store.getItem(key);
        if (typeof val === "string" && val.length > 0 && val.length <= 48_000) {
          out.storageMap[`${prefix}:${key}`] = val;
        }
      }
    } catch {
      /* ignore cross-origin / disabled storage */
    }
  };
  collectWebStorage(window.localStorage, "ls");
  collectWebStorage(window.sessionStorage, "ss");
  return out;
}

/**
 * Detect the logged-in account identity (`email`, `@handle`, or `UID ...`) on the active website tab.
 */
export async function detectActiveTabAccountIdentity({
  tab,
  domain,
  registrableDomain = "",
  cookies = [],
  storage = null,
  scriptingApi = globalThis.chrome?.scripting,
} = {}) {
  const siteRoot =
    registrableDomain || extractRegistrableDomain(domain) || normalizeDomainHost(domain);

  // 1. Check already-captured SPA storage + cookies first
  const initialHit = extractAccountFromCookiesAndStorage({
    cookies,
    storage,
    siteRegistrableDomain: siteRoot,
  });
  if (initialHit.kind === "email" && initialHit.identity) {
    return initialHit;
  }

  // 2. Inspect active tab DOM + full localStorage/sessionStorage (read-only, 1500ms budget)
  if (typeof tab?.id === "number" && scriptingApi?.executeScript) {
    const execRes = await withTimeout(
      scriptingApi.executeScript({
        target: { tabId: tab.id },
        func: inspectTabDomAndStorageScript,
      }),
      1500,
      null,
    );
    const probe = execRes?.[0]?.result ?? null;
    if (probe && typeof probe === "object") {
      if (probe.storageMap && Object.keys(probe.storageMap).length > 0) {
        const storageProbeHit = extractAccountFromCookiesAndStorage({
          cookies: [],
          storage: { localStorage: probe.storageMap },
          siteRegistrableDomain: siteRoot,
        });
        if (storageProbeHit.kind === "email" && storageProbeHit.identity) {
          return storageProbeHit;
        }
        if (!initialHit.identity && storageProbeHit.identity) {
          initialHit.identity = storageProbeHit.identity;
          initialHit.kind = storageProbeHit.kind;
          initialHit.source = storageProbeHit.source;
        }
      }
      for (const candidate of [
        ...(Array.isArray(probe.domEmails) ? probe.domEmails : []),
        ...(Array.isArray(probe.stateJsonEmails) ? probe.stateJsonEmails : []),
      ]) {
        if (isLikelyUserAccountEmail(candidate, siteRoot)) {
          return {
            identity: candidate.toLowerCase(),
            kind: "email",
            source: "tab-dom",
          };
        }
      }
    }
  }

  // 3. Check tab title directly (useful when scripting was blocked or title holds email)
  const titleEmail = extractFirstValidEmailFromText(tab?.title || "", siteRoot);
  if (titleEmail) {
    return { identity: titleEmail, kind: "email", source: "tab-title" };
  }

  // 4. Platform-specific cookie UID / @handle fallback (e.g. Facebook UID, GitHub @handle)
  const hintInfo = extractSiteSessionIdentityHint(domain, cookies, storage);
  if (
    hintInfo?.sessionHint &&
    hintInfo.sessionHint !== "Signed in" &&
    !/^ID\s+/i.test(hintInfo.sessionHint)
  ) {
    return {
      identity: hintInfo.sessionHint,
      kind: "session-hint",
      source: "cookie-hint",
    };
  }

  if (initialHit.identity) {
    return initialHit;
  }

  return { identity: "", kind: "", source: "" };
}

/**
 * Format the standard E0001 / P0020 route title (`<Platform> - <account>` or `<Platform> - <host>`).
 */
export function buildAutoSessionRouteTitle(platformLabel = "", host = "", accountIdentity = "") {
  const cleanPlatform = String(platformLabel || "").trim() || String(host || "").replace(/^\./, "");
  const cleanAccount = String(accountIdentity || "").trim();
  if (cleanAccount) {
    return `${cleanPlatform} - ${cleanAccount}`.slice(0, 140);
  }
  const cleanHost = String(host || "")
    .trim()
    .replace(/^www\./i, "")
    .replace(/^\./, "");
  if (cleanHost && cleanHost.toLowerCase() !== cleanPlatform.toLowerCase()) {
    return `${cleanPlatform} - ${cleanHost}`.slice(0, 140);
  }
  return cleanPlatform.slice(0, 140);
}

function slugifyRouteTitle(title = "", syncId = "") {
  const base = String(title || "route")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = String(syncId || "")
    .replace(/^TM-/i, "")
    .toLowerCase()
    .slice(0, 6);
  return `${base || "route"}-${suffix || Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Check if a writable route already exists for `(canonicalDomain, accountIdentity)` so clicking `New`
 * updates the matching route instead of creating duplicate rows.
 */
export function findMatchingWritableBinding({
  bindings = [],
  bindingStatus = {},
  canonicalDomain = "",
  accountIdentity = "",
  host = "",
  platformLabel = "",
  canSyncFn = () => true,
} = {}) {
  const targetEff = effectiveCookieDomain(canonicalDomain);
  if (!targetEff) return null;
  const targetOsidApp = resolveGoogleOsidApp(canonicalDomain);
  const candidates = (Array.isArray(bindings) ? bindings : []).filter(
    (b) =>
      b?.noteId?.trim() &&
      b?.domain?.trim() &&
      (effectiveCookieDomain(b.domain) === targetEff ||
        (targetOsidApp && resolveGoogleOsidApp(b.domain)?.id === targetOsidApp.id)) &&
      canSyncFn(b),
  );
  if (!candidates.length) return null;

  const cleanAccount = String(accountIdentity || "").trim().toLowerCase();
  if (cleanAccount) {
    return (
      candidates.find((b) => {
        const title = String(b.noteTitle || "").toLowerCase();
        if (title.includes(cleanAccount)) return true;
        const key = bindingRouteKey(b);
        const st = bindingStatus?.[key] ?? bindingStatus?.[b.noteId] ?? {};
        const stEmail = String(st?.storageEmail || "").trim().toLowerCase();
        if (stEmail && stEmail === cleanAccount) return true;
        const stUid = String(st?.storageUid || "").trim().toLowerCase();
        if (stUid && cleanAccount === `uid ${stUid}`) return true;
        return false;
      }) || null
    );
  }

  const genericTitles = new Set(
    [
      buildAutoSessionRouteTitle(platformLabel, host, "").toLowerCase(),
      String(platformLabel || "").trim().toLowerCase(),
      String(host || "").trim().toLowerCase(),
    ].filter(Boolean),
  );
  return (
    candidates.find((b) => genericTitles.has(String(b.noteTitle || "").trim().toLowerCase())) ||
    null
  );
}

/**
 * Create a new `notes` + `cookie_bridge_routes` pair on Data Box Cloud (`sb-api`).
 */
export async function createCloudSessionRoute({
  auth,
  canonicalDomain,
  noteTitle,
  browserId = "",
  fetchFn = globalThis.fetch,
} = {}) {
  if (!auth?.supabase_url || !auth?.supabase_anon_key || !auth?.access_token || isJwtExpired(auth)) {
    throw new Error("Data Box session is not ready. Please sign in first.");
  }
  const userId = authUserId(auth) || String(auth.user_id || "").trim();
  if (!userId) {
    throw new Error("Missing authenticated user_id for route creation.");
  }

  const base = String(auth.supabase_url).replace(/\/$/, "");
  const syncId = `TM-${crypto.randomUUID().slice(0, 8)}`;
  const slug = slugifyRouteTitle(noteTitle, syncId);

  const noteRes = await fetchFn(`${base}/rest/v1/notes`, {
    method: "POST",
    headers: userHeaders(auth, {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify({
      user_id: userId,
      title: noteTitle,
      slug,
      domain: canonicalDomain,
      body_md: "",
      sync_id: syncId,
    }),
  });
  const noteText = await noteRes.text();
  if (!noteRes.ok) {
    throw new Error(`Create note failed (${noteRes.status}): ${parseApiErrorBody(noteText)}`);
  }
  const noteRows = JSON.parse(noteText || "[]");
  const createdNote = Array.isArray(noteRows) ? noteRows[0] : noteRows;
  const noteId = String(createdNote?.id || "").trim();
  const finalSyncId = String(createdNote?.sync_id || syncId).trim();
  if (!noteId) {
    throw new Error("Create note succeeded without returning note id.");
  }

  const lockSource = isFacebookDomain(canonicalDomain) && Boolean(browserId);
  const routePayload = {
    user_id: userId,
    note_id: noteId,
    sync_id: finalSyncId,
    domain: canonicalDomain,
    note_title: noteTitle,
    enabled: true,
    ...(lockSource
      ? {
          source_browser_id: browserId,
          source_locked_at: new Date().toISOString(),
        }
      : {}),
  };

  const routeRes = await fetchFn(
    `${base}/rest/v1/cookie_bridge_routes?on_conflict=user_id,note_id,domain`,
    {
      method: "POST",
      headers: userHeaders(auth, {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify(routePayload),
    },
  );
  const routeText = await routeRes.text();
  if (!routeRes.ok) {
    throw new Error(`Create route failed (${routeRes.status}): ${parseApiErrorBody(routeText)}`);
  }

  const ownerEmail = String(auth.user_email_label || auth.user_email || "").trim() || null;
  return {
    syncId: finalSyncId,
    noteId,
    pass: "",
    domain: canonicalDomain,
    requiresPass: false,
    noteTitle,
    sourceBrowserId: lockSource ? browserId : null,
    sourceLabel: null,
    ownerUserId: userId,
    ownerUserEmail: ownerEmail,
    accessRole: "owner",
    canApply: true,
    canPublish: true,
    canManage: true,
  };
}

async function collectCookiesForRouteScope(canonicalDomain, getCookiesFn = getCookiesForDomain) {
  const scopes = relatedCookieDomains(canonicalDomain);
  const seen = new Set();
  const merged = [];
  for (const scope of scopes) {
    const list = await getCookiesFn(scope);
    for (const c of Array.isArray(list) ? list : []) {
      const key = `${c.name}\0${c.domain}\0${c.path}\0${c.partitionKey ? JSON.stringify(c.partitionKey) : ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
    }
  }
  return merged;
}

/**
 * End-to-end handler for the `+ New` button on Routes tab:
 * 1. Reads the active website tab
 * 2. Collects cookies + SPA auth storage & detects the logged-in account (`email` / `UID` / `@handle`)
 * 3. Reuses matching writable route or creates a new `notes` + `cookie_bridge_routes` entry on Cloud
 * 4. Immediately syncs cookies + SPA storage to Cloud Vault
 */
export async function createAndSyncActiveSessionRoute({
  auth,
  bindings = [],
  bindingStatus = {},
  canSyncFn = () => true,
  syncBindingFn,
  brandRegistry = COOKIE_BRAND_ICON_REGISTRY,
  tabsApi = globalThis.chrome?.tabs,
  scriptingApi = globalThis.chrome?.scripting,
  getCookiesFn = getCookiesForDomain,
  captureStorageFn = captureSiteAuthStorageForDomain,
  getBrowserIdFn = getBrowserId,
  fetchFn = globalThis.fetch,
} = {}) {
  try {
    const activeTabRes = await resolveActiveCurrentTab(tabsApi);
    if (!activeTabRes.ok) {
      return activeTabRes;
    }

    const { tab, url } = activeTabRes;
    const { canonicalDomain, host, registrableDomain, platformLabel } =
      resolveCanonicalRouteDomainAndPlatform(url, brandRegistry);

    const [cookies, storage, browserId] = await Promise.all([
      collectCookiesForRouteScope(canonicalDomain, getCookiesFn).catch(() => []),
      captureStorageFn(canonicalDomain).catch(() => null),
      getBrowserIdFn().catch(() => ""),
    ]);

    if (cookies.length === 0 && !hasNonEmptyAuthStorage(storage)) {
      return {
        ok: false,
        error: `No cookies or session storage found on ${host}. Sign in on the website first.`,
      };
    }

    const targetOsidApp = resolveGoogleOsidApp(canonicalDomain);
    if (
      (isGoogleDomain(canonicalDomain) || isGoogleOsidAppDomain(canonicalDomain)) &&
      summarizeGoogleCookieNames(cookies).hasGoogleLogin !== true
    ) {
      return {
        ok: false,
        error: targetOsidApp
          ? `${targetOsidApp.label} is not signed in on this browser. Sign in on ${targetOsidApp.primaryHost} first, then click New.`
          : `Google session is not signed in on ${host}. Sign in first, then click New.`,
      };
    }

    const detected = await detectActiveTabAccountIdentity({
      tab,
      domain: canonicalDomain,
      registrableDomain,
      cookies,
      storage,
      scriptingApi,
    });
    const accountIdentity = detected.identity || "";
    const noteTitle = buildAutoSessionRouteTitle(platformLabel, host, accountIdentity);

    const existing = findMatchingWritableBinding({
      bindings,
      bindingStatus,
      canonicalDomain,
      accountIdentity,
      host,
      platformLabel,
      canSyncFn,
    });

    const targetBinding =
      existing ||
      (await createCloudSessionRoute({
        auth,
        canonicalDomain,
        noteTitle,
        browserId,
        fetchFn,
      }));
    const created = !existing;

    const syncResult =
      typeof syncBindingFn === "function" ? await syncBindingFn(targetBinding) : { ok: true };

    return {
      ok: true,
      created,
      binding: targetBinding,
      noteTitle: targetBinding.noteTitle || noteTitle,
      canonicalDomain,
      platformLabel,
      accountIdentity,
      cookieCount: cookies.length,
      syncResult,
    };
  } catch (err) {
    return {
      ok: false,
      error: formatSyncError(err),
    };
  }
}
