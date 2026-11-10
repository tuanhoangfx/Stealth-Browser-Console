"use strict";

const fs = require("node:fs");

/**
 * Fetches live plaintext cookies directly from a running Chromium CDP port (`Storage.getCookies`)
 * in ~50-80ms without opening a Playwright browser/page or touching window focus.
 */
async function fetchLiveCdpCookiesByPort(debugPort, timeoutMs = 1800) {
  const port = Number(debugPort);
  if (!Number.isFinite(port) || port <= 0) return { ok: false, cookies: [] };
  try {
    const verRes = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(Math.min(1200, timeoutMs)),
    });
    if (!verRes.ok) return { ok: false, cookies: [] };
    const ver = await verRes.json();
    const wsUrl = ver?.webSocketDebuggerUrl;
    if (!wsUrl || typeof WebSocket === "undefined") return { ok: false, cookies: [] };
    const cookies = await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error("cdp_ws_timeout"));
      }, timeoutMs);
      ws.onopen = () => {
        ws.send(JSON.stringify({ id: 1, method: "Storage.getCookies" }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.id === 1) {
            clearTimeout(timer);
            ws.close();
            resolve(Array.isArray(msg.result?.cookies) ? msg.result.cookies : []);
          }
        } catch (err) {
          clearTimeout(timer);
          ws.close();
          reject(err);
        }
      };
      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });
    return { ok: true, cookies };
  } catch {
    return { ok: false, cookies: [] };
  }
}

/**
 * Injects plaintext cookies directly into a running Chromium CDP port (`Storage.setCookies`)
 * without opening a Playwright context or touching window focus.
 */
async function setLiveCdpCookiesByPort(debugPort, cookies = [], timeoutMs = 1800) {
  const port = Number(debugPort);
  if (!Number.isFinite(port) || port <= 0 || !Array.isArray(cookies) || cookies.length === 0) {
    return { ok: false, injectedCount: 0 };
  }
  try {
    const verRes = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(Math.min(1200, timeoutMs)),
    });
    if (!verRes.ok) return { ok: false, injectedCount: 0 };
    const ver = await verRes.json();
    const wsUrl = ver?.webSocketDebuggerUrl;
    if (!wsUrl || typeof WebSocket === "undefined") return { ok: false, injectedCount: 0 };
    const cleanCookies = cookies
      .filter((c) => c && c.name && c.domain && c.value !== undefined)
      .map((c) => ({
        name: String(c.name),
        value: String(c.value ?? ""),
        domain: String(c.domain),
        path: String(c.path || "/"),
        secure: Boolean(c.secure),
        httpOnly: Boolean(c.httpOnly),
        ...(typeof c.expires === "number" && c.expires > 0 ? { expires: c.expires } : {}),
        ...(typeof c.sameSite === "string" && ["Strict", "Lax", "None"].includes(c.sameSite)
          ? { sameSite: c.sameSite }
          : {}),
      }));
    if (!cleanCookies.length) return { ok: false, injectedCount: 0 };
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error("cdp_ws_timeout"));
      }, timeoutMs);
      ws.onopen = () => {
        ws.send(JSON.stringify({ id: 1, method: "Storage.setCookies", params: { cookies: cleanCookies } }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.id === 1) {
            clearTimeout(timer);
            ws.close();
            resolve(true);
          }
        } catch (err) {
          clearTimeout(timer);
          ws.close();
          reject(err);
        }
      };
      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });
    return { ok: true, injectedCount: cleanCookies.length };
  } catch {
    return { ok: false, injectedCount: 0 };
  }
}

/**
 * Fetches open page targets (`/json/list`) from a running Chromium CDP port in ~15ms
 * so live window sync can detect when a browser with `c_user`+`xs` is actually sitting on
 * Facebook `/checkpoint/828281030927956/`, `/checkpoint/1501092823525282/`, `/two_step_verification/`, or `/login/`.
 */
async function fetchLiveCdpPageTargetsByPort(debugPort, timeoutMs = 1200) {
  const port = Number(debugPort);
  if (!Number.isFinite(port) || port <= 0) return [];
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];
    return list
      .filter((t) => !t?.type || t.type === "page")
      .map((t) => ({
        url: String(t?.url || ""),
        title: String(t?.title || ""),
        webSocketDebuggerUrl: String(t?.webSocketDebuggerUrl || ""),
      }));
  } catch {
    return [];
  }
}

/**
 * Proposal 2 (`ok 2` — Auto-skip Google `/speedbump/changepassword/changepasswordnudge`):
 * When a live CDP page target is sitting on Google's post-login password-change nudge
 * (`/speedbump/changepassword/changepasswordnudge` or `/speedbump/`), automatically clicks
 * the `"Skip"` / `"Bỏ qua"` / `"Not now"` button via CDP `Runtime.evaluate`.
 */
