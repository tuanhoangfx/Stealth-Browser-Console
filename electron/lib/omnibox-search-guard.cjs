const DEFAULT_SEARCH_URL = "https://www.google.com/search?q={searchTerms}";

/** Pages navigated by automation (startup URL, workflows) — skip omnibox guard. */
const trustedPageNavigations = new WeakSet();

function omniboxSearchGuardEnabled() {
  const raw = String(process.env.STEALTH_OMNIBOX_SEARCH_GUARD ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

function markTrustedPageNavigation(page) {
  if (page) trustedPageNavigations.add(page);
}

function clearTrustedPageNavigation(page) {
  if (page) trustedPageNavigations.delete(page);
}

function isTrustedPageNavigation(page) {
  return trustedPageNavigations.has(page);
}

function hostPart(hostname) {
  return String(hostname || "").trim().toLowerCase();
}

/** Omnibox typed `2fa` → `http://2fa/` — redirect to web search instead. */
function parseOmniboxSingleLabelNav(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;
  const host = hostPart(parsed.hostname);
  if (!host || host.includes(".") || host === "localhost") return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  if (parsed.pathname && parsed.pathname !== "/") return null;
  if (parsed.search || parsed.hash) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/i.test(host)) return null;
  return host;
}

function buildSearchUrlForTerm(term) {
  const q = encodeURIComponent(String(term || "").trim());
  return DEFAULT_SEARCH_URL.replace("{searchTerms}", q);
}

async function redirectSingleLabelNavRoute(route, request) {
  const page = request.frame()?.page?.();
  if (page && isTrustedPageNavigation(page)) {
    await route.continue();
    return;
  }
  if (!request.isNavigationRequest() || request.resourceType() !== "document") {
    await route.continue();
    return;
  }
  const term = parseOmniboxSingleLabelNav(request.url());
  if (!term) {
    await route.continue();
    return;
  }
  await route.fulfill({
    status: 302,
    headers: { location: buildSearchUrlForTerm(term) },
  });
}

function bindPageOmniboxSearchGuard(page) {
  if (!page || page.__stealthOmniboxGuardBound) return;
  page.__stealthOmniboxGuardBound = true;

  page.on("framenavigated", (frame) => {
    if (!omniboxSearchGuardEnabled()) return;
    if (frame !== page.mainFrame()) return;
    if (isTrustedPageNavigation(page)) return;

    const term = parseOmniboxSingleLabelNav(readPageUrl(page));
    if (!term) return;

    const searchUrl = buildSearchUrlForTerm(term);
    if (readPageUrl(page) === searchUrl) return;

    markTrustedPageNavigation(page);
    void page
      .goto(searchUrl, { waitUntil: "commit", timeout: 60_000 })
      .catch(() => undefined)
      .finally(() => clearTrustedPageNavigation(page));
  });
}

function readPageUrl(page) {
  try {
    return String(typeof page.url === "function" ? page.url() : page.url || "");
  } catch {
    return "";
  }
}

function bindOmniboxSearchGuard(context) {
  if (!context || !omniboxSearchGuardEnabled() || context.__stealthOmniboxGuardBound) return;
  context.__stealthOmniboxGuardBound = true;

  void context.route((url) => parseOmniboxSingleLabelNav(url) !== null, redirectSingleLabelNavRoute);

  for (const page of context.pages()) bindPageOmniboxSearchGuard(page);
  context.on("page", (page) => bindPageOmniboxSearchGuard(page));
}

module.exports = {
  DEFAULT_SEARCH_URL,
  omniboxSearchGuardEnabled,
  markTrustedPageNavigation,
  clearTrustedPageNavigation,
  isTrustedPageNavigation,
  parseOmniboxSingleLabelNav,
  buildSearchUrlForTerm,
  bindOmniboxSearchGuard,
};
