function isGoogleSignInUrl(url) {
  const href = String(url || "");
  return /accounts\.google\.com/i.test(href) && /(signin|ServiceLogin|identifier|challenge)/i.test(href);
}

/**
 * After navigating to a Google property, fail fast with a clear ops message when session is missing.
 */
async function assertGoogleSession(page, logger, { targetUrl = "" } = {}) {
  const current = String(page.url?.() || "");
  if (!isGoogleSignInUrl(current)) {
    logger.push("success", "Google session OK (not on sign-in page)");
    return;
  }
  const hint = targetUrl ? ` Target was ${targetUrl}.` : "";
  const message = `Google sign-in required — log in inside this profile browser, then re-run the workflow.${hint}`;
  logger.push("error", message);
  throw new Error(message);
}

function isGoogleWorkflowUrl(url) {
  return /google\.com/i.test(String(url || ""));
}

module.exports = { isGoogleSignInUrl, isGoogleWorkflowUrl, assertGoogleSession };