async function autoSkipGoogleSpeedbumpTargets(targets = [], timeoutMs = 1200) {
  const WsCtor = typeof WebSocket !== "undefined" ? WebSocket : null;
  if (!WsCtor) return { skippedCount: 0 };
  let skippedCount = 0;
  for (const t of Array.isArray(targets) ? targets : []) {
    const u = String(t?.url || "");
    const wsUrl = String(t?.webSocketDebuggerUrl || "");
    if (!wsUrl || !/accounts\.google\.com\/.*\/speedbump\/(?:changepassword\/changepasswordnudge)?/i.test(u)) {
      continue;
    }
    try {
      const clicked = await new Promise((resolve) => {
        const ws = new WsCtor(wsUrl);
        const timer = setTimeout(() => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolve(false);
        }, timeoutMs);
        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              id: 1,
              method: "Runtime.evaluate",
              params: {
                expression: `(() => {
                  const rx = /^(Skip|B\\u1ecf qua|Not now|\\u0110\\u1ec3 sau|Continue to Gmail|Ti\\u1ebfp t\\u1ee5c t\\u1edbi Gmail)$/i;
                  const el = Array.from(document.querySelectorAll('button, a, div[role="button"], span[jsname]')).find(
                    (b) => b.offsetWidth > 0 && !b.dataset.p0003Skipped && rx.test((b.innerText || "").replace(/\\s+/g, " ").trim())
                  );
                  if (!el) return false;
                  el.dataset.p0003Skipped = "1";
                  (el.closest('button, a, [role="button"], .VfPpkd-LgbsSe') || el).click();
                  return true;
                })()`,
                returnByValue: true,
              },
            }),
          );
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data));
            if (msg.id === 1) {
              clearTimeout(timer);
              ws.close();
              resolve(Boolean(msg?.result?.result?.value));
            }
          } catch {
            clearTimeout(timer);
            ws.close();
            resolve(false);
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });
      if (clicked) skippedCount += 1;
    } catch {
      /* ignore */
    }
  }
  return { skippedCount };
}

const healedGoogleChallengeWsUrls = new Set();

/**
 * Proposal 2 (`ok 2` — Auto-Close or Auto-Redirect Completed Google `/challenge/` Tabs once `LSID` is issued):
 * When `hasVerifiedGoogleAuth` is true (Google issued `LSID` + `SID` and `ListAccounts` verified `loggedIn: true`),
 * any leftover tab still sitting on `/challenge/(recaptcha|dp|iap|ipp|sk|kpe|ipe|ootp|pwd)` or `ServiceLogin`/`AccountChooser`:
 *   - is closed via CDP `Page.close` if another tab in the window is already on an authenticated Google app (`mail.google.com`, `myaccount.google.com`, etc.), OR
 *   - is automatically navigated to `https://mail.google.com/mail/u/0/#inbox` if no other authenticated Google tab is open and the profile has a Gmail row.
 */
async function autoHealCompletedGoogleChallengeTabs(
  targets = [],
  { hasGmailRow = true, allowRedirect = false, allowClose = false, timeoutMs = 1200 } = {},
) {
  const WsCtor = typeof WebSocket !== "undefined" ? WebSocket : null;
  const list = Array.isArray(targets) ? targets : [];
  if (!WsCtor || list.length === 0 || (!allowClose && !allowRedirect)) {
    return { closedCount: 0, redirectedCount: 0 };
  }
  const hasAuthenticatedAppTab = list.some((t) => isAuthenticatedGoogleAppUrl(t?.url));
  const STALE_GOOGLE_CHALLENGE_URL_RE =
    /accounts\.google\.com\/.*(?:challenge\/(?:recaptcha|dp|iap|ipp|sk|kpe|ipe|ootp|pwd)|ServiceLogin|AccountChooser|confirmidentifier|v3\/signin\/identifier)/i;

  let closedCount = 0;
  let redirectedCount = 0;

  for (const t of list) {
    const u = String(t?.url || "");
    const wsUrl = String(t?.webSocketDebuggerUrl || "");
    if (!wsUrl || !STALE_GOOGLE_CHALLENGE_URL_RE.test(u)) continue;
    // Never hijack or redirect a third-party OAuth flow (ElevenLabs, ChatGPT, Claude, etc.) to mail.google.com
    if (/[?&](?:client_id|redirect_uri)=|\/o\/oauth2\//i.test(u)) continue;
    if (healedGoogleChallengeWsUrls.has(`${wsUrl}::${u}`)) continue;

    // Never forcibly Page.close or Page.navigate a user's or agent's active accounts.google.com tab unless explicitly enabled
    // (closing/redirecting confirmidentifier/ServiceLogin/challenge mid-login aborts Playwright/user sign-in flows).
    const shouldCloseTab = Boolean(allowClose && hasAuthenticatedAppTab && list.length > 1);
    const shouldRedirectToGmail = Boolean(allowRedirect && !shouldCloseTab && hasGmailRow && hasAuthenticatedAppTab);
    if (!shouldCloseTab && !shouldRedirectToGmail) continue;

    healedGoogleChallengeWsUrls.add(`${wsUrl}::${u}`);
    if (healedGoogleChallengeWsUrls.size > 500) {
      const firstKey = healedGoogleChallengeWsUrls.values().next().value;
      if (firstKey) healedGoogleChallengeWsUrls.delete(firstKey);
    }

    try {
      const ok = await new Promise((resolve) => {
        const ws = new WsCtor(wsUrl);
        const timer = setTimeout(() => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolve(false);
        }, timeoutMs);
        ws.onopen = () => {
          if (shouldCloseTab) {
            ws.send(JSON.stringify({ id: 1, method: "Page.close", params: {} }));
          } else {
            ws.send(
              JSON.stringify({
                id: 1,
                method: "Page.navigate",
                params: { url: "https://mail.google.com/mail/u/0/#inbox" },
              }),
            );
          }
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data));
            if (msg.id === 1) {
              clearTimeout(timer);
              ws.close();
              resolve(!msg.error);
            }
          } catch {
            clearTimeout(timer);
            ws.close();
            resolve(false);
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });
      if (ok) {
        if (shouldCloseTab) closedCount += 1;
        else redirectedCount += 1;
      }
    } catch {
      /* ignore */
    }
  }
  return { closedCount, redirectedCount };
}

function isAuthenticatedFacebookAppUrl(url = "") {
  const u = String(url || "");
  if (!u || !/facebook\.com/i.test(u)) return false;
  if (
    /\/(login|recover|checkpoint)|1501092823525282|828281030927956|two_step_verification|auth_platform|dialog\/oauth/i.test(
      u,
    )
  ) {
    return false;
  }
  return true;
}

