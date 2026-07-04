function isGoogleSignInUrl(url) {
  const href = String(url || "");
  return /accounts\.google\.com/i.test(href) && /(signin|ServiceLogin|identifier|challenge)/i.test(href);
}

const LOGIN_WORKFLOW_IDS = new Set(["gmail-login"]);

/**
 * After navigating to a Google property, fail fast with a clear ops message when session is missing.
 * Skips when the workflow intentionally opens Google sign-in (gmail-login) or target URL is sign-in.
 */
async function assertGoogleSession(page, logger, { targetUrl = "", workflowId = "" } = {}) {
  const current = String(page.url?.() || "");
  if (!isGoogleSignInUrl(current)) {
    logger.push("success", "Google session OK (not on sign-in page)");
    return;
  }
  if (LOGIN_WORKFLOW_IDS.has(String(workflowId || "")) || isGoogleSignInUrl(targetUrl)) {
    logger.push("info", "On Google sign-in page (expected for login workflow)");
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
