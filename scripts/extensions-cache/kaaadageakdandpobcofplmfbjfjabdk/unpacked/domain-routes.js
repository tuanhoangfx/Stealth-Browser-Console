export function normalizeDomainHost(domain = "") {
  return String(domain ?? "")
    .trim()
    .replace(/^\./, "")
    .toLowerCase();
}

export function isFacebookDomain(domain = "") {
  const normalized = normalizeDomainHost(domain);
  return normalized === "facebook.com" || normalized.endsWith(".facebook.com");
}

export function isGoogleDomain(domain = "") {
  const normalized = normalizeDomainHost(domain);
  return normalized === "google.com" || normalized.endsWith(".google.com");
}

/**
 * Declarative SSOT for Google AI / Workspace standalone subdomain apps that authenticate via
 * Google master SSO (`.google.com` + `accounts.google.com` `LSID`) plus a host-only `OSID` /
 * `__Secure-OSID` cookie minted passively through `accounts.google.com/ServiceLogin?osid=1`.
 */
export const GOOGLE_OSID_APP_DOMAINS = Object.freeze([
  Object.freeze({
    id: "google-flow",
    label: "Google Flow",
    canonicalDomain: ".flow.google.com",
    primaryHost: "flow.google.com",
    osidHosts: Object.freeze(["flow.google.com"]),
    matchHosts: Object.freeze(["flow.google.com", "labs.google"]),
    relatedDomains: Object.freeze([".google.com", ".flow.google.com", ".labs.google"]),
    sessionUrl: "https://flow.google.com/?pli=1",
    marketingPaths: Object.freeze(["/about"]),
    marketingHosts: Object.freeze([]),
    preserveLegacyDomains: Object.freeze(["labs.google"]),
  }),
  Object.freeze({
    id: "google-ai-studio",
    label: "Google AI Studio",
    canonicalDomain: ".aistudio.google.com",
    primaryHost: "aistudio.google.com",
    osidHosts: Object.freeze(["aistudio.google.com"]),
    matchHosts: Object.freeze(["aistudio.google.com"]),
    relatedDomains: Object.freeze([".google.com", ".aistudio.google.com"]),
    sessionUrl: "https://aistudio.google.com/prompts/new_chat",
    marketingPaths: Object.freeze(["/welcome"]),
    marketingHosts: Object.freeze([]),
    preserveLegacyDomains: Object.freeze([]),
  }),
  Object.freeze({
    id: "notebooklm",
    label: "NotebookLM",
    canonicalDomain: ".notebooklm.google.com",
    primaryHost: "notebooklm.google.com",
    osidHosts: Object.freeze(["notebooklm.google.com", "notebook.google.com"]),
    matchHosts: Object.freeze([
      "notebooklm.google.com",
      "notebook.google.com",
      "notebooklm.google",
      "notebook.google",
    ]),
    relatedDomains: Object.freeze([
      ".google.com",
      ".notebooklm.google.com",
      ".notebook.google.com",
      ".notebooklm.google",
      ".notebook.google",
    ]),
    sessionUrl: "https://notebooklm.google.com/?pli=1",
    marketingPaths: Object.freeze(["/about"]),
    marketingHosts: Object.freeze(["notebooklm.google", "notebook.google"]),
    preserveLegacyDomains: Object.freeze([]),
  }),
  Object.freeze({
    id: "firebase-studio",
    label: "Firebase Studio",
    canonicalDomain: ".studio.firebase.google.com",
    primaryHost: "studio.firebase.google.com",
    osidHosts: Object.freeze(["studio.firebase.google.com", "idx.google.com"]),
    matchHosts: Object.freeze([
      "studio.firebase.google.com",
      "idx.google.com",
      "firebase.studio",
    ]),
    relatedDomains: Object.freeze([
      ".google.com",
      ".firebase.google.com",
      ".studio.firebase.google.com",
      ".idx.google.com",
      ".firebase.studio",
    ]),
    sessionUrl: "https://studio.firebase.google.com/?pli=1",
    marketingPaths: Object.freeze([]),
    marketingHosts: Object.freeze(["firebase.studio"]),
    preserveLegacyDomains: Object.freeze([]),
  }),
]);