function isAuthenticatedTikTokAppUrl(url = "") {
  const u = String(url || "");
  if (!u || !/tiktok\.com/i.test(u)) return false;
  if (/\/login\b|\/passport\/|oauth/i.test(u)) return false;
  return true;
}

const healedSocialChallengeWsUrls = new Set();

/**
 * Proposal 1 (`ok 1` — Auto-Close or Auto-Redirect Completed `Facebook` & `TikTok` Challenge / 2FA Tabs once Session is Verified):
 * When `hasVerifiedFacebookAuth` or `hasVerifiedTikTokAuth` is true:
 *   - Any leftover Facebook tab on `/checkpoint/`, `two_step_verification`, `auth_platform/codesubmit`, `/login`, or `/recover`
 *     is closed via CDP `Page.close` if another tab in the window is already on `isAuthenticatedFacebookAppUrl`, OR
 *     redirected once to `https://www.facebook.com/` if `allowRedirect` is enabled and no hard 282/956 checkpoint is active.
 *   - Any leftover TikTok tab on `/login` is closed via CDP `Page.close` if another tab is on `isAuthenticatedTikTokAppUrl`, OR
 *     redirected once to `https://www.tiktok.com/` if `allowRedirect` is enabled.
 */
async function autoHealCompletedSocialChallengeTabs(
  targets = [],
  {
    hasVerifiedFacebookAuth = false,
    hasVerifiedTikTokAuth = false,
    allowRedirect = true,
    timeoutMs = 1200,
  } = {},
) {
  const WsCtor = typeof WebSocket !== "undefined" ? WebSocket : null;
  const list = Array.isArray(targets) ? targets : [];
  if (!WsCtor || list.length === 0 || (!hasVerifiedFacebookAuth && !hasVerifiedTikTokAuth)) {
    return { closedCount: 0, redirectedCount: 0 };
  }
  const hasAuthFbTab = list.some((t) => isAuthenticatedFacebookAppUrl(t?.url));
  const hasAuthTtTab = list.some((t) => isAuthenticatedTikTokAppUrl(t?.url));
  const STALE_FB_CHALLENGE_URL_RE =
    /facebook\.com\/.*(?:\/(?:login|recover|checkpoint)\b|two_step_verification|auth_platform\/codesubmit)/i;
  const STALE_TT_CHALLENGE_URL_RE = /tiktok\.com\/(?:[^?#]*\/)?login\b/i;

  let closedCount = 0;
  let redirectedCount = 0;

  for (const t of list) {
    const u = String(t?.url || "");
    const wsUrl = String(t?.webSocketDebuggerUrl || "");
    if (!wsUrl || !u) continue;
    if (/[?&](?:client_id|redirect_uri)=|dialog\/oauth/i.test(u)) continue;

    let shouldCloseTab = false;
    let redirectTargetUrl = "";

    if (hasVerifiedFacebookAuth && STALE_FB_CHALLENGE_URL_RE.test(u)) {
      if (hasAuthFbTab && list.length > 1) {
        shouldCloseTab = true;
      } else if (
        allowRedirect &&
        !/1501092823525282|828281030927956|checkpoint\/disabled/i.test(u)
      ) {
        redirectTargetUrl = "https://www.facebook.com/";
      }
    } else if (hasVerifiedTikTokAuth && STALE_TT_CHALLENGE_URL_RE.test(u)) {
      if (hasAuthTtTab && list.length > 1) {
        shouldCloseTab = true;
      } else if (allowRedirect) {
        redirectTargetUrl = "https://www.tiktok.com/";
      }
    }

    if (!shouldCloseTab && !redirectTargetUrl) continue;
    const dedupeKey = `${wsUrl}::${u}`;
    if (healedSocialChallengeWsUrls.has(dedupeKey)) continue;
    healedSocialChallengeWsUrls.add(dedupeKey);
    if (healedSocialChallengeWsUrls.size > 500) {
      const firstKey = healedSocialChallengeWsUrls.values().next().value;
      if (firstKey) healedSocialChallengeWsUrls.delete(firstKey);
    }

    try {
      const ok = await new Promise((resolve) => {
        const ws = new WsCtor(wsUrl);
        const timer = setTimeout(() => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolve(false);
        }, timeoutMs);
        ws.onopen = () => {
          if (shouldCloseTab) {
            ws.send(JSON.stringify({ id: 1, method: "Page.close", params: {} }));
          } else {
            ws.send(
              JSON.stringify({
                id: 1,
                method: "Page.navigate",
                params: { url: redirectTargetUrl },
              }),
            );
          }
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data));
            if (msg.id === 1) {
              clearTimeout(timer);
              ws.close();
              resolve(!msg.error);
            }
          } catch {
            clearTimeout(timer);
            ws.close();
            resolve(false);
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });
      if (ok) {
        if (shouldCloseTab) closedCount += 1;
        else redirectedCount += 1;
      }
    } catch {
      /* ignore */
    }
  }
  return { closedCount, redirectedCount };
}

