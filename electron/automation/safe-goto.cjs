function cleanMessage(message) {
  return String(message || "Navigation failed.").replace(/\u001b\[[0-9;]*m/g, "");
}

function isAbortNavigationError(error) {
  const msg = cleanMessage(error instanceof Error ? error.message : String(error));
  return /ERR_ABORTED|NS_BINDING_ABORTED|Navigation aborted|is interrupted by another navigation/i.test(msg);
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function isGoogleHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "google.com" || host.endsWith(".google.com");
}

function readPageUrl(page) {
  try {
    return String(typeof page.url === "function" ? page.url() : page.url || "");
  } catch {
    return "";
  }
}

/** Redirect chains (esp. Google) often abort the original goto while the tab already landed. */
function navigationLikelySucceeded(page, targetUrl) {
  const current = readPageUrl(page);
  if (!isHttpUrl(current)) return false;

  try {
    const target = new URL(targetUrl);
    const cur = new URL(current);
    if (cur.hostname === target.hostname) return true;
    if (isGoogleHost(target.hostname) && isGoogleHost(cur.hostname)) return true;
    return false;
  } catch {
    return isHttpUrl(current);
  }
}

async function awaitNavigationIdle(page, timeoutMs = 5000) {
  if (!page || page.isClosed?.()) return;
  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
  await page.waitForLoadState("load", { timeout: Math.min(3000, timeoutMs) }).catch(() => undefined);
}

async function settleAfterNavigation(page, timeoutMs = 6000) {
  await awaitNavigationIdle(page, timeoutMs);
  await page.waitForTimeout?.(450).catch(() => undefined);
}

async function waitForLanding(page, targetUrl, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (navigationLikelySucceeded(page, targetUrl)) return true;
    try {
      await page.waitForURL(
        (url) => {
          const href = String(url);
          return navigationLikelySucceeded({ url: () => href }, targetUrl);
        },
        { timeout: Math.min(700, deadline - Date.now()) },
      );
      if (navigationLikelySucceeded(page, targetUrl)) return true;
    } catch {
      await page.waitForTimeout?.(250).catch(() => undefined);
    }
  }
  return navigationLikelySucceeded(page, targetUrl);
}

async function fallbackAssignNavigate(page, url, timeoutMs = 60000) {
  await page.evaluate((href) => {
    window.location.assign(href);
  }, url);
  await waitForLanding(page, url, Math.min(timeoutMs, 20000));
  await settleAfterNavigation(page, Math.min(timeoutMs, 15000));
}

/**
 * Navigate with retry when a concurrent navigation aborts the request (common on launch + workflow).
 */
async function safePageGoto(page, url, options = {}, retryOptions = {}) {
  const maxAttempts = Math.max(1, Number(retryOptions.maxAttempts) || 8);
  const retryDelayMs = Math.max(0, Number(retryOptions.retryDelayMs) || 1000);
  const timeout = Number(options.timeout) || 60000;
  const preferCommit = options.waitUntil !== "domcontentloaded";
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) {
        await page.waitForTimeout?.(Math.min(retryDelayMs * attempt, 4000)).catch(() => undefined);
      }
      await awaitNavigationIdle(page, 4000);
      const waitUntil = preferCommit || attempt >= 2 ? "commit" : options.waitUntil || "commit";
      await page.goto(url, { ...options, timeout, waitUntil });
      await settleAfterNavigation(page, Math.min(timeout, 15000));
      return;
    } catch (error) {
      lastError = error;
      if (isAbortNavigationError(error)) {
        const landed = await waitForLanding(page, url, 10000);
        if (landed) {
          await settleAfterNavigation(page, Math.min(timeout, 15000));
          return;
        }
        if (attempt < maxAttempts) continue;
        try {
          await fallbackAssignNavigate(page, url, timeout);
          return;
        } catch (fallbackError) {
          lastError = fallbackError;
        }
      }
      if (!isAbortNavigationError(error) || attempt >= maxAttempts) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Navigation failed.");
}

module.exports = {
  cleanMessage,
  isAbortNavigationError,
  isHttpUrl,
  navigationLikelySucceeded,
  awaitNavigationIdle,
  settleAfterNavigation,
  waitForLanding,
  safePageGoto,
};