function hostMatchesEntry(host, candidates) {
  if (!host) return false;
  return candidates.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

/** Resolve Google Subdomain OSID app descriptor by URL or cookie domain (`null` if none). */
export function resolveGoogleOsidApp(urlOrDomain = "") {
  const raw = String(urlOrDomain ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const urlHost = parsed.hostname.replace(/^www\./i, "").toLowerCase();
      const urlPath = parsed.pathname.toLowerCase();
      if (urlHost === "firebase.google.com" && (urlPath === "/studio" || urlPath.startsWith("/studio/"))) {
        return GOOGLE_OSID_APP_DOMAINS.find((entry) => entry.id === "firebase-studio") ?? null;
      }
    } catch {
      /* fall through to host match */
    }
  }
  const host = (extractHostnameFromUrlOrDomain(raw) || normalizeDomainHost(raw)).replace(/^www\./i, "");
  if (!host) return null;
  return GOOGLE_OSID_APP_DOMAINS.find((entry) => hostMatchesEntry(host, entry.matchHosts)) ?? null;
}

export function isGoogleOsidAppDomain(domain = "") {
  return Boolean(resolveGoogleOsidApp(domain));
}

/** Google Flow (`flow.google.com` / `labs.google`) uses Google SSO + host-only `OSID` on `flow.google.com`. */
export function isGoogleFlowDomain(domain = "") {
  return resolveGoogleOsidApp(domain)?.id === "google-flow";
}

/** Claude/Anthropic auth cookies live on `.claude.ai` / `.anthropic.com`, not marketing `.claude.com`. */
export function isClaudeFamilyDomain(domain = "") {
  const normalized = normalizeDomainHost(domain);
  if (!normalized) return false;
  return (
    normalized === "claude.com" ||
    normalized.endsWith(".claude.com") ||
    normalized === "claude.ai" ||
    normalized.endsWith(".claude.ai") ||
    normalized === "anthropic.com" ||
    normalized.endsWith(".anthropic.com")
  );
}

/** ElevenLabs uses Firebase Auth (`firebaseLocalStorageDb` IndexedDB) on `elevenlabs.io/app`. */
export function isElevenLabsDomain(domain = "") {
  const normalized = normalizeDomainHost(domain);
  return normalized === "elevenlabs.io" || normalized.endsWith(".elevenlabs.io");
}

const SPA_STORAGE_AUTH_DOMAINS = Object.freeze([
  "elevenlabs.io",
  ...GOOGLE_OSID_APP_DOMAINS.flatMap((entry) => entry.matchHosts),
  "leonardo.ai",
  "runwayml.com",
  "topview.ai",
  "vidiq.com",
  "higgsfield.ai",
  "suno.com",
  "discord.com",
  "capsolver.com",
  "adobe.com",
  "sync.so",
]);

/**
 * True when a site relies on Web Storage / IndexedDB (`firebaseLocalStorageDb`, Clerk/Auth0/IMS localStorage)
 * in addition to or instead of HTTP cookies.
 */
export function isSpaStorageAuthDomain(domain = "") {
  const normalized = normalizeDomainHost(domain);
  if (!normalized) return false;
  return SPA_STORAGE_AUTH_DOMAINS.some(
    (base) => normalized === base || normalized.endsWith(`.${base}`),
  );
}

/**
 * Related hosts to query/clear when Sync/Load a route (union into one vault payload).
 * Google Subdomain OSID apps union `.google.com` SSO + their `OSID` host(s); Claude expands across sibling auth hosts.
 */
export function relatedCookieDomains(domain = "") {
  const osidApp = resolveGoogleOsidApp(domain);
  if (osidApp) return [...osidApp.relatedDomains];
  const scope = effectiveCookieDomain(domain);
  if (!scope) return [];
  if (isClaudeFamilyDomain(scope)) return [".claude.ai", ".claude.com", ".anthropic.com"];
  return [scope];
}

/** Cookie jar read/write scope — Gmail routes may be `.mail.google.com` but cookies live on `.google.com`. */
export function effectiveCookieDomain(domain = "") {
  const osidApp = resolveGoogleOsidApp(domain);
  if (osidApp) {
    const norm = normalizeDomainHost(domain);
    const legacy = osidApp.preserveLegacyDomains.find(
      (candidate) => norm === candidate || norm.endsWith(`.${candidate}`),
    );
    return legacy ? `.${legacy}` : osidApp.canonicalDomain;
  }
  if (isGoogleDomain(domain)) return ".google.com";
  const normalized = normalizeDomainHost(domain);
  if (!normalized) return String(domain ?? "").trim();
  return domain.trim().startsWith(".") ? domain.trim() : `.${normalized}`;
}