function classifyFacebookLiveCdpTargets(targets = []) {
  const list = Array.isArray(targets) ? targets : [];
  const hasCleanAuthenticatedFbTab = list.some((t) => isAuthenticatedFacebookAppUrl(t?.url));
  for (const t of list) {
    const u = String(t?.url || "");
    if (!/facebook\.com|meta\.com/i.test(u)) continue;
    if (/1501092823525282|checkpoint\/disabled/i.test(u)) {
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "appeal",
        resultCode: "fb_checkpoint_282",
        evidence: `checkpoint=282 url=${u.slice(0, 120)}`,
        note: "[Checkpoint 282] Facebook 282 Appeal / Suspended Checkpoint",
      };
    }
    if (/828281030927956/i.test(u)) {
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "appeal",
        resultCode: "fb_checkpoint_956",
        evidence: `checkpoint=956 url=${u.slice(0, 120)}`,
        note: "[Checkpoint 956] Facebook 956 Account Locked Checkpoint",
      };
    }
    if (hasCleanAuthenticatedFbTab) {
      continue;
    }
    if (/\/checkpoint(\/|$|\?)/i.test(u)) {
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "appeal",
        resultCode: "fb_checkpoint",
        evidence: `checkpoint=checkpoint url=${u.slice(0, 120)}`,
        note: "[Checkpoint] Facebook Security Checkpoint",
      };
    }
    if (/two_step_verification|auth_platform\/codesubmit/i.test(u)) {
      return {
        restricted: true,
        status: "challenged",
        rowStatus: null,
        resultCode: "2fa_pending",
        evidence: `Facebook:2fa_pending url=${u.slice(0, 120)}`,
        note: "Facebook 2FA verification pending in live window",
      };
    }
    if (/facebook\.com\/(login|recover)/i.test(u)) {
      return {
        restricted: true,
        status: "not_logged_in",
        rowStatus: null,
        resultCode: "login_page",
        evidence: `Facebook:login_page url=${u.slice(0, 120)}`,
        note: "Facebook login page open in live window",
      };
    }
  }
  return null;
}

const GOOGLE_FAMILY_SERVICES = new Set([
  "gmail",
  "google mail",
  "google one",
  "goole one",
  "google cloud",
  "google flow",
  "google labs",
  "veo 3",
  "google ai studio",
  "gemini",
  "google gemini",
  "notebooklm",
  "google drive",
  "google workspace",
  "vertex ai",
  "youtube",
  "youtube studio",
]);

function isGoogleFamilyService(svcLower = "") {
  return GOOGLE_FAMILY_SERVICES.has(String(svcLower || "").trim().toLowerCase());
}

const GOOGLE_RESTRICTION_ID_MAP = Object.freeze({
  "54": {
    label: "Gmail",
    services: ["gmail", "google mail", "googlemail", "gmail edu"],
  },
  "47": {
    label: "Google Cloud Platform",
    services: ["google cloud", "vertex ai"],
  },
  "12": {
    label: "YouTube",
    services: ["youtube", "youtube studio"],
  },
  "31": {
    label: "Google Payments",
    services: ["google pay", "google payments"],
  },
});

