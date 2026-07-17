"use strict";

const GOOGLE_AUTH_COOKIE_NAMES = new Set(["SID", "HSID", "SSID", "APISID", "SAPISID"]);

function countGoogleAuthCookies(cookies) {
  let n = 0;
  for (const cookie of cookies || []) {
    if (GOOGLE_AUTH_COOKIE_NAMES.has(cookie.name)) n += 1;
  }
  return n;
}

function classifyUrl(url) {
  const value = String(url || "");
  if (/accounts\.google\.com/i.test(value) && /signin|ServiceLogin|challenge|interstitial|v3\/signin/i.test(value)) {
    return "challenge";
  }
  if (/mail\.google\.com/i.test(value) && !/signin|ServiceLogin/i.test(value)) {
    return "inbox";
  }
  if (/myaccount\.google\.com/i.test(value)) {
    return "account";
  }
  return "other";
}

function isGoogleSessionUrl(url) {
  return classifyUrl(url) !== "other";
}

async function extractGoogleEmail(page) {
  if (!page) return "";
  try {
    const fromDom = await page.evaluate(() => {
      const selectors = [
        'a[aria-label*="@"]',
        '[data-email]',
        'div[email]',
        'span[email]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const attr = el.getAttribute("data-email") || el.getAttribute("email") || el.getAttribute("aria-label") || "";
        const match = String(attr).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
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
    const cookies = await page.context().cookies(["https://mail.google.com", "https://google.com"]);
    const emailCookie = cookies.find((c) => c.name === "GMAIL_AT" || c.name === "EMAIL");
    if (emailCookie?.value) {
      const decoded = decodeURIComponent(emailCookie.value);
      const match = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (match) return match[0].toLowerCase();
    }
  } catch {
    /* ignore */
  }

  return "";
}

function pickPage(context) {
  const pages = context.pages().filter((p) => !p.isClosed());
  if (!pages.length) return null;
  const ranked = [...pages].sort((a, b) => {
    const score = (url) => {
      const kind = classifyUrl(url);
      if (kind === "inbox") return 0;
      if (kind === "account") return 1;
      if (kind === "challenge") return 2;
      return 3;
    };
    return score(a.url()) - score(b.url());
  });
  return ranked[0];
}

/**
 * Detect Google login state from a live Playwright context (must run before context.close).
 * @returns {Promise<{ status: string, result_code: string, email: string, evidence: string }>}
 */
async function detectGoogleSession(context) {
  if (!context) {
    return { status: "unknown", result_code: "detect_failed", email: "", evidence: "no-context" };
  }

  try {
    const cookies = await context.cookies([
      "https://mail.google.com",
      "https://google.com",
      "https://accounts.google.com",
    ]);
    const authCount = countGoogleAuthCookies(cookies);
    const page = pickPage(context);
    const urlKind = page ? classifyUrl(page.url()) : "other";
    const email = page ? await extractGoogleEmail(page) : "";

    if (urlKind === "challenge") {
      // Auth cookies prove a live Google session — don't stamp Challenge just because a
      // sign-in/challenge tab is still open after a successful Gmail Login script.
      if (authCount >= 2) {
        return {
          status: "logged_in",
          result_code: "google_cookies",
          email,
          evidence: "challenge_url+auth_cookies",
        };
      }
      return {
        status: "challenged",
        result_code: /2fa|authenticator|totp/i.test(page.url()) ? "2fa_pending" : "google_challenge",
        email,
        evidence: "challenge_url",
      };
    }

    if (urlKind === "inbox" && authCount >= 2) {
      return { status: "logged_in", result_code: "inbox_ok", email, evidence: "mail_url+cookies" };
    }

    if (authCount >= 2) {
      return {
        status: "logged_in",
        result_code: urlKind === "account" ? "inbox_ok" : "google_cookies",
        email,
        evidence: "google_auth_cookies",
      };
    }

    if (urlKind === "inbox" || urlKind === "account") {
      return { status: "not_logged_in", result_code: "login_page", email, evidence: "url_without_auth_cookies" };
    }

    // Partial cookies alone are not a Google challenge page — avoid false Challenge in Data Box.
    return {
      status: "not_logged_in",
      result_code: authCount > 0 ? "partial_auth_cookies" : "login_page",
      email,
      evidence: authCount > 0 ? "partial_auth_cookies" : "no_auth_cookies",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "unknown", result_code: "detect_failed", email: "", evidence: message.slice(0, 120) };
  }
}

module.exports = {
  detectGoogleSession,
  countGoogleAuthCookies,
  classifyUrl,
  isGoogleSessionUrl,
  extractGoogleEmail,
  GOOGLE_AUTH_COOKIE_NAMES,
};