/** Marketing / logged-out landing pages — not valid cookie-apply context for Gmail or Google OSID apps. */
export function isGoogleMarketingUrl(url = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "workspace.google.com") return true;
    const path = parsed.pathname.toLowerCase();
    if (host === "google.com" && path.includes("/gmail")) return true;
    if (host === "firebase.google.com" && (path === "/studio" || path.startsWith("/studio/"))) return true;
    const osidApp = resolveGoogleOsidApp(url);
    if (osidApp) {
      if (hostMatchesEntry(host, osidApp.marketingHosts)) return true;
      if (
        osidApp.marketingPaths.some(
          (marketingPath) => path === marketingPath || path.startsWith(`${marketingPath}/`),
        )
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function isGoogleAuthContextUrl(url = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "mail.google.com" || host === "accounts.google.com") return true;
    if (resolveGoogleOsidApp(url) && !isGoogleMarketingUrl(url)) return true;
    return false;
  } catch {
    return false;
  }
}

export function urlMatchesCookieDomain(url, domain) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (isClaudeFamilyDomain(domain) && isClaudeFamilyDomain(host)) return true;
    const targetOsidApp = resolveGoogleOsidApp(domain);
    if (targetOsidApp) {
      const urlOsidApp = resolveGoogleOsidApp(url);
      if (urlOsidApp?.id === targetOsidApp.id || isGoogleDomain(host)) return true;
    }
    const base = normalizeDomainHost(domain);
    if (!base) return false;
    return host === base || host.endsWith(`.${base}`);
  } catch {
    return false;
  }
}

/** Tab eligible for Google load/lock — excludes workspace marketing URLs. */
export function tabMatchesRoute(url, domain) {
  if (!url || !urlMatchesCookieDomain(url, domain)) return false;
  if ((isGoogleDomain(domain) || isGoogleOsidAppDomain(domain)) && isGoogleMarketingUrl(url)) return false;
  return true;
}

/** Gmail inbox URL — avoid workspace.google.com redirect when session cookies apply. */
export function googleMailInboxUrl() {
  return "https://mail.google.com/mail/u/0/";
}

/** Authenticated workspace URL for any Google Subdomain OSID app (`flow`, `aistudio`, `notebooklm`, `studio.firebase`). */
export function googleOsidSessionUrl(domain = ".flow.google.com") {
  const app = resolveGoogleOsidApp(domain);
  return app ? app.sessionUrl : "https://flow.google.com/?pli=1";
}

/**
 * Passive Google ServiceLogin URL that mints a host-only `OSID` cookie for the target Google Subdomain app
 * from an existing `.google.com` + `accounts.google.com` session and redirects into its workspace.
 */
export function googleOsidPassiveLoginUrl(domain = ".flow.google.com") {
  const sessionUrl = googleOsidSessionUrl(domain);
  const encoded = encodeURIComponent(sessionUrl);
  return `https://accounts.google.com/ServiceLogin?passive=1209600&osid=1&continue=${encoded}&followup=${encoded}`;
}

/** Google Flow authenticated studio workspace URL. */
export function googleFlowSessionUrl() {
  return googleOsidSessionUrl(".flow.google.com");
}

/** Passive Google ServiceLogin URL for Google Flow (`flow.google.com`). */
export function googleFlowPassiveLoginUrl() {
  return googleOsidPassiveLoginUrl(".flow.google.com");
}

/** Claude chat session lives on claude.ai (sessionKey), not claude.com marketing. */
export function claudeSessionUrl() {
  return "https://claude.ai/";
}

/** ElevenLabs authenticated workspace entry URL (avoids marketing `/` or `/app/sign-in`). */
export function elevenLabsSessionUrl() {
  return "https://elevenlabs.io/app";
}

/** Entry URL when Load/open-site needs a browser context for cookie writes. */
export function siteUrlForDomain(domain) {
  const host = normalizeDomainHost(domain);
  if (!host) return "about:blank";
  if (isFacebookDomain(host)) return "https://www.facebook.com/";
  const osidApp = resolveGoogleOsidApp(domain);
  if (osidApp) return osidApp.sessionUrl;
  if (isGoogleDomain(host)) return googleMailInboxUrl();
  if (isClaudeFamilyDomain(host)) return claudeSessionUrl();
  if (isElevenLabsDomain(host)) return elevenLabsSessionUrl();
  return `https://${host}/`;
}