function resolveGoogleRestrictionInfo(url = "") {
  let u = String(url || "");
  if (!u) return null;
  for (let i = 0; i < 2; i += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(u)) break;
    try {
      u = decodeURIComponent(u);
    } catch {
      break;
    }
  }
  const m =
    u.match(/myaccount\.google\.com\/restrictions\/(\d+)/i) ||
    u.match(/[?&]ai=(\d+)\b/i);
  if (m) {
    const restrictionId = String(m[1]);
    const entry = GOOGLE_RESTRICTION_ID_MAP[restrictionId];
    if (entry) {
      return {
        restrictionId,
        label: entry.label,
        services: entry.services,
      };
    }
    return {
      restrictionId,
      label: `Google Service #${restrictionId}`,
      services: [`__google_subservice_${restrictionId}`],
    };
  }
  if (/support\.google\.com\/accounts\/answer\/40039/i.test(u)) {
    if (/[?&]p=mail\b/i.test(u)) {
      return {
        restrictionId: "54",
        label: "Gmail",
        services: ["gmail", "google mail", "googlemail", "gmail edu"],
      };
    }
    return null;
  }
  if (/myaccount\.google\.com\/restrictions\/?(?:[?#]|$)/i.test(u)) {
    return {
      restrictionId: "overview",
      label: "Google Services Overview",
      services: ["__google_restrictions_overview"],
    };
  }
  return null;
}

function resolveGoogleRestrictionTargetServices(url = "") {
  const info = resolveGoogleRestrictionInfo(url);
  return info ? info.services : null;
}

function doesGoogleTargetRestrictionApplyToService(targetState, svcLower = "") {
  if (!targetState || !Array.isArray(targetState.restrictedServices)) {
    return true;
  }
  const s = String(svcLower || "").trim().toLowerCase();
  return targetState.restrictedServices.includes(s);
}

function isAuthenticatedGoogleAppUrl(url = "") {
  const u = String(url || "");
  if (!u) return false;
  const basePath = u.split(/[?#]/)[0];
  if (
    /accounts\.google\.com\/(?:b\/\d+\/)?(?:(?:v3\/signin\/)?speedbump(?!\/disabled)|ManageAccount|SignOutOptions|AddMailService)/i.test(
      basePath,
    )
  ) {
    return true;
  }
  if (
    /accounts\.google\.com|\/(?:v3\/)?signin(?!options)\b|\/ServiceLogin\b|\/AccountChooser\b|myaccount\.google\.com\/(?:verification|restrictions)\/|support\.google\.com\/accounts\/answer\/40039/i.test(
      basePath,
    )
  ) {
    return false;
  }
  return /(?:mail|myaccount|gds|one|drive|gemini|aistudio|notebooklm|console\.cloud|labs|contacts|photos|docs|sheets|calendar|play|ads|pay)\.google\.com|studio\.youtube\.com/i.test(
    basePath,
  );
}

function classifyGoogleLiveCdpTargets(targets = [], { hasGoogleAuthCookies = true } = {}) {
  const list = Array.isArray(targets) ? targets : [];
  if (list.some((t) => isAuthenticatedGoogleAppUrl(t?.url))) {
    return null;
  }
  for (const t of list) {
    const u = String(t?.url || "");
    const title = String(t?.title || "");
    if (/myaccount\.google\.com\/verification\/selfie/i.test(u)) {
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "check_phone",
        resultCode: "selfie_verification_required",
        evidence: `Google:selfie_verification_required url=${u.slice(0, 120)}`,
        note: "Google selfie / identity verification required in live window",
      };
    }
    if (
      /myaccount\.google\.com\/restrictions\/\d+\/appeal|\/speedbump\/disabled\/confirmation|\/disabled\/confirmation/i.test(
        u,
      ) ||
      (/myaccount\.google\.com\/restrictions\/\d+/i.test(u) && /appeal submitted/i.test(title))
    ) {
      const restrictionInfo = resolveGoogleRestrictionInfo(u);
      const restrictedServices = restrictionInfo ? restrictionInfo.services : null;
      const serviceLabel = restrictionInfo?.label || "Google Account";
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "appeal",
        resultCode: "disabled_appeal_submitted",
        ...(restrictionInfo?.restrictionId ? { restrictedServiceId: restrictionInfo.restrictionId } : {}),
        ...(restrictedServices ? { restrictedServices } : {}),
        ...(restrictionInfo?.label ? { restrictedServiceLabel: restrictionInfo.label } : {}),
        evidence: `Google:disabled_appeal_submitted url=${u.slice(0, 120)}`,
        note: `${serviceLabel} appeal submitted — waiting for review`,
      };
    }
    if (
      /myaccount\.google\.com\/restrictions\/\d+|support\.google\.com\/accounts\/answer\/40039/i.test(u)
    ) {
      const restrictionInfo = resolveGoogleRestrictionInfo(u);
      const restrictedServices = restrictionInfo ? restrictionInfo.services : null;
      const serviceLabel = restrictionInfo?.label || "Google service";
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "disable",
        resultCode: "account_disabled",
        ...(restrictionInfo?.restrictionId ? { restrictedServiceId: restrictionInfo.restrictionId } : {}),
        ...(restrictedServices ? { restrictedServices } : {}),
        ...(restrictionInfo?.label ? { restrictedServiceLabel: restrictionInfo.label } : {}),
        evidence: `Google:account_disabled url=${u.slice(0, 120)}`,
        note: `${serviceLabel} restriction in live window`,
      };
    }
    if (!/^https?:\/\/accounts\.google\.com\//i.test(u)) continue;
    if (/\/(?:(?:v3\/signin\/)?speedbump(?!\/disabled)|ManageAccount|SignOutOptions|signin\/oauth\/consent|o\/oauth2)\b/i.test(u)) {
      continue;
    }
    const decodedContinue = (() => {
      try {
        return decodeURIComponent(u);
      } catch {
        return u;
      }
    })();
    if (
      hasGoogleAuthCookies &&
      (/[?&]rapt=/i.test(u) ||
        (/[?&]continue=https?:\/\/myaccount\.google\.com\//i.test(decodedContinue) &&
          !/myaccount\.google\.com\/(?:restrictions\/\d+|verification\/selfie)/i.test(decodedContinue)))
    ) {
      continue;
    }
    if (!hasGoogleAuthCookies && /\/signin\/challenge\/recaptcha\b/i.test(u)) {
      return {
        restricted: true,
        status: "challenged",
        rowStatus: null,
        resultCode: "challenged_captcha_grid",
        evidence: `Google:challenged_captcha_grid url=${u.slice(0, 120)}`,
        note: "Google reCAPTCHA challenge in live window",
      };
    }
    if (/challenge\/iap(?!\/verify)\b|\/qrcode\b|\/devicephoneverification\b|\/uplevelingstep\/selection\b/i.test(u)) {
      const restrictionInfo = resolveGoogleRestrictionInfo(decodedContinue);
      const restrictedServices = restrictionInfo ? restrictionInfo.services : null;
      const isUpleveling = /\/uplevelingstep\/selection\b/i.test(u);
      return {
        restricted: true,
        status: "quarantined_sms",
        rowStatus: "checkpoint_qr",
        resultCode: "checkpoint_qr",
        ...(restrictedServices ? { restrictedServices } : {}),
        ...(restrictionInfo?.label ? { restrictedServiceLabel: restrictionInfo.label } : {}),
        evidence: `Google:checkpoint_qr url=${u.slice(0, 120)}`,
        note: isUpleveling
          ? `Google QR / SMS phone verification required before ${restrictionInfo?.label || "Google"} appeal (/uplevelingstep/selection)`
          : "Google QR code verification required in live window (/challenge/iap)",
      };
    }
    if (/challenge\/(?:dp|ipp|sk)\b/i.test(u)) {
      const isDevicePrompt = /challenge\/(?:dp|sk)\b/i.test(u);
      return {
        restricted: true,
        status: "quarantined_sms",
        rowStatus: "check_phone",
        resultCode: "phone_sms_required",
        ...(isDevicePrompt ? { challengeType: "device_prompt" } : { challengeType: "phone_sms" }),
        evidence: `Google:phone_sms_required url=${u.slice(0, 120)}`,
        note: "Google phone verification required in live window",
      };
    }
    if (/challenge\/(?:kpe|ipe|ootp)\b/i.test(u)) {
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "check_mail",
        resultCode: "mail_challenge",
        evidence: `Google:mail_challenge url=${u.slice(0, 120)}`,
        note: "Google recovery email verification required in live window",
      };
    }
    if (/signin\/v2\/disabled|\/disabled\b/i.test(u)) {
      const combinedText = `${title} ${String(t?.bodyText || t?.snippet || "")}`;
      const isWorkspaceAdminDisabled =
        /disabled by your Google Workspace administrator|bị quản trị viên Google Workspace của bạn vô hiệu hóa|Contact your administrator for help/i.test(
          combinedText,
        );
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "disable",
        resultCode: "account_disabled",
        ...(isWorkspaceAdminDisabled ? { disabledReason: "workspace_admin_disabled" } : {}),
        evidence: isWorkspaceAdminDisabled
          ? `Google:account_disabled (workspace_admin_disabled) url=${u.slice(0, 100)}`
          : `Google:account_disabled url=${u.slice(0, 120)}`,
        note: isWorkspaceAdminDisabled
          ? "Google account disabled by Google Workspace administrator (no self-service appeal)"
          : "Google account disabled in live window",
      };
    }
    if (/signin\/rejected/i.test(u)) {
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "check_mail",
        resultCode: "account_locked_rejected",
        evidence: `Google:account_locked_rejected url=${u.slice(0, 120)}`,
        note: "Google sign-in rejected in live window",
      };
    }
    if (/ServiceLogin|AccountChooser|confirmidentifier|CookieMismatch|v3\/signin\/(?:identifier|challenge\/pwd)/i.test(u)) {
      return {
        restricted: true,
        status: "not_logged_in",
        rowStatus: null,
        resultCode: "google_one_logged_out",
        evidence: `Google:not_logged_in url=${u.slice(0, 120)}`,
        note: "Google sign-in / AccountChooser open in live window (session signed out)",
      };
    }
    if (/challenge\/(?:totp|bc|az|selection|pk)\b|v3\/signin\/challenge\/|signin\/v2\/challenge\//i.test(u)) {
      const isTotpOrBackup = /challenge\/(?:totp|bc)\b/i.test(u);
      return {
        restricted: true,
        status: "challenged",
        rowStatus: null,
        resultCode: isTotpOrBackup ? "2fa_pending" : "google_challenge",
        evidence: `Google:${isTotpOrBackup ? "2fa_pending" : "google_challenge"} url=${u.slice(0, 120)}`,
        note: isTotpOrBackup
          ? "Google 2-Step Verification (2FA TOTP / Backup code) pending in live window"
          : "Google sign-in verification challenge open in live window",
      };
    }
    if (/\/(?:v3\/signin|signin\/v2|challenge)\b/i.test(u)) {
      return {
        restricted: true,
        status: "not_logged_in",
        rowStatus: null,
        resultCode: "google_one_logged_out",
        evidence: `Google:not_logged_in url=${u.slice(0, 120)}`,
        note: "Google sign-in flow open in live window (not authenticated)",
      };
    }
  }
  if (!hasGoogleAuthCookies) {
    for (const t of list) {
      const u = String(t?.url || "");
      if (/^https?:\/\/(?:[\w-]+\.)?google\.(?:com(?:\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2,3})(?:\/|$)/i.test(u)) {
        return {
          restricted: true,
          status: "not_logged_in",
          rowStatus: null,
          resultCode: "login_page",
          evidence: `Google:not_logged_in url=${u.slice(0, 120)}`,
          note: "Google home page open without session cookies in live window (not logged in)",
        };
      }
    }
  }
  return null;
}

