async function settlePage(page, timeoutMs = 5000) {
  await page.waitForLoadState("load", { timeout: timeoutMs }).catch(() => undefined);
  await page.waitForLoadState("domcontentloaded", { timeout: Math.min(3000, timeoutMs) }).catch(() => undefined);
}

async function navigateStartupUrl(context, targetUrl) {
  // Prefer reusing CloakBrowser's initial tab. In some launches the first page
  // arrives asynchronously, so wait briefly before creating a new one.
  let page = context.pages().find((p) => !p.isClosed());
  if (!page) {
    try {
      page = await context.waitForEvent("page", { timeout: 1500 });
    } catch {
      page = await context.newPage();
    }
  }
  await page.bringToFront().catch(() => undefined);
  await page.waitForTimeout(250).catch(() => undefined);

  const tryGoto = async (waitUntil) => {
    await page.goto(targetUrl, { waitUntil, timeout: 60000 });
    await settlePage(page, 8000);
  };

  try {
    await tryGoto("domcontentloaded");
  } catch {
    await page.waitForTimeout(900).catch(() => undefined);
    await tryGoto("load");
  }

  try {
    const finalUrl = String(page.url() || "");
    const looksOk =
      targetUrl === "about:blank" ||
      finalUrl.startsWith("http://") ||
      finalUrl.startsWith("https://") ||
      finalUrl === "about:blank";
    if (!looksOk) {
      await page.waitForTimeout(650).catch(() => undefined);
      await tryGoto("domcontentloaded");
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

module.exports = { navigateStartupUrl };
