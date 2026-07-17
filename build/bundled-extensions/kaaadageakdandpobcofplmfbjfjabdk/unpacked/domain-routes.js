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

/**
 * Related hosts to query/clear when Sync/Load a route (union into one vault payload).
 * Google stays single-scope via effectiveCookieDomain; Claude expands across sibling auth hosts.
 */
export function relatedCookieDomains(domain = "") {
  const scope = effectiveCookieDomain(domain);
  if (!scope) return [];
  if (!isClaudeFamilyDomain(scope)) return [scope];
  return [".claude.ai", ".claude.com", ".anthropic.com"];
}

/** Cookie jar read/write scope — Gmail routes may be `.mail.google.com` but cookies live on `.google.com`. */
export function effectiveCookieDomain(domain = "") {
  if (isGoogleDomain(domain)) return ".google.com";
  const normalized = normalizeDomainHost(domain);
  if (!normalized) return String(domain ?? "").trim();
  return domain.trim().startsWith(".") ? domain.trim() : `.${normalized}`;
}

/** Marketing / logged-out landing pages — not valid cookie-apply context for Gmail. */
export function isGoogleMarketingUrl(url = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "workspace.google.com") return true;
    const path = parsed.pathname.toLowerCase();
    if ((host === "www.google.com" || host === "google.com") && path.includes("/gmail")) return true;
    return false;
  } catch {
    return false;
  }
}

export function isGoogleAuthContextUrl(url = "") {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "mail.google.com" || host === "accounts.google.com";
  } catch {
    return false;
  }
}

export function urlMatchesCookieDomain(url, domain) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (isClaudeFamilyDomain(domain) && isClaudeFamilyDomain(host)) return true;
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
  if (isGoogleDomain(domain) && isGoogleMarketingUrl(url)) return false;
  return true;
}

/** Gmail inbox URL — avoid workspace.google.com redirect when session cookies apply. */
export function googleMailInboxUrl() {
  return "https://mail.google.com/mail/u/0/";
}

/** Claude chat session lives on claude.ai (sessionKey), not claude.com marketing. */
export function claudeSessionUrl() {
  return "https://claude.ai/";
}

/** Entry URL when Load/open-site needs a browser context for cookie writes. */
export function siteUrlForDomain(domain) {
  const host = normalizeDomainHost(domain);
  if (!host) return "about:blank";
  if (isFacebookDomain(host)) return "https://www.facebook.com/";
  if (isGoogleDomain(host)) return googleMailInboxUrl();
  if (isClaudeFamilyDomain(host)) return claudeSessionUrl();
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

/** Google routes must land on mail/accounts — not workspace marketing tabs. */
export function shouldForceNavigateGoogleTab(url = "", domain = "") {
  if (!isGoogleDomain(domain)) return false;
  if (!url || !tabMatchesRoute(url, domain)) return true;
  return !isGoogleAuthContextUrl(url);
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
  if (isGoogleDomain(normalized)) {
    hosts.add("google.com");
    hosts.add("www.google.com");
    hosts.add("mail.google.com");
    hosts.add("accounts.google.com");
    hosts.add("myaccount.google.com");
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

/** Extra URL queries for chrome.cookies.getAll when syncing Google / Claude routes. */
export function extraCookieQueryUrls(base = "") {
  const scope = effectiveCookieDomain(base);
  if (isGoogleDomain(scope)) {
    return [
      "https://mail.google.com/",
      "https://accounts.google.com/",
      "https://www.google.com/",
      "https://google.com/",
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
