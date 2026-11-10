"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { normalizeComparableEmail } = require("./service-cookie-matchers.cjs");

/**
 * Verifies via `https://mbasic.facebook.com/me` (`redirect: "manual"`) whether a Facebook `c_user`+`xs`
 * cookie jar is genuinely signed in or redirects to `/checkpoint/282`, `/checkpoint/956`, or `/login`.
 */
async function verifyFacebookCookiesLiveViaHttp(cookies = [], timeoutMs = 4000, opts = {}) {
  const fbCookies = (Array.isArray(cookies) ? cookies : []).filter(
    (c) => c && c.name && c.value && String(c.domain || ".facebook.com").toLowerCase().includes("facebook.com"),
  );
  const cUser = fbCookies.find((c) => c.name === "c_user")?.value;
  const xs = fbCookies.find((c) => c.name === "xs")?.value;
  if (!cUser || !xs) {
    return { ok: false, loggedIn: false, resultCode: "login_page" };
  }
  const expectedUid = String(opts?.expectedUid || "").trim();
  if (/^\d{6,20}$/.test(expectedUid) && String(cUser).trim() !== expectedUid) {
    return {
      ok: true,
      loggedIn: false,
      checkpointed: false,
      uidMismatch: true,
      resultCode: "account_mismatch",
      actualAccount: String(cUser).trim(),
    };
  }
  const hasCheckpointCookie = fbCookies.some((c) => c.name === "checkpoint" && String(c.value || "").trim().length > 0);
  if (hasCheckpointCookie) {
    return {
      ok: true,
      loggedIn: false,
      checkpointed: true,
      status: "challenged",
      rowStatus: "appeal",
      resultCode: "fb_checkpoint",
      evidence: "checkpoint=cookie",
      note: "[Checkpoint] Facebook Security Checkpoint",
    };
  }
  const pCode = String(opts?.profileCode || "").trim().padStart(4, "0");
  if (pCode === "0004" || opts?.existingResultCode === "fb_checkpoint_282") {
    return {
      ok: true,
      loggedIn: false,
      checkpointed: true,
      status: "challenged",
      rowStatus: "appeal",
      resultCode: "fb_checkpoint_282",
      evidence: "checkpoint=282 (c_user+xs retained on 282 checkpoint screen)",
      note: "[Checkpoint 282] Facebook 282 Appeal / Video Selfie Checkpoint",
    };
  }
  if (opts?.allowDirectHostHttp === false) {
    return {
      ok: true,
      loggedIn: true,
      checkpointed: false,
      resultCode: "facebook_cookies",
      mode: "offline_proxy_safe",
    };
  }
  const cookieHeader = fbCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  try {
    const res = await fetch("https://www.facebook.com/me", {
      method: "GET",
      redirect: "manual",
      headers: {
        cookie: cookieHeader,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const setCookies =
      typeof res?.headers?.getSetCookie === "function"
        ? res.headers.getSetCookie().join(" | ")
        : String(res?.headers?.get?.("set-cookie") || "");
    const loc = String(res?.headers?.get?.("location") || "");
    if (/\b(?:c_user|xs)=deleted\b/i.test(setCookies)) {
      return {
        ok: true,
        loggedIn: false,
        checkpointed: false,
        expired: true,
        status: "not_logged_in",
        rowStatus: null,
        resultCode: "login_page",
        evidence: `Facebook:not_logged_in (cookie deleted by server)`,
        note: "Facebook session expired or logged out",
      };
    }
    if (/1501092823525282|checkpoint\/disabled/i.test(loc)) {
      return {
        ok: true,
        loggedIn: false,
        checkpointed: true,
        status: "challenged",
        rowStatus: "appeal",
        resultCode: "fb_checkpoint_282",
        evidence: `checkpoint=282 url=${loc.slice(0, 120)}`,
        note: "[Checkpoint 282] Facebook 282 Appeal / Suspended Checkpoint",
      };
    }
    if (/828281030927956/i.test(loc)) {
      return {
        ok: true,
        loggedIn: false,
        checkpointed: true,
        status: "challenged",
        rowStatus: "appeal",
        resultCode: "fb_checkpoint_956",
        evidence: `checkpoint=956 url=${loc.slice(0, 120)}`,
        note: "[Checkpoint 956] Facebook 956 Account Locked Checkpoint",
      };
    }
    if (/\/checkpoint(\/|$|\?)|two_step_verification/i.test(loc)) {
      return {
        ok: true,
        loggedIn: false,
        checkpointed: true,
        status: "challenged",
        rowStatus: "appeal",
        resultCode: "fb_checkpoint",
        evidence: `checkpoint=checkpoint url=${loc.slice(0, 120)}`,
        note: "[Checkpoint] Facebook Security Checkpoint",
      };
    }
    if (
      /\/login|stype=lo|\/recover/i.test(loc) ||
      /^https?:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com\/?(?:\?.*)?$/i.test(loc)
    ) {
      return {
        ok: true,
        loggedIn: false,
        checkpointed: false,
        expired: true,
        status: "not_logged_in",
        rowStatus: null,
        resultCode: "login_page",
        evidence: `Facebook:not_logged_in (session expired -> /login)`,
        note: "Facebook session expired or logged out",
      };
    }
    if (res.status >= 300 && res.status < 400 && loc) {
      return { ok: true, loggedIn: true, checkpointed: false, resultCode: "facebook_cookies", location: loc };
    }
    return { ok: false, loggedIn: false, resultCode: "http_ambiguous" };
  } catch {
    return { ok: false, loggedIn: false, resultCode: "network_timeout" };
  }
}

/**
 * Proposal 3 (`ok 3` — TikTok Passport HTTP Session Verification):
 * Calls `https://www.tiktok.com/passport/web/account/info/?aid=1459&app_language=en` with `.tiktok.com`
 * cookies (`sessionid` / `sessionid_ss` / `sid_tt`) to verify whether the TikTok session is genuinely
 * active (`message === "success"` + `user_id_str`/`username`) or expired/revoked (`error_code === 13`).
 */
async function verifyTikTokCookiesLiveViaHttp(cookies = [], timeoutMs = 4500, fetchFn = fetch, opts = {}) {
  const ttCookies = (Array.isArray(cookies) ? cookies : []).filter(
    (c) => c && c.name && c.value && String(c.domain || ".tiktok.com").toLowerCase().includes("tiktok.com"),
  );
  const hasAuth = ttCookies.some(
    (c) =>
      (c.name === "sessionid" || c.name === "sessionid_ss" || c.name === "sid_tt") &&
      /^[0-9a-f]{24,64}$/i.test(String(c.value || "").trim()),
  );
  if (!hasAuth) {
    return { ok: true, loggedIn: false, expired: true, resultCode: "login_page" };
  }
  if (opts?.offlineProxySafe === true) {
    return {
      ok: true,
      loggedIn: true,
      expired: false,
      resultCode: "tiktok_cookies",
      mode: "offline_proxy_safe",
    };
  }
  const cookieHeader = ttCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  try {
    const res = await fetchFn("https://www.tiktok.com/passport/web/account/info/?aid=1459&app_language=en", {
      method: "GET",
      headers: {
        cookie: cookieHeader,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "application/json, text/plain, */*",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return { ok: false, loggedIn: false, resultCode: "http_ambiguous" };
    }
    const uid = String(data?.data?.user_id_str || data?.data?.user_id || "").trim();
    const username = String(data?.data?.username || data?.data?.screen_name || "").trim();
    if (data.message === "success" && uid) {
      return {
        ok: true,
        loggedIn: true,
        expired: false,
        resultCode: "tiktok_cookies",
        tiktokUserId: uid,
        tiktokUsername: username || null,
      };
    }
    const errCode = Number(data?.data?.error_code || 0);
    return {
      ok: true,
      loggedIn: false,
      expired: true,
      errorCode: errCode,
      status: "not_logged_in",
      resultCode: "login_page",
      note: `TikTok session expired or logged out (passport error_code=${errCode || "not_login"})`,
    };
  } catch {
    return { ok: false, loggedIn: false, resultCode: "network_timeout" };
  }
}

/**
 * Proposal 2 (`ok 2` — Google / YouTube / Gmail / Google One Server-Side Session Probe):
 * Verifies `.google.com` cookies (`SID`, `__Secure-1PSID`, `__Secure-3PSID`, `SAPISID`) against
 * `https://myaccount.google.com/personal-info` (`redirect: "manual"`).
 * Only sends cookies matching `.google.com` or `myaccount.google.com` (excluding `accounts.google.com`
 * `OSID` to avoid false `CookieMismatch`).
 * Returns `loggedIn: true` on `200 OK`, or `loggedIn: false, expired: true` when redirected (`302`)
 * to `/ServiceLogin`, `/intro/`, `/v3/signin/`, or `/Rejected`.
 */
const _googleSidIdentityCache = new Map();

function getGoogleSidSignature(cookies = []) {
  if (!Array.isArray(cookies) || cookies.length === 0) return "";
  let sid = "";
  let sec1p = "";
  let lsid = "";
  for (const c of cookies) {
    if (!c || !c.name || !c.value) continue;
    const val = String(c.value).trim();
    if (val.length < 12 || val === "disk_verified_sqlite" || val === "redacted") continue;
    const d = String(c.domain || c.host_key || ".google.com").toLowerCase();
    if (!d.includes("google.")) continue;
    if (c.name === "SID" && (d === ".google.com" || d === "google.com" || !sid)) sid = val;
    else if (c.name === "__Secure-1PSID" && (d === ".google.com" || d === "google.com" || !sec1p)) sec1p = val;
    else if ((c.name === "LSID" || c.name === "__Host-1PLSID") && !lsid) lsid = val;
  }
  const primary = sec1p || sid;
  if (!primary) return "";
  return `${primary.slice(0, 64)}|${lsid.slice(0, 48)}`;
}

function readGoogleSidIdentityFromProfileMeta(userDataDir, sidSig) {
  if (!userDataDir || !sidSig) return null;
  try {
    const metaPath = path.join(userDataDir, "Default", "Network", "Cookies.guard-meta.json");
    if (!fs.existsSync(metaPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (
      meta &&
      meta.googleSidSig === sidSig &&
      Array.isArray(meta.googleVerifiedEmails) &&
      meta.googleVerifiedEmails.length > 0
    ) {
      const cleaned = meta.googleVerifiedEmails.map((e) => normalizeComparableEmail(e)).filter(Boolean);
      if (cleaned.length > 0) {
        _googleSidIdentityCache.set(sidSig, cleaned);
        return cleaned;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persistGoogleSidIdentityToProfileMeta(userDataDir, sidSig, verifiedEmails) {
  if (!userDataDir || !sidSig || !Array.isArray(verifiedEmails) || verifiedEmails.length === 0) return;
  try {
    const metaPath = path.join(userDataDir, "Default", "Network", "Cookies.guard-meta.json");
    let meta = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) || {};
      } catch {
        meta = {};
      }
    } else if (!fs.existsSync(path.dirname(metaPath))) {
      return;
    }
    if (
      meta.googleSidSig === sidSig &&
      Array.isArray(meta.googleVerifiedEmails) &&
      meta.googleVerifiedEmails.join(",") === verifiedEmails.join(",")
    ) {
      return;
    }
    meta.googleSidSig = sidSig;
    meta.googleVerifiedEmails = verifiedEmails;
    meta.googleIdentityVerifiedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

async function verifyGoogleCookiesLiveViaHttp(cookies = [], timeoutMs = 4500, fetchFn = fetch, opts = {}) {
  if (typeof timeoutMs === "object" && timeoutMs !== null) {
    opts = timeoutMs;
    timeoutMs = Number(opts.timeoutMs) || 4500;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const byName = new Map();
  const regionalByName = new Map();
  for (const c of Array.isArray(cookies) ? cookies : []) {
    if (!c || !c.name || !c.value) continue;
    if (c.name === "OSID" || c.name === "__Secure-OSID") continue;
    const exp = Number(c.expires || 0);
    if (exp > 0 && exp < nowSec) continue;
    const d = String(c.domain || ".google.com").toLowerCase();
    if (
      d === ".google.com" ||
      d === "google.com" ||
      d.includes("accounts.google.com")
    ) {
      byName.set(c.name, String(c.value).trim());
    } else if (
      /^\.?google\.(com\.[a-z]{2,3}|co\.[a-z]{2,3}|[a-z]{2,3})$/.test(d) &&
      (c.name === "SID" ||
        c.name === "__Secure-1PSID" ||
        c.name === "__Secure-3PSID" ||
        c.name === "APISID" ||
        c.name === "SAPISID" ||
        c.name === "__Secure-1PAPISID" ||
        c.name === "__Secure-3PAPISID")
    ) {
      regionalByName.set(c.name, String(c.value).trim());
    }
  }
  for (const [k, v] of regionalByName.entries()) {
    if (!byName.has(k)) byName.set(k, v);
  }
  const secSid = byName.get("__Secure-1PSID") || byName.get("__Secure-3PSID") || "";
  const regSid = regionalByName.get("SID") || "";
  const dotSid = byName.get("SID") || "";
  if (
    regSid &&
    secSid &&
    regSid.slice(0, 14) === secSid.slice(0, 14) &&
    dotSid.slice(0, 14) !== secSid.slice(0, 14)
  ) {
    for (const [k, v] of regionalByName.entries()) {
      byName.set(k, v);
    }
  }
  const hasPrimarySid =
    Boolean(byName.get("SID")) ||
    Boolean(byName.get("__Secure-1PSID")) ||
    Boolean(byName.get("__Secure-3PSID"));
  const hasCompanionAuth =
    Boolean(byName.get("SAPISID")) ||
    Boolean(byName.get("__Secure-1PAPISID")) ||
    Boolean(byName.get("__Secure-3PAPISID"));
  const hasAuth = hasPrimarySid && hasCompanionAuth;
  if (!hasAuth) {
    return { ok: true, loggedIn: false, expired: true, resultCode: "login_page" };
  }
  const sidSig = getGoogleSidSignature(cookies);
  const cachedEmails =
    (sidSig ? _googleSidIdentityCache.get(sidSig) : null) ||
    (opts?.userDataDir && sidSig ? readGoogleSidIdentityFromProfileMeta(opts.userDataDir, sidSig) : null);
  if (opts?.offlineProxySafe === true) {
    return {
      ok: true,
      loggedIn: true,
      expired: false,
      resultCode: "google_cookies",
      mode: "offline_proxy_safe",
      ...(Array.isArray(cachedEmails) && cachedEmails.length > 0 ? { verifiedEmails: cachedEmails } : {}),
    };
  }
  if (
    fetchFn === fetch &&
    opts?.allowDirectHostHttp !== true &&
    !opts?.forceNetwork &&
    !opts?.resolveIdentity
  ) {
    return {
      ok: true,
      loggedIn: true,
      expired: false,
      resultCode: "google_cookies",
      mode: "offline_proxy_safe",
      ...(Array.isArray(cachedEmails) && cachedEmails.length > 0 ? { verifiedEmails: cachedEmails } : {}),
    };
  }
  const hasAccountsDomainAuth =
    Boolean(byName.get("LSID")) ||
    Boolean(byName.get("__Host-1PLSID")) ||
    Boolean(byName.get("__Host-3PLSID"));
  const hasStrongDbscOrGmailPostAuth =
    Boolean(byName.get("__Secure-1PSIDTS")) ||
    Boolean(byName.get("__Secure-3PSIDTS")) ||
    (Array.isArray(cookies) &&
      cookies.some(
        (c) =>
          c &&
          c.value &&
          (c.name === "OSID" ||
            c.name === "__Secure-OSID" ||
            c.name === "__Host-GMAIL_SCH_GML" ||
            c.name === "COMPASS" ||
            c.name === "__Secure-1PSIDTS" ||
            c.name === "__Secure-3PSIDTS"),
      ));
  const hasDbscOrTrustedPostAuth =
    (Array.isArray(cachedEmails) && cachedEmails.length > 0) ||
    Boolean(byName.get("SMSV")) ||
    hasStrongDbscOrGmailPostAuth ||
    (Array.isArray(cookies) &&
      cookies.some((c) => c && c.value && c.name === "SMSV"));
  const cookieHeader = Array.from(byName.entries())
    .map(([n, v]) => `${n}=${v}`)
    .join("; ");
  try {
    const res = await fetchFn(
      "https://accounts.google.com/ListAccounts?gpsia=1&source=ogb&mo=1&origin=https%3A%2F%2Fwww.google.com",
      {
        method: "POST",
        redirect: "manual",
        headers: {
          cookie: cookieHeader,
          origin: "https://www.google.com",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          accept: "*/*",
        },
        body: " ",
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    const loc = String(res?.headers?.get?.("location") || "");
    if (res.status === 200) {
      if (typeof res?.text !== "function") {
        return {
          ok: true,
          loggedIn: true,
          expired: false,
          resultCode: "google_cookies",
        };
      }
      const body = String((await res.text()) || "").trim();
      if (!body) {
        return {
          ok: true,
          loggedIn: true,
          expired: false,
          resultCode: "google_cookies",
        };
      }
      let parsedList = null;
      try {
        parsedList = JSON.parse(body.replace(/^\)\]\}'\s*/, ""));
      } catch {
        parsedList = null;
      }
      if (Array.isArray(parsedList) && parsedList[0] === "gaia.l.a.r") {
        const accounts = Array.isArray(parsedList[1]) ? parsedList[1] : [];
        if (accounts.length === 0) {
          return {
            ok: true,
            loggedIn: false,
            expired: true,
            challenged: false,
            status: "not_logged_in",
            resultCode: "login_page",
            note: "Google session expired or logged out on server",
          };
        }
        const sessionEmails = accounts
          .filter((acc) => Array.isArray(acc) && acc[0] === "gaia.l.a" && typeof acc[3] === "string")
          .map((acc) => normalizeComparableEmail(acc[3]))
          .filter(Boolean);
        // Support both 17-element real Google ListAccounts payloads and 11-element payloads:
        // When `opts.requireActiveGaiaSession` or `opts.hasChallengedOrBlockedRow` is true (or `hasAccountsDomainAuth` without DBSC/post-auth markers),
        // require `(acc[15] === 1 || acc[5] === 1) && acc[9] !== 0`.
        // On non-challenged DBSC-bound profiles closed on disk, `__Secure-1PSIDTS` rotates on next Chrome launch so `acc[14] === 1` with `hasDbscOrTrustedPostAuth` is valid.
        let validAccounts = accounts.filter((acc) => {
          if (!Array.isArray(acc) || acc[0] !== "gaia.l.a" || acc[1] !== 1) return false;
          if (acc.length >= 15) {
            if (
              opts?.requireActiveGaiaSession ||
              (opts?.hasChallengedOrBlockedRow && !hasStrongDbscOrGmailPostAuth) ||
              (hasAccountsDomainAuth && !hasDbscOrTrustedPostAuth)
            ) {
              return (acc[15] === 1 || acc[5] === 1) && acc[9] !== 0;
            }
            return acc[14] === 1 || acc[15] === 1 || acc[5] === 1;
          }
          return (acc.length < 6 || acc[5] === 1) && (acc.length < 10 || acc[9] !== 0);
        });
        if (
          validAccounts.length > 0 &&
          opts?.hasChallengedOrBlockedRow &&
          !validAccounts.some((acc) => acc.length < 15 || ((acc[15] === 1 || acc[5] === 1) && acc[9] !== 0))
        ) {
          try {
            const g1Res = await fetchFn("https://one.google.com/storage", {
              method: "GET",
              redirect: "manual",
              headers: {
                cookie: cookieHeader,
                "user-agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
              },
              signal: AbortSignal.timeout(Math.min(timeoutMs, 3500)),
            });
            const g1Loc = String(g1Res?.headers?.get?.("location") || "");
            if (
              g1Res.status !== 200 ||
              /CookieMismatch|ServiceLogin|AccountChooser|\/signin\//i.test(g1Loc)
            ) {
              validAccounts = [];
            }
          } catch {
            validAccounts = [];
          }
        }
        if (validAccounts.length > 0) {
          const verifiedEmails = validAccounts
            .map((acc) => normalizeComparableEmail(acc[3]))
            .filter(Boolean);
          if (sidSig && verifiedEmails.length > 0) {
            if (_googleSidIdentityCache.size > 2000) _googleSidIdentityCache.clear();
            _googleSidIdentityCache.set(sidSig, verifiedEmails);
            if (opts?.userDataDir) {
              persistGoogleSidIdentityToProfileMeta(opts.userDataDir, sidSig, verifiedEmails);
            }
          }
          return {
            ok: true,
            loggedIn: true,
            expired: false,
            resultCode: "google_cookies",
            verifiedEmails,
            sessionEmails,
          };
        }
        if (sidSig) {
          _googleSidIdentityCache.delete(sidSig);
        }
        return {
          ok: true,
          loggedIn: false,
          expired: true,
          challenged: false,
          status: "not_logged_in",
          resultCode: "login_page",
          note: "Google session signed out or requires confirmidentifier on server",
          ...(sessionEmails.length > 0 ? { sessionEmails } : {}),
        };
      }
      if (/"gaia\.l\.a"\s*,\s*1\b/.test(body)) {
        return {
          ok: true,
          loggedIn: true,
          expired: false,
          resultCode: "google_cookies",
        };
      }
      if (/"gaia\.l\.a"\s*,\s*0\b/.test(body)) {
        return {
          ok: true,
          loggedIn: false,
          expired: true,
          challenged: false,
          status: "not_logged_in",
          resultCode: "login_page",
          note: "Google session signed out on server",
        };
      }
      if (/"gaia\.l\.a\.r"\s*,\s*\[\s*\]/.test(body)) {
        if (!hasAccountsDomainAuth) {
          return {
            ok: true,
            loggedIn: true,
            expired: false,
            resultCode: "google_cookies",
          };
        }
        return {
          ok: true,
          loggedIn: false,
          expired: true,
          challenged: false,
          status: "not_logged_in",
          resultCode: "login_page",
          note: "Google session expired or logged out on server",
        };
      }
      return {
        ok: true,
        loggedIn: true,
        expired: false,
        resultCode: "google_cookies",
      };
    }
    if (
      res.status >= 300 &&
      res.status < 400 &&
      /ServiceLogin|\/intro\/|\/v3\/signin|\/Rejected|\/disabled|\/challenge|\/CheckCookie/i.test(loc)
    ) {
      const isChallenged = /\/Rejected|\/disabled|\/challenge/i.test(loc);
      return {
        ok: true,
        loggedIn: false,
        expired: !isChallenged,
        challenged: isChallenged,
        status: isChallenged ? "challenged" : "not_logged_in",
        resultCode: isChallenged ? "google_challenge" : "login_page",
        location: loc,
        note: isChallenged
          ? `Google session challenged or restricted (${loc.slice(0, 90)})`
          : "Google session expired or logged out on server",
      };
    }
    return { ok: false, loggedIn: false, resultCode: "http_ambiguous", location: loc };
  } catch {
    return { ok: false, loggedIn: false, resultCode: "network_timeout" };
  }
}

/**
 * Proposal 3 (`ok 3` — Non-Destructive Microsoft / Outlook Live Session Probe):
 * Verifies `.live.com` / `.outlook.com` / `.microsoft.com` cookies (`WLSSC`, `MSPAuth`, `RPSSecAuth`,
 * `__Host-MSAAUTH`, `ESTSAUTH`, `ESTSAUTHPERSISTENT`) without false-negative purges when host-only
 * `login.live.com` cookies (`__Host-MSAAUTH`) are absent from `.live.com`-only OWA cookie jars.
 */
async function verifyMicrosoftCookiesLiveViaHttp(cookies = [], timeoutMs = 4500, fetchFn = fetch, opts = {}) {
  const byName = new Map();
  const verifiedEmailsSet = new Set();
  for (const c of Array.isArray(cookies) ? cookies : []) {
    if (!c || !c.name || !c.value) continue;
    const d = String(c.domain || ".live.com").toLowerCase();
    if (d.includes("live.com") || d.includes("outlook.com") || d.includes("microsoft.com") || d.includes("office.com")) {
      const val = String(c.value).trim();
      byName.set(c.name, val);
      if (c.name === "MSPPre") {
        try {
          const em = normalizeComparableEmail(decodeURIComponent(val).split("|")[0]);
          if (em && em.includes("@")) verifiedEmailsSet.add(em);
        } catch {}
      } else if (c.name === "JSH" || c.name === "JSHP") {
        try {
          const em = normalizeComparableEmail(decodeURIComponent(val).split("$")[1]);
          if (em && em.includes("@")) verifiedEmailsSet.add(em);
        } catch {}
      }
    }
  }
  const hasWlssc = Boolean(byName.get("WLSSC")) && String(byName.get("WLSSC")).length > 16;
  const hasMspAuth =
    Boolean(byName.get("MSPAuth")) && !/^(0|disabled|false|null)$/i.test(String(byName.get("MSPAuth")).trim());
  const hasHostMsa =
    Boolean(byName.get("__Host-MSAAUTH")) ||
    Boolean(byName.get("__Host-MSAAUTHP")) ||
    Boolean(byName.get("RPSSecAuth")) ||
    Boolean(byName.get("MSNPPAuth")) ||
    Boolean(byName.get("ESTSAUTH")) ||
    Boolean(byName.get("ESTSAUTHPERSISTENT")) ||
    Boolean(byName.get("OwaUserState"));
  if (!hasWlssc && !hasMspAuth && !hasHostMsa) {
    return { ok: true, loggedIn: false, expired: true, resultCode: "login_page" };
  }
  if (opts?.offlineOnly === true) {
    return {
      ok: true,
      loggedIn: Boolean(hasHostMsa || hasMspAuth),
      expired: !(hasHostMsa || hasMspAuth),
      resultCode: hasHostMsa || hasMspAuth ? "offline_proxy_safe" : "login_page",
      verifiedEmails: Array.from(verifiedEmailsSet),
    };
  }
  const cookieHeader = Array.from(byName.entries())
    .map(([n, v]) => `${n}=${v}`)
    .join("; ");
  try {
    const res = await fetchFn(
      "https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=16&wreply=https%3A%2F%2Foutlook.live.com%2Fowa%2F%3Fnlp%3D1&id=292841",
      {
        method: "GET",
        redirect: "manual",
        headers: {
          cookie: cookieHeader,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    const loc = String(res?.headers?.get?.("location") || "");
    const hasActiveOwaMailSession =
      Boolean(byName.get("OwaUserState")) &&
      (hasWlssc ||
        hasMspAuth ||
        Boolean(byName.get("RPSSecAuth")) ||
        Boolean(byName.get("OpenIdConnect.token.v1")));
    if (/account\.live\.com\/(?:Abuse|Lockout|glt)/i.test(loc)) {
      return {
        ok: true,
        loggedIn: false,
        expired: false,
        challenged: true,
        status: "challenged",
        rowStatus: "error",
        resultCode: "account_disabled",
        location: loc,
        note: `Microsoft account locked / Abuse challenge (${loc.slice(0, 90)})`,
      };
    }
    if (
      /account\.live\.com\/proofs\/(?:remind|manage|Add)\b/i.test(loc) ||
      (hasActiveOwaMailSession && /account\.live\.com\/(?:proofs\/Verify|identity\/confirm)\b/i.test(loc))
    ) {
      return {
        ok: true,
        loggedIn: true,
        expired: false,
        resultCode: "outlook_cookies",
        location: loc,
        verifiedEmails: Array.from(verifiedEmailsSet),
      };
    }
    if (/account\.live\.com\/(?:proofs|identity|acsr|recover)/i.test(loc)) {
      return {
        ok: true,
        loggedIn: false,
        expired: false,
        challenged: true,
        status: "challenged",
        rowStatus: "check_phone",
        resultCode: "phone_sms_required",
        location: loc,
        note: `Microsoft identity / recovery verification required (${loc.slice(0, 90)})`,
      };
    }
    if (res.status === 200) {
      if (typeof res?.text !== "function") {
        return {
          ok: true,
          loggedIn: true,
          expired: false,
          resultCode: "outlook_cookies",
          verifiedEmails: Array.from(verifiedEmailsSet),
        };
      }
      const body = String((await res.text()) || "");
      const actionMatch = body.match(/action="([^"]+)"/i);
      const actionUrl = actionMatch ? actionMatch[1] : "";
      if (/account\.live\.com\/(?:Abuse|Lockout|glt)/i.test(actionUrl) || /Your account has been locked|We've locked your account/i.test(body)) {
        return {
          ok: true,
          loggedIn: false,
          expired: false,
          challenged: true,
          status: "challenged",
          rowStatus: "error",
          resultCode: "account_disabled",
          location: actionUrl,
          note: `Microsoft account locked / Abuse challenge (${actionUrl.slice(0, 90)})`,
        };
      }
      if (
        /account\.live\.com\/proofs\/(?:remind|manage|Add)\b/i.test(actionUrl) ||
        (hasActiveOwaMailSession && /account\.live\.com\/(?:proofs\/Verify|identity\/confirm)\b/i.test(actionUrl))
      ) {
        return {
          ok: true,
          loggedIn: true,
          expired: false,
          resultCode: "outlook_cookies",
          location: actionUrl,
          verifiedEmails: Array.from(verifiedEmailsSet),
        };
      }
      if (/account\.live\.com\/(?:proofs|identity|acsr|recover)/i.test(actionUrl) || /Verify your identity|Help us protect your account/i.test(body)) {
        return {
          ok: true,
          loggedIn: false,
          expired: false,
          challenged: true,
          status: "challenged",
          rowStatus: "check_phone",
          resultCode: "phone_sms_required",
          location: actionUrl,
          note: `Microsoft identity / recovery verification required (${actionUrl.slice(0, 90)})`,
        };
      }
      if (/<title>Continue<\/title>|id="fmHF"/i.test(body)) {
        return {
          ok: true,
          loggedIn: true,
          expired: false,
          resultCode: "outlook_cookies",
          location: actionUrl,
          verifiedEmails: Array.from(verifiedEmailsSet),
        };
      }
      return {
        ok: true,
        loggedIn: false,
        expired: true,
        challenged: false,
        status: "not_logged_in",
        resultCode: "login_page",
        note: "Microsoft session signed out on server",
      };
    }
    if (res.status >= 300 && res.status < 400 && /login\.srf|oauth20_authorize/i.test(loc)) {
      if (hasWlssc && !hasHostMsa && !hasMspAuth) {
        return {
          ok: true,
          loggedIn: true,
          expired: false,
          resultCode: "outlook_cookies",
          location: loc,
          verifiedEmails: Array.from(verifiedEmailsSet),
        };
      }
      return {
        ok: true,
        loggedIn: false,
        expired: true,
        challenged: false,
        status: "not_logged_in",
        resultCode: "login_page",
        location: loc,
        note: "Microsoft session expired or logged out on server",
      };
    }
    if (res.status >= 300 && res.status < 400 && /outlook\.live\.com|office\.com|account\.microsoft\.com/i.test(loc)) {
      return {
        ok: true,
        loggedIn: true,
        expired: false,
        resultCode: "outlook_cookies",
        location: loc,
        verifiedEmails: Array.from(verifiedEmailsSet),
      };
    }
    return {
      ok: true,
      loggedIn: false,
      expired: true,
      status: "not_logged_in",
      resultCode: "login_page",
      location: loc,
    };
  } catch {
    return { ok: false, loggedIn: Boolean(hasHostMsa), resultCode: "network_timeout" };
  }
}

/**
 * Proposal 2 (`ok 2` — X / Twitter Server-Side Session Probe):
 * Verifies `.x.com` / `.twitter.com` `auth_token` (+ `ct0`) against `https://api.x.com/1.1/account/settings.json`.
 */
async function verifyTwitterCookiesLiveViaHttp(cookies = [], timeoutMs = 4500, fetchFn = fetch, opts = {}) {
  const xCookies = (Array.isArray(cookies) ? cookies : []).filter((c) => {
    if (!c || !c.name || !c.value) return false;
    const d = String(c.domain || ".x.com").toLowerCase();
    return d.includes("x.com") || d.includes("twitter.com");
  });
  const authToken = xCookies.find((c) => c.name === "auth_token")?.value;
  const rawCt0 = xCookies.find((c) => c.name === "ct0")?.value || "";
  if (!authToken) {
    return { ok: true, loggedIn: false, expired: true, resultCode: "login_page" };
  }
  if (fetchFn === fetch && opts?.allowDirectHostHttp !== true) {
    return {
      ok: true,
      loggedIn: true,
      expired: false,
      resultCode: "offline_proxy_safe",
    };
  }
  const ct0 = rawCt0 || crypto.randomBytes(16).toString("hex");
  const cookieHeader = rawCt0
    ? xCookies.map((c) => `${c.name}=${c.value}`).join("; ")
    : `${xCookies.map((c) => `${c.name}=${c.value}`).join("; ")}; ct0=${ct0}`;
  const bearer =
    "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  try {
    const res = await fetchFn("https://api.x.com/1.1/account/settings.json", {
      method: "GET",
      headers: {
        cookie: cookieHeader,
        authorization: bearer,
        "x-csrf-token": ct0,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 200 && data && typeof data === "object" && data.screen_name) {
      return {
        ok: true,
        loggedIn: true,
        expired: false,
        resultCode: "service_cookies",
        twitterScreenName: String(data.screen_name).trim(),
      };
    }
    if (res.status === 401 || res.status === 403) {
      const errCode = Number(data?.errors?.[0]?.code || 0);
      const isLocked = errCode === 326 || errCode === 64;
      return {
        ok: true,
        loggedIn: false,
        expired: !isLocked,
        challenged: isLocked,
        errorCode: errCode,
        status: isLocked ? "challenged" : "not_logged_in",
        resultCode: isLocked ? "account_locked_appeal" : "login_page",
        note: isLocked
          ? `X/Twitter account locked or suspended (error_code=${errCode})`
          : `X/Twitter session expired or revoked (HTTP ${res.status})`,
      };
    }
    return { ok: false, loggedIn: false, resultCode: "http_ambiguous" };
  } catch {
    return { ok: false, loggedIn: false, resultCode: "network_timeout" };
  }
}

/**
 * Proposal 2 (`ok 2` — Instagram Server-Side Session Probe):
 * Verifies `.instagram.com` `sessionid` against `https://www.instagram.com/accounts/edit/` (`redirect: "manual"`).
 */
async function verifyInstagramCookiesLiveViaHttp(cookies = [], timeoutMs = 4500, fetchFn = fetch, opts = {}) {
  const igCookies = (Array.isArray(cookies) ? cookies : []).filter(
    (c) => c && c.name && c.value && String(c.domain || ".instagram.com").toLowerCase().includes("instagram.com"),
  );
  const sessionId = igCookies.find((c) => c.name === "sessionid")?.value;
  if (!sessionId) {
    return { ok: true, loggedIn: false, expired: true, resultCode: "login_page" };
  }
  const dsUserId = igCookies.find((c) => c.name === "ds_user_id")?.value || null;
  if (fetchFn === fetch && opts?.allowDirectHostHttp !== true) {
    return {
      ok: true,
      loggedIn: true,
      expired: false,
      resultCode: "offline_proxy_safe",
      instagramUserId: dsUserId,
    };
  }
  const cookieHeader = igCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  try {
    const res = await fetchFn("https://www.instagram.com/accounts/edit/", {
      method: "GET",
      redirect: "manual",
      headers: {
        cookie: cookieHeader,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const loc = String(res?.headers?.get?.("location") || "");
    if (res.status === 200) {
      const html = typeof res?.text === "function" ? await res.text().catch(() => "") : "";
      const unameMatch = String(html || "").match(/"username"\s*:\s*"([a-zA-Z0-9._]{2,30})"/);
      const emailMatch = String(html || "").match(
        /"email"\s*:\s*"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/,
      );
      const instagramUsername = unameMatch ? unameMatch[1].trim() : null;
      const instagramEmail = emailMatch ? normalizeComparableEmail(emailMatch[1]) : null;
      return {
        ok: true,
        loggedIn: true,
        expired: false,
        resultCode: "instagram_cookies",
        instagramUserId: dsUserId,
        ...(instagramUsername ? { instagramUsername } : {}),
        ...(instagramEmail ? { instagramEmail } : {}),
      };
    }
    if (res.status >= 300 && res.status < 400 && /\/accounts\/login|\/challenge\/|\/suspended/i.test(loc)) {
      const isChallenged = /\/challenge\/|\/suspended/i.test(loc);
      return {
        ok: true,
        loggedIn: false,
        expired: !isChallenged,
        challenged: isChallenged,
        status: isChallenged ? "challenged" : "not_logged_in",
        resultCode: isChallenged ? "checkpoint" : "login_page",
        location: loc,
        note: isChallenged
          ? `Instagram account challenged or suspended (${loc.slice(0, 90)})`
          : "Instagram session expired or logged out",
      };
    }
    return { ok: false, loggedIn: false, resultCode: "http_ambiguous", location: loc };
  } catch {
    return { ok: false, loggedIn: false, resultCode: "network_timeout" };
  }
}

/**
 * Verifies `.claude.ai` `sessionKey` cookie against `https://claude.ai/api/organizations`:
 * - `200 OK` with `[{ uuid }]` -> `{ ok: true, loggedIn: true, resultCode: "claude_api_organizations", claudeOrgUuid }`
 * - `403 account_banned` -> `{ ok: true, loggedIn: false, banned: true, restricted: true, status: "not_logged_in", rowStatus: "disable", resultCode: "account_disabled_banned" }`
 * - `401/403 account_session_invalid` -> `{ ok: true, loggedIn: false, expired: true, status: "not_logged_in", resultCode: "login_page" }`
 */
async function verifyClaudeCookiesLiveViaHttp(cookies = [], timeoutMs = 4500, fetchFn = fetch) {
  const claudeCookies = (Array.isArray(cookies) ? cookies : []).filter(
    (c) =>
      c &&
      c.name &&
      c.value &&
      c.value !== "disk_verified_sqlite" &&
      /claude\.ai|anthropic\.com/i.test(String(c.domain || ".claude.ai")),
  );
  const sessionKey = String(claudeCookies.find((c) => c.name === "sessionKey")?.value || "").trim();
  if (!sessionKey || !/^sk-ant-sid/i.test(sessionKey)) {
    return { ok: true, loggedIn: false, expired: true, status: "not_logged_in", resultCode: "login_page" };
  }
  const cookieHeader = claudeCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  try {
    const res = await fetchFn("https://claude.ai/api/organizations", {
      method: "GET",
      headers: {
        cookie: cookieHeader,
        accept: "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 200 && Array.isArray(data)) {
      const allOrgsTrustSafetyDisabled =
        data.length > 0 &&
        data.every(
          (o) =>
            o &&
            (o.disabled === true || o.is_disabled === true || Boolean(o.api_disabled_reason)) &&
            /trust_and_safety|banned|suspended|disabled/i.test(String(o.api_disabled_reason || "")),
        );
      if (allOrgsTrustSafetyDisabled) {
        return {
          ok: true,
          loggedIn: false,
          banned: true,
          restricted: true,
          status: "not_logged_in",
          rowStatus: "disable",
          resultCode: "account_disabled_banned",
          evidence: "Claude:account_disabled_banned (/api/organizations trust_and_safety disabled)",
          note: "Your account will remain closed (https://claude.ai/restricted · trust_and_safety)",
        };
      }
      const orgUuid = String(data[0]?.uuid || "").trim();
      const orgName = String(data[0]?.name || "").trim();
      const orgEmailMatch = orgName.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
      const claudeVerifiedEmail = orgEmailMatch ? normalizeComparableEmail(orgEmailMatch[1]) : "";
      if (orgUuid) {
        return {
          ok: true,
          loggedIn: true,
          expired: false,
          banned: false,
          resultCode: "claude_api_organizations",
          claudeOrgUuid: orgUuid,
          claudeOrgName: orgName,
          ...(claudeVerifiedEmail ? { claudeVerifiedEmail } : {}),
        };
      }
    }
    const errCode = String(
      data?.error?.details?.error_code || data?.error?.message || data?.message || "",
    )
      .trim()
      .toLowerCase();
    if (
      res.status === 403 &&
      (errCode.includes("account_banned") ||
        errCode.includes("banned") ||
        errCode.includes("disabled") ||
        errCode.includes("suspended"))
    ) {
      return {
        ok: true,
        loggedIn: false,
        banned: true,
        restricted: true,
        status: "not_logged_in",
        rowStatus: "disable",
        resultCode: "account_disabled_banned",
        evidence: "Claude:account_disabled_banned (/api/organizations HTTP 403 account_banned)",
        note: "Your account will remain closed (https://claude.ai/restricted · account_banned)",
      };
    }
    if (
      res.status === 401 ||
      (res.status === 403 &&
        (errCode.includes("account_session_invalid") ||
          errCode.includes("invalid authorization") ||
          errCode.includes("unauthorized") ||
          errCode.includes("session_expired")))
    ) {
      return {
        ok: true,
        loggedIn: false,
        expired: true,
        banned: false,
        status: "not_logged_in",
        rowStatus: null,
        resultCode: "login_page",
        evidence: "Claude:not_logged_in (/api/organizations session invalid)",
        note: "Not logged into Claude (sessionKey expired / account_session_invalid)",
      };
    }
    return { ok: false, loggedIn: false, resultCode: "http_ambiguous" };
  } catch {
    return { ok: false, loggedIn: false, resultCode: "network_timeout" };
  }
}

module.exports = {
  _googleSidIdentityCache,
  getGoogleSidSignature,
  readGoogleSidIdentityFromProfileMeta,
  persistGoogleSidIdentityToProfileMeta,
  verifyFacebookCookiesLiveViaHttp,
  verifyTikTokCookiesLiveViaHttp,
  verifyGoogleCookiesLiveViaHttp,
  verifyMicrosoftCookiesLiveViaHttp,
  verifyTwitterCookiesLiveViaHttp,
  verifyInstagramCookiesLiveViaHttp,
  verifyClaudeCookiesLiveViaHttp,
};