/** Hostname shown in Load/Sync toasts (no leading dot). */
export function openSiteHintHost(domain = "") {
  try {
    return new URL(siteUrlForDomain(domain)).hostname;
  } catch {
    return normalizeDomainHost(domain) || "the site";
  }
}

/** Google routes must land on mail/accounts/Google AI workspace — not workspace or marketing tabs. */
export function shouldForceNavigateGoogleTab(url = "", domain = "") {
  if (isGoogleOsidAppDomain(domain)) return shouldForceNavigateGoogleOsidTab(url, domain);
  if (!isGoogleDomain(domain)) return false;
  if (!url || !tabMatchesRoute(url, domain)) return true;
  return !isGoogleAuthContextUrl(url);
}

/** Google OSID app tabs on marketing landing pages (`/about`, `/welcome`, `firebase.studio`) or `accounts.google.com` must navigate into workspace. */
export function shouldForceNavigateGoogleOsidTab(url = "", domain = "") {
  const app = resolveGoogleOsidApp(domain) || resolveGoogleOsidApp(url);
  if (!app) return false;
  if (!url) return true;
  if (isGoogleMarketingUrl(url)) return true;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    return !hostMatchesEntry(host, app.osidHosts);
  } catch {
    return true;
  }
}

/** Backward-compatible alias for Google Flow tab force-navigation. */
export function shouldForceNavigateGoogleFlowTab(url = "", domain = "") {
  const app = resolveGoogleOsidApp(domain) || resolveGoogleOsidApp(url);
  if (!app || app.id !== "google-flow") return false;
  return shouldForceNavigateGoogleOsidTab(url, ".flow.google.com");
}

/** True when cookie list already includes the host-only `OSID` / `__Secure-OSID` cookie for the target Google OSID app. */
export function hasGoogleOsidCookieForDomain(cookies = [], domain = ".flow.google.com") {
  const app = resolveGoogleOsidApp(domain);
  if (!app) return false;
  return (Array.isArray(cookies) ? cookies : []).some((c) => {
    const name = String(c?.name ?? "").trim();
    const dom = normalizeDomainHost(c?.domain ?? "");
    return (name === "OSID" || name === "__Secure-OSID") && hostMatchesEntry(dom, app.osidHosts);
  });
}

/** Backward-compatible alias for Google Flow `OSID` check. */
export function hasGoogleFlowOsidCookie(cookies = []) {
  return hasGoogleOsidCookieForDomain(cookies, ".flow.google.com");
}

