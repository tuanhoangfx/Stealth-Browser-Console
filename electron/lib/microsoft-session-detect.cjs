"use strict";

/** Microsoft / Outlook auth cookie names commonly present when signed in. */
const MICROSOFT_AUTH_COOKIE_NAMES = new Set([
  "MSPAuth",
  "MSPProf",
  "NAP",
  "ANON",
  "RPSSecAuth",
  "WLSSC",
  "PPLState",
  "__Host-MSAAUTHP",
  "DefaultAnchorMailbox",
]);

function countMicrosoftAuthCookies(cookies) {
  let n = 0;
  for (const cookie of cookies || []) {
    if (MICROSOFT_AUTH_COOKIE_NAMES.has(cookie.name)) n += 1;
  }
  return n;
}

function classifyMicrosoftUrl(url) {
  const value = String(url || "");
  if (/outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com/i.test(value)) {
    if (/signin|login|auth/i.test(value)) return "challenge";
    return "inbox";
  }
  if (/login\.live\.com|login\.microsoftonline\.com|account\.live\.com|account\.microsoft\.com/i.test(value)) {
    if (/oauth20_authorize|ppsecure\/post|GetCredentialType/i.test(value)) return "challenge";
    if (/proofs|interrupt|login\.srf|oauth20/i.test(value) || /login\.live\.com\/?($|\?)/i.test(value)) {
      return "challenge";
    }
    return "challenge";
  }
  return "other";
}

function isMicrosoftSessionUrl(url) {
  return classifyMicrosoftUrl(url) !== "other";
}

async function extractMicrosoftEmail(page) {
  if (!page) return "";
  try {
    const fromDom = await page.evaluate(() => {
      const selectors = [
        '[data-testid="recipient-email"]',
        '[id*="mectrl_currentAccount_secondary"]',
        "#mectrl_currentAccount_secondary",
        'div[data-unique-id="Ribbon-Mail"]',
        '[aria-label*="@"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const text =
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          el.textContent ||
          "";
        const match = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        if (match) return match[0].toLowerCase();
      }
      const title = document.title || "";
      const titleMatch = title.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (titleMatch) return titleMatch[0].toLowerCase();
      return "";
    });
    if (fromDom) return fromDom;
  } catch {
    /* page may be closing */
  }

  try {
    const cookies = await page.context().cookies([
      "https://outlook.live.com",
      "https://login.live.com",
      "https://account.microsoft.com",
    ]);
    const mailbox = cookies.find((c) => c.name === "DefaultAnchorMailbox");
    if (mailbox?.value) {
      const decoded = decodeURIComponent(mailbox.value);
      const match = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (match) return match[0].toLowerCase();
    }
  } catch {
    /* ignore */
  }

  return "";
}

function pickMicrosoftPage(context) {
  const pages = context.pages().filter((p) => !p.isClosed());
  if (!pages.length) return null;
  const ranked = [...pages].sort((a, b) => {
    const score = (url) => {
      const kind = classifyMicrosoftUrl(url);
      if (kind === "inbox") return 0;
      if (kind === "challenge") return 1;
      return 2;
    };
    return score(a.url()) - score(b.url());
  });
  return ranked[0];
}

/**
 * Detect Microsoft / Outlook login state from a live Playwright context.
 * @returns {Promise<{ status: string, result_code: string, email: string, evidence: string }>}
 */
async function detectMicrosoftSession(context) {
  if (!context) {
    return { status: "unknown", result_code: "detect_failed", email: "", evidence: "no-context" };
  }

  try {
    const cookies = await context.cookies([
      "https://login.live.com",
      "https://outlook.live.com",
      "https://account.microsoft.com",
      "https://login.microsoftonline.com",
    ]);
    const authCount = countMicrosoftAuthCookies(cookies);
    const page = pickMicrosoftPage(context);
    const urlKind = page ? classifyMicrosoftUrl(page.url()) : "other";
    const email = page ? await extractMicrosoftEmail(page) : "";

    if (urlKind === "challenge") {
      if (authCount >= 2) {
        return {
          status: "logged_in",
          result_code: "microsoft_cookies",
          email,
          evidence: "challenge_url+ms_auth_cookies",
        };
      }
      return {
        status: "challenged",
        result_code: /proofs|otc|twofactor|mfa|authenticator/i.test(page.url())
          ? "2fa_pending"
          : "microsoft_challenge",
        email,
        evidence: "ms_challenge_url",
      };
    }

    if (urlKind === "inbox" && authCount >= 1) {
      return { status: "logged_in", result_code: "inbox_ok", email, evidence: "outlook_url+cookies" };
    }

    if (authCount >= 2) {
      return {
        status: "logged_in",
        result_code: "microsoft_cookies",
        email,
        evidence: "ms_auth_cookies",
      };
    }

    if (urlKind === "inbox") {
      return {
        status: "not_logged_in",
        result_code: "login_page",
        email,
        evidence: "outlook_url_without_auth_cookies",
      };
    }

    return {
      status: "not_logged_in",
      result_code: authCount > 0 ? "partial_auth_cookies" : "login_page",
      email,
      evidence: authCount > 0 ? "partial_ms_auth_cookies" : "no_ms_auth_cookies",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "unknown", result_code: "detect_failed", email: "", evidence: message.slice(0, 120) };
  }
}

module.exports = {
  detectMicrosoftSession,
  countMicrosoftAuthCookies,
  classifyMicrosoftUrl,
  isMicrosoftSessionUrl,
  extractMicrosoftEmail,
  MICROSOFT_AUTH_COOKIE_NAMES,
};
