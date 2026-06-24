const { safePageGoto } = require("./safe-goto.cjs");

const FAST_LAUNCH = String(process.env.STEALTH_FAST_LAUNCH ?? "1").toLowerCase() !== "0";

async function settlePage(page, timeoutMs = 5000) {
  const budget = FAST_LAUNCH ? Math.min(timeoutMs, 2000) : timeoutMs;
  await page.waitForLoadState("load", { timeout: budget }).catch(() => undefined);
  if (!FAST_LAUNCH) {
    await page.waitForLoadState("domcontentloaded", { timeout: Math.min(3000, budget) }).catch(() => undefined);
  }
}

/** First live tab — wait for CloakBrowser to attach initial page when needed. */
async function resolvePrimaryPage(context, { timeoutMs = 8000 } = {}) {
  let page = context.pages().find((p) => !p.isClosed());
  if (!page) {
    try {
      page = await context.waitForEvent("page", { timeout: Math.min(timeoutMs, 5000) });
    } catch {
      page = await context.newPage();
    }
  }
  await page.bringToFront().catch(() => undefined);
  return page;
}

/** Wait for launch shell — used when workflow skips startup URL but browser is still opening. */
async function awaitBrowserReady(context, { timeoutMs = 12000 } = {}) {
  const page = await resolvePrimaryPage(context, { timeoutMs });
  if (!FAST_LAUNCH) {
    await page.waitForTimeout(400).catch(() => undefined);
  }
  await page.waitForLoadState("domcontentloaded", { timeout: FAST_LAUNCH ? 4000 : Math.min(timeoutMs, 10000) }).catch(() => undefined);
  await settlePage(page, FAST_LAUNCH ? 1200 : Math.min(6000, timeoutMs));
  return page;
}

/** Settle in-flight launch/startup navigation before workflow page.goto. */
async function stabilizePrimaryPage(context, { timeoutMs = 15000 } = {}) {
  const page = await resolvePrimaryPage(context, { timeoutMs });
  if (!FAST_LAUNCH) {
    await page.waitForTimeout(500).catch(() => undefined);
  }
  await page.waitForLoadState("domcontentloaded", { timeout: FAST_LAUNCH ? 3000 : Math.min(timeoutMs, 12000) }).catch(() => undefined);
  if (!FAST_LAUNCH) {
    await page.waitForLoadState("load", { timeout: Math.min(6000, timeoutMs) }).catch(() => undefined);
    await page.waitForTimeout(350).catch(() => undefined);
  }
  return page;
}

async function navigateStartupUrl(context, targetUrl) {
  const page = await resolvePrimaryPage(context);
  if (!FAST_LAUNCH) {
    await page.waitForTimeout(250).catch(() => undefined);
  }

  const waitUntil = FAST_LAUNCH ? "commit" : "domcontentloaded";
  const settleBudget = FAST_LAUNCH ? 2000 : 8000;

  const tryGoto = async (mode) => {
    await safePageGoto(page, targetUrl, { waitUntil: mode, timeout: 60000 });
    await settlePage(page, settleBudget);
  };

  try {
    await tryGoto(waitUntil);
  } catch {
    if (FAST_LAUNCH) {
      await page.waitForTimeout(300).catch(() => undefined);
    } else {
      await page.waitForTimeout(900).catch(() => undefined);
    }
    await tryGoto(FAST_LAUNCH ? "domcontentloaded" : "load");
  }

  try {
    const finalUrl = String(page.url() || "");
    const looksOk =
      targetUrl === "about:blank" ||
      finalUrl.startsWith("http://") ||
      finalUrl.startsWith("https://") ||
      finalUrl === "about:blank";
    if (!looksOk) {
      if (!FAST_LAUNCH) await page.waitForTimeout(650).catch(() => undefined);
      await tryGoto(FAST_LAUNCH ? "commit" : "domcontentloaded");
    }
  } catch {
    // ignore url checks
  }

  // Close obvious placeholders so the operator lands on the startup tab.
  const pages = context.pages().filter((p) => p !== page && !p.isClosed());
  for (const other of pages) {
    try {
      const url = String(other.url() || "");
      const isPlaceholder =
        !url ||
        url === "about:blank" ||
        url.startsWith("chrome://newtab") ||
        url.startsWith("chrome://new-tab");
      if (isPlaceholder) await other.close().catch(() => undefined);
    } catch {
      // ignore close failures
    }
  }
}

module.exports = { navigateStartupUrl, awaitBrowserReady, stabilizePrimaryPage, resolvePrimaryPage, settlePage };