/** ElevenLabs tabs on `/app/sign-in`, `/app/sign-up`, or marketing `/` should navigate to `/app` after Load. */
export function shouldForceNavigateElevenLabsTab(url = "", domain = "") {
  if (!isElevenLabsDomain(domain)) return false;
  if (!url || !tabMatchesRoute(url, domain)) return true;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (path === "/" || path === "") return true;
    if (path.startsWith("/app/sign-in") || path.startsWith("/app/sign-up") || path.startsWith("/sign-in") || path.startsWith("/sign-up")) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** Extra hosts to try for chrome.cookies.set (mirrors Facebook multi-host retries). */
export function extraSetHostsForCookieHost(host = "") {
  const normalized = normalizeDomainHost(host);
  const hosts = new Set();
  if (isFacebookDomain(normalized)) {
    hosts.add("facebook.com");
    hosts.add("www.facebook.com");
    hosts.add("m.facebook.com");
  }
  if (isGoogleDomain(normalized) || isGoogleOsidAppDomain(normalized)) {
    hosts.add("google.com");
    hosts.add("www.google.com");
    hosts.add("mail.google.com");
    hosts.add("accounts.google.com");
    hosts.add("myaccount.google.com");
    hosts.add("one.google.com");
    for (const entry of GOOGLE_OSID_APP_DOMAINS) {
      for (const h of entry.matchHosts) hosts.add(h);
    }
  }
  if (isClaudeFamilyDomain(normalized)) {
    hosts.add("claude.ai");
    hosts.add("www.claude.ai");
    hosts.add("claude.com");
    hosts.add("www.claude.com");
    hosts.add("anthropic.com");
    hosts.add("console.anthropic.com");
  }
  return hosts;
}

/** Extra URL queries for chrome.cookies.getAll when syncing Google / Google OSID apps / Claude routes. */
export function extraCookieQueryUrls(base = "") {
  const scope = effectiveCookieDomain(base);
  if (
    isGoogleDomain(scope) ||
    isGoogleOsidAppDomain(scope) ||
    isGoogleDomain(base) ||
    isGoogleOsidAppDomain(base)
  ) {
    const osidUrls = GOOGLE_OSID_APP_DOMAINS.flatMap((entry) =>
      entry.matchHosts.map((h) => `https://${h}/`),
    );
    return [
      ...new Set([
        ...osidUrls,
        "https://mail.google.com/",
        "https://accounts.google.com/",
        "https://myaccount.google.com/",
        "https://one.google.com/",
        "https://www.google.com/",
        "https://google.com/",
      ]),
    ];
  }
  if (isClaudeFamilyDomain(scope)) {
    return [
      "https://claude.ai/",
      "https://www.claude.ai/",
      "https://claude.com/",
      "https://www.claude.com/",
      "https://console.anthropic.com/",
      "https://anthropic.com/",
    ];
  }
  return [];
}

export const GOOGLE_LOGIN_COOKIE_NAMES = Object.freeze([
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "OSID",
  "__Secure-OSID",
]);

export function summarizeGoogleCookieNames(cookies) {
  const names = (Array.isArray(cookies) ? cookies : [])
    .map((c) => String(c?.name ?? "").trim())
    .filter(Boolean);
  const uniqueNames = [...new Set(names)].sort();
  const nameSet = new Set(uniqueNames);
  const keyNames = GOOGLE_LOGIN_COOKIE_NAMES.filter((name) => nameSet.has(name));
  return {
    count: uniqueNames.length,
    keyNames,
    hasGoogleLogin: nameSet.has("SID") && (nameSet.has("HSID") || nameSet.has("SSID")),
    missingGoogleLogin: ["SID", "HSID"].filter((name) => !nameSet.has(name)),
    names: uniqueNames.slice(0, 40),
  };
}

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.vn",
  "io.vn",
  "net.vn",
  "org.vn",
  "edu.vn",
  "gov.vn",
  "info.vn",
  "biz.vn",
  "name.vn",
  "pro.vn",
  "health.vn",
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "co.jp",
  "ne.jp",
  "or.jp",
  "co.kr",
  "or.kr",
  "com.br",
  "com.sg",
  "com.my",
  "com.ph",
  "co.id",
  "co.th",
  "co.in",
  "com.tw",
  "com.hk",
  "com.mx",
  "co.nz",
  "co.za",
]);