const REVOKED_GOOGLE_AUTH_COOKIE_NAMES = [
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "__Secure-1PSID",
  "__Secure-3PSID",
  "__Secure-1PAPISID",
  "__Secure-3PAPISID",
  "LSID",
  "__Host-1PLSID",
  "__Host-3PLSID",
  "OSID",
  "__Secure-OSID",
  "SIDCC",
  "__Secure-1PSIDCC",
  "__Secure-3PSIDCC",
  "__Secure-1PSIDTS",
  "__Secure-3PSIDTS",
  "ACCOUNT_CHOOSER",
  "SMSV",
  "COMPASS",
];

/**
 * No-op: Physical SQLite/Vault deletion of Google auth cookies (`SID`, `SAPISID`, `LSID`, etc.)
 * is permanently disabled (`2026-10-30`) so transient network/proxy hiccups or stale cookie probes
 * can never wipe an active or newly signed-in Google session from `Default/Network/Cookies`,
 * `Cookies.last-good.bak`, or `mail-cookie-vault.json`.
 */
function purgeRevokedGoogleAuthCookiesForProfile(_opts = {}) {
  return { deletedSqliteRows: 0, purgedVault: false };
}

function safeParseAndRepairVaultJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    const m = String(err?.message || "").match(/position\s+(\d+)/);
    if (m) {
      const pos = Number(m[1]);
      if (pos > 2) {
        const parsed = JSON.parse(raw.slice(0, pos));
        atomicWriteVaultJson(filePath, parsed);
        return parsed;
      }
    }
    throw err;
  }
}

function atomicWriteVaultJson(filePath, obj) {
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), "utf8");
  try {
    fs.renameSync(tmpPath, filePath);
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }
}

const MICROSOFT_FAMILY_SERVICES = new Set([
  "outlook",
  "hotmail",
  "microsoft",
  "microsoft 365",
  "office",
  "office 365",
  "onedrive",
  "xbox",
]);

function isMicrosoftFamilyService(svcLower = "") {
  return MICROSOFT_FAMILY_SERVICES.has(String(svcLower || "").trim().toLowerCase());
}