export function extractHostnameFromUrlOrDomain(raw = "") {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
    try {
      const parsed = new URL(text);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.hostname.replace(/^\.+/, "").toLowerCase();
    } catch {
      return "";
    }
  }
  const withoutPath = text.split(/[/?#]/)[0] ?? text;
  const withoutPort = withoutPath.replace(/:\d+$/, "");
  return withoutPort.replace(/^\.+/, "").toLowerCase();
}

export function extractRegistrableDomain(raw = "") {
  const host = extractHostnameFromUrlOrDomain(raw).replace(/^www\./, "");
  if (!host) return "";
  if (host === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    return host;
  }
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

const ADOBE_FAMILY_DOMAINS = Object.freeze([
  ".adobe.com",
  ".adobelogin.com",
  ".adobe.io",
  ".acrobat.com",
  ".photoshop.com",
  ".behance.net",
  ".typekit.com",
  ".frame.io",
]);

const MICROSOFT_OUTLOOK_FAMILY_DOMAINS = Object.freeze([
  ".outlook.com",
  ".live.com",
  ".hotmail.com",
  ".office.com",
  ".office365.com",
  ".microsoft.com",
  ".microsoftonline.com",
  ".msauth.net",
  ".msftauth.net",
  ".sfx.ms",
  ".msn.com",
  ".onenote.com",
  ".sharepoint.com",
]);

const OPENAI_FAMILY_DOMAINS = Object.freeze([
  ".chatgpt.com",
  ".openai.com",
  ".oaistatic.com",
  ".oaiusercontent.com",
]);

const GOOGLE_CLEAR_FAMILY_DOMAINS = Object.freeze([
  ".google.com",
  ...GOOGLE_OSID_APP_DOMAINS.flatMap((entry) => entry.relatedDomains),
  ".gmail.com",
  ".youtube.com",
  ".googleapis.com",
  ".googleusercontent.com",
  ".gstatic.com",
]);

const FACEBOOK_CLEAR_FAMILY_DOMAINS = Object.freeze([
  ".facebook.com",
  ".fb.com",
  ".messenger.com",
]);

function hostMatchesDomainList(host, domainList) {
  const normalized = normalizeDomainHost(host);
  if (!normalized) return false;
  return domainList.some((entry) => {
    const base = normalizeDomainHost(entry);
    return normalized === base || normalized.endsWith(`.${base}`);
  });
}

export function isAdobeFamilyDomain(domain = "") {
  const host = extractHostnameFromUrlOrDomain(domain);
  return hostMatchesDomainList(host, ADOBE_FAMILY_DOMAINS);
}

export function isMicrosoftOutlookFamilyDomain(domain = "") {
  const host = extractHostnameFromUrlOrDomain(domain);
  return hostMatchesDomainList(host, MICROSOFT_OUTLOOK_FAMILY_DOMAINS);
}

export function isOpenAiFamilyDomain(domain = "") {
  const host = extractHostnameFromUrlOrDomain(domain);
  return hostMatchesDomainList(host, OPENAI_FAMILY_DOMAINS);
}

/**
 * Resolve all cookie domain scopes to wipe when clearing the current site's cookies
 * (e.g. Adobe.com + adobelogin.com, Outlook.com + live.com + microsoftonline.com + office.com, etc.).
 */
export function resolveSiteClearCookieDomains(urlOrDomain = "") {
  const host = extractHostnameFromUrlOrDomain(urlOrDomain);
  const baseDomain = extractRegistrableDomain(host);
  if (!host && !baseDomain) return [];

  const scopes = new Set();
  const addScope = (d) => {
    const clean = normalizeDomainHost(d);
    if (!clean) return;
    if (clean === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(clean)) {
      scopes.add(clean);
    } else {
      scopes.add(`.${clean}`);
    }
  };

  if (baseDomain) addScope(baseDomain);
  if (host && host.replace(/^www\./, "") !== baseDomain) {
    addScope(host.replace(/^www\./, ""));
  }

  if (isAdobeFamilyDomain(host)) {
    for (const d of ADOBE_FAMILY_DOMAINS) addScope(d);
  } else if (isMicrosoftOutlookFamilyDomain(host)) {
    for (const d of MICROSOFT_OUTLOOK_FAMILY_DOMAINS) addScope(d);
  } else if (isClaudeFamilyDomain(host)) {
    for (const d of [".claude.ai", ".claude.com", ".anthropic.com"]) addScope(d);
  } else if (isOpenAiFamilyDomain(host)) {
    for (const d of OPENAI_FAMILY_DOMAINS) addScope(d);
  } else if (
    isGoogleDomain(host) ||
    isGoogleOsidAppDomain(host) ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "gmail.com" ||
    host.endsWith(".gmail.com")
  ) {
    for (const d of GOOGLE_CLEAR_FAMILY_DOMAINS) addScope(d);
  } else if (isFacebookDomain(host) || host === "messenger.com" || host.endsWith(".messenger.com") || host === "fb.com" || host.endsWith(".fb.com")) {
    for (const d of FACEBOOK_CLEAR_FAMILY_DOMAINS) addScope(d);
  }

  return [...scopes];
}

export function describeSiteClearTarget(urlOrDomain = "") {
  const host = extractHostnameFromUrlOrDomain(urlOrDomain);
  const baseDomain = extractRegistrableDomain(host);
  const scopes = resolveSiteClearCookieDomains(urlOrDomain);
  let familyLabel = "";
  if (isAdobeFamilyDomain(host)) familyLabel = "Adobe SSO";
  else if (isMicrosoftOutlookFamilyDomain(host)) familyLabel = "Outlook / Microsoft SSO";
  else if (isClaudeFamilyDomain(host)) familyLabel = "Claude / Anthropic SSO";
  else if (isOpenAiFamilyDomain(host)) familyLabel = "ChatGPT / OpenAI SSO";
  else if (isGoogleDomain(host) || isGoogleOsidAppDomain(host) || host === "youtube.com" || host.endsWith(".youtube.com")) familyLabel = "Google SSO";
  else if (isFacebookDomain(host)) familyLabel = "Meta / Facebook SSO";

  const cleanHost = host.replace(/^www\./, "");
  const displayDomain =
    !cleanHost
      ? ""
      : cleanHost === baseDomain
        ? baseDomain
        : `${cleanHost} (${baseDomain})`;

  return {
    host: cleanHost,
    baseDomain,
    registrableDomain: baseDomain,
    displayDomain: displayDomain || baseDomain || cleanHost,
    familyLabel,
    scopes,
  };
}