function isAuthenticatedMicrosoftAppUrl(url = "") {
  const u = String(url || "");
  if (!u) return false;
  const basePath = u.split(/[?#]/)[0];
  if (
    /account\.live\.com\/(?:names\/manage|proofs\/(?:manage|remind|Add)|SummaryPage|password\/Change)\b/i.test(
      basePath,
    )
  ) {
    return true;
  }
  if (
    /login\.live\.com|login\.microsoftonline\.com|account\.live\.com\/(?:Abuse|Lockout|glt|acsr|recover|proofs|identity)/i.test(
      basePath,
    )
  ) {
    return false;
  }
  return /outlook\.(?:live|office|office365)\.com\/mail|account\.microsoft\.com|onedrive\.live\.com/i.test(
    basePath,
  );
}

function classifyMicrosoftLiveCdpTargets(targets = [], { hasMicrosoftAuthCookies = false } = {}) {
  const list = Array.isArray(targets) ? targets : [];
  if (list.some((t) => isAuthenticatedMicrosoftAppUrl(t?.url))) {
    return null;
  }
  for (const t of list) {
    const u = String(t?.url || "");
    if (!/(?:login|account)\.live\.com|login\.microsoftonline\.com/i.test(u)) continue;
    const basePath = u.split(/[?#]/)[0];
    if (
      /account\.live\.com\/(?:names\/manage|proofs\/(?:manage|remind|Add)|SummaryPage|password\/Change)\b/i.test(
        basePath,
      )
    ) {
      continue;
    }
    if (/account\.live\.com\/(?:Abuse|Lockout|glt)/i.test(u)) {
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "error",
        resultCode: "account_disabled",
        evidence: `Outlook:account_locked url=${u.slice(0, 120)}`,
        note: "Microsoft account locked / Abuse challenge in live window",
      };
    }
    const decodedContinue = (() => {
      try {
        return decodeURIComponent(u);
      } catch {
        return u;
      }
    })();
    const isMsStepUpFlow =
      /[?&](?:uiflavor=host|mpcxt=CATB)\b/i.test(u) ||
      /[?&]ru=https?:\/\/account\.(?:live|microsoft)\.com\//i.test(decodedContinue);
    if (
      (hasMicrosoftAuthCookies || isMsStepUpFlow) &&
      /account\.live\.com\/(?:proofs\/Verify|proofs\/remind|identity\/confirm)\b/i.test(basePath)
    ) {
      continue;
    }
    if (/account\.live\.com\/(?:proofs|identity|acsr|recover)/i.test(u)) {
      return {
        restricted: true,
        status: "challenged",
        rowStatus: "check_phone",
        resultCode: "phone_sms_required",
        evidence: `Outlook:proofs_challenge url=${u.slice(0, 120)}`,
        note: "Microsoft identity / recovery verification required in live window",
      };
    }
    if (/login\.live\.com|login\.microsoftonline\.com/i.test(u)) {
      return {
        restricted: true,
        status: "not_logged_in",
        rowStatus: null,
        resultCode: "login_page",
        evidence: `Outlook:not_logged_in url=${u.slice(0, 120)}`,
        note: "Microsoft sign-in page open in live window (session signed out)",
      };
    }
  }
  return null;
}

const healedMicrosoftChallengeWsUrls = new Set();

/**
 * Proposal 2 (`ok 2` — Auto-Close or Auto-Redirect Completed Microsoft Challenge Tabs once `RPSSecAuth` / `MSPAuth` / `__Host-MSAAUTH` / `ESTSAUTHPERSISTENT` is Verified):
 * When `hasVerifiedMicrosoftAuth` is true (Microsoft auth cookies are verified or an authenticated Microsoft app tab is open),
 * any leftover tab still sitting on `login.live.com`, `login.microsoftonline.com`, or `account.live.com/(Abuse|Lockout|glt|proofs|identity|acsr|recover)`:
 *   - is closed via CDP `Page.close` if another tab in the window is already on an authenticated Microsoft app (`outlook.live.com/mail`, `account.microsoft.com`, etc.), OR
 *   - is automatically navigated once to `https://outlook.live.com/mail/0/` if no other authenticated Microsoft tab is open and `allowRedirect && hasOutlookRow` is true.
 */
async function autoHealCompletedMicrosoftChallengeTabs(
  targets = [],
  { hasOutlookRow = true, allowRedirect = true, timeoutMs = 1200 } = {},
) {
  const WsCtor = typeof WebSocket !== "undefined" ? WebSocket : null;
  const list = Array.isArray(targets) ? targets : [];
  if (!WsCtor || list.length === 0) {
    return { closedCount: 0, redirectedCount: 0 };
  }
  const hasAuthenticatedAppTab = list.some((t) => isAuthenticatedMicrosoftAppUrl(t?.url));
  const STALE_MICROSOFT_CHALLENGE_URL_RE =
    /(?:login\.live\.com|login\.microsoftonline\.com|account\.live\.com\/(?:Abuse|Lockout|glt|proofs|identity|acsr|recover))/i;

  let closedCount = 0;
  let redirectedCount = 0;

  for (const t of list) {
    const u = String(t?.url || "");
    const wsUrl = String(t?.webSocketDebuggerUrl || "");
    if (!wsUrl || !STALE_MICROSOFT_CHALLENGE_URL_RE.test(u)) continue;
    // Never hijack or redirect a third-party OAuth flow (ChatGPT, Claude, etc.) or an active Microsoft Security/Alias Step-Up flow
    if (/[?&](?:client_id|redirect_uri)=|oauth20_authorize/i.test(u)) continue;
    const basePath = u.split(/[?#]/)[0];
    if (
      /account\.live\.com\/(?:names\/manage|proofs\/(?:manage|remind|Add)|SummaryPage|password\/Change)\b/i.test(
        basePath,
      )
    ) {
      continue;
    }
    const decodedContinue = (() => {
      try {
        return decodeURIComponent(u);
      } catch {
        return u;
      }
    })();
    if (
      /[?&]uiflavor=host\b/i.test(u) ||
      /[?&]ru=https?:\/\/account\.(?:live|microsoft)\.com\//i.test(decodedContinue)
    ) {
      continue;
    }
    if (healedMicrosoftChallengeWsUrls.has(`${wsUrl}::${u}`)) continue;

    const shouldCloseTab = hasAuthenticatedAppTab && list.length > 1;
    const shouldRedirectToOutlook = Boolean(allowRedirect && !shouldCloseTab && hasOutlookRow);
    if (!shouldCloseTab && !shouldRedirectToOutlook) continue;

    healedMicrosoftChallengeWsUrls.add(`${wsUrl}::${u}`);
    if (healedMicrosoftChallengeWsUrls.size > 500) {
      const firstKey = healedMicrosoftChallengeWsUrls.values().next().value;
      if (firstKey) healedMicrosoftChallengeWsUrls.delete(firstKey);
    }

    try {
      const ok = await new Promise((resolve) => {
        const ws = new WsCtor(wsUrl);
        const timer = setTimeout(() => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolve(false);
        }, timeoutMs);
        ws.onopen = () => {
          if (shouldCloseTab) {
            ws.send(JSON.stringify({ id: 1, method: "Page.close", params: {} }));
          } else {
            ws.send(
              JSON.stringify({
                id: 1,
                method: "Page.navigate",
                params: { url: "https://outlook.live.com/mail/0/" },
              }),
            );
          }
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data));
            if (msg.id === 1) {
              clearTimeout(timer);
              ws.close();
              resolve(!msg.error);
            }
          } catch {
            clearTimeout(timer);
            ws.close();
            resolve(false);
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });
      if (ok) {
        if (shouldCloseTab) closedCount += 1;
        else redirectedCount += 1;
      }
    } catch {
      /* ignore */
    }
  }
  return { closedCount, redirectedCount };
}

const REVOKED_MICROSOFT_AUTH_COOKIE_NAMES = [
  "RPSSecAuth",
  "MSPAuth",
  "MSNPPAuth",
  "WLSSC",
  "SDIDC",
  "PPLState",
  "JSH",
  "JSHP",
];

function purgeRevokedMicrosoftAuthCookiesForProfile(_opts = {}) {
  return { deletedSqliteRows: 0, purgedVault: false };
}

/**
 * Classifies live CDP page targets on `claude.ai` (`https://claude.ai/restricted`, `/logout?involuntary=1`, `/login`).
 * `.claude.ai` retains its `sessionKey` cookie on `/restricted` ("Your account will remain closed") so the user
 * can click "Sign out", which previously tricked cookie-only checks into reporting `logged_in`.
 */
function classifyClaudeLiveCdpTargets(targets = []) {
  if (!Array.isArray(targets) || targets.length === 0) return null;
  let hasClaudeTab = false;
  let hasRestrictedTab = false;
  let hasLoginOrLogoutTab = false;
  let hasAuthenticatedAppTab = false;
  for (const t of targets) {
    const u = String(t?.url || "").trim();
    if (!/https?:\/\/([a-z0-9-]+\.)?claude\.ai\b/i.test(u)) continue;
    hasClaudeTab = true;
    if (/claude\.ai\/(restricted|suspended|banned|disabled)\b/i.test(u)) {
      hasRestrictedTab = true;
    } else if (/claude\.ai\/(login|logout)\b/i.test(u)) {
      hasLoginOrLogoutTab = true;
    } else if (/claude\.ai\/(new|chat|recents|projects|settings|chats)\b/i.test(u)) {
      hasAuthenticatedAppTab = true;
    }
  }
  if (!hasClaudeTab) return null;
  if (hasRestrictedTab) {
    return {
      restricted: true,
      banned: true,
      status: "not_logged_in",
      rowStatus: "disable",
      resultCode: "account_disabled_banned",
      evidence: "Claude:account_disabled_banned (https://claude.ai/restricted)",
      note: "Your account will remain closed (https://claude.ai/restricted · account_banned)",
    };
  }
  if (hasLoginOrLogoutTab && !hasAuthenticatedAppTab) {
    return {
      restricted: true,
      expired: true,
      status: "not_logged_in",
      rowStatus: null,
      resultCode: "login_page",
      evidence: "Claude:not_logged_in (live tab on /login or /logout)",
      note: "Not logged into Claude (live tab on /login)",
    };
  }
  return null;
}

if (typeof setInterval === "function" && !globalThis._p0003SyncCacheTrimTimer) {
  globalThis._p0003SyncCacheTrimTimer = setInterval(() => {
    try {
      for (const s of [healedGoogleChallengeWsUrls, healedSocialChallengeWsUrls, healedMicrosoftChallengeWsUrls]) {
        if (s && s.size > 400) s.clear();
      }
    } catch {
      /* ignore */
    }
  }, 5 * 60 * 1000);
  if (typeof globalThis._p0003SyncCacheTrimTimer.unref === "function") {
    globalThis._p0003SyncCacheTrimTimer.unref();
  }
}

module.exports = {
  fetchLiveCdpCookiesByPort,
  setLiveCdpCookiesByPort,
  fetchLiveCdpPageTargetsByPort,
  autoSkipGoogleSpeedbumpTargets,
  autoHealCompletedGoogleChallengeTabs,
  isAuthenticatedFacebookAppUrl,
  isAuthenticatedTikTokAppUrl,
  autoHealCompletedSocialChallengeTabs,
  classifyFacebookLiveCdpTargets,
  GOOGLE_FAMILY_SERVICES,
  isGoogleFamilyService,
  GOOGLE_RESTRICTION_ID_MAP,
  resolveGoogleRestrictionInfo,
  resolveGoogleRestrictionTargetServices,
  doesGoogleTargetRestrictionApplyToService,
  isAuthenticatedGoogleAppUrl,
  classifyGoogleLiveCdpTargets,
  REVOKED_GOOGLE_AUTH_COOKIE_NAMES,
  purgeRevokedGoogleAuthCookiesForProfile,
  safeParseAndRepairVaultJson,
  atomicWriteVaultJson,
  MICROSOFT_FAMILY_SERVICES,
  isMicrosoftFamilyService,
  isAuthenticatedMicrosoftAppUrl,
  classifyMicrosoftLiveCdpTargets,
  autoHealCompletedMicrosoftChallengeTabs,
  REVOKED_MICROSOFT_AUTH_COOKIE_NAMES,
  purgeRevokedMicrosoftAuthCookiesForProfile,
  classifyClaudeLiveCdpTargets,
};
