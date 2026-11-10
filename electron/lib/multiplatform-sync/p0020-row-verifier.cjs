"use strict";

const {
  readProfileSpaStorageSummary,
  matchServiceSpaStorage,
  normalizeComparableEmail,
  areComparableEmailsEqual,
} = require("./service-cookie-matchers.cjs");
const {
  autoHealCompletedSocialChallengeTabs,
  isGoogleFamilyService,
  doesGoogleTargetRestrictionApplyToService,
  isMicrosoftFamilyService,
} = require("./live-cdp-targets.cjs");
const {
  verifyFacebookCookiesLiveViaHttp,
  verifyTikTokCookiesLiveViaHttp,
  verifyGoogleCookiesLiveViaHttp,
  verifyTwitterCookiesLiveViaHttp,
  verifyInstagramCookiesLiveViaHttp,
  verifyClaudeCookiesLiveViaHttp,
} = require("./http-cookie-verifiers.cjs");

function isTwitterFamilyService(svcName) {
  return /^(twitter \(x\)|twitter|x)$/i.test(String(svcName || "").trim());
}

const AI_SERVICE_UID_KEY_MAP = {
  grok: { key: "xai_user_id", method: "grok_rest_get_user_api" },
  chatgpt: { key: "oai_user_id", method: "chatgpt_auth_session_api" },
  "sora openai": { key: "oai_user_id", method: "chatgpt_auth_session_api" },
  elevenlabs: { key: "xi_user_id", method: "elevenlabs_v1_user_api" },
  claude: { key: "claude_org_uuid", method: "claude_api_organizations" },
  cursor: { key: "workos_user_id", method: "cursor_workos_session_jwt" },
  perplexity: { key: "pplx_user_id", method: "perplexity_auth_session_api" },
  heygen: { key: "heygen_user_id", method: "heygen_user_api_or_jwt" },
  higgsfield: { key: "clerk_user_id", method: "higgsfield_clerk_jwt" },
  suno: { key: "suno_user_id", method: "suno_clerk_jwt" },
  kling: { key: "kling_user_id", method: "kling_session_cookie" },
  capcut: { key: "capcut_user_id", method: "capcut_passport_account_info_api" },
  adobe: { key: "adobe_session_id", method: "adobe_ims_session_cookie" },
  canva: { key: "canva_session_id", method: "canva_aat_session_cookie" },
  freepik: { key: "freepik_session_id", method: "freepik_gr_token_cookie" },
  runway: { key: "runway_user_id", method: "runway_jwt_session_cookie" },
  github: { key: "github_session_id", method: "github_user_session_cookie" },
  "github copilot": { key: "github_session_id", method: "github_user_session_cookie" },
  vercel: { key: "vercel_user_id", method: "vercel_v2_user_api" },
  supabase: { key: "supabase_session_id", method: "supabase_auth_token_cookie" },
  discord: { key: "discord_user_id", method: "discord_auth_token" },
  midjourney: { key: "midjourney_session_id", method: "midjourney_next_auth_cookie" },
  "sync.so": { key: "syncso_session_id", method: "syncso_session_token_cookie" },
  netflix: { key: "netflix_session_id", method: "netflix_id_cookie" },
  genspark: { key: "genspark_session_id", method: "genspark_session_id_cookie" },
  "glm coding (z.ai)": { key: "zai_user_id", method: "zai_jwt_token_cookie" },
  kalodata: { key: "kalodata_session_id", method: "kalodata_session_cookie" },
  "vpn nord": { key: "nordvpn_session_id", method: "nordaccount_token_cookie" },
  "2captcha": { key: "twocaptcha_session_id", method: "twocaptcha_user_cookie" },
};

/**
 * Discovers active authenticated sessions on TikTok, Twitter/X, Instagram, ChatGPT, Cursor,
 * Claude, Grok, CapCut, and ElevenLabs and auto-attaches unassigned (`browser` empty/null)
 * P0020 `twofa_accounts` rows without ever hijacking rows assigned to another profile.
 */
async function discoverAndAutoBindUnassignedP0020Rows({
  pairs,
  rows,
  isLiveWindow,
  cfg,
  userId,
  selectCols,
  headers,
  code,
  userDataDir,
  spaSummary,
  hasVerifiedGoogleAuth,
}) {
  let cachedTikTokHttpVerify = null;
  let hasVerifiedTikTokAuth = false;
  const hasPlaintextTtCookiesInPairs =
    Array.isArray(pairs) &&
    pairs.some(
      (c) =>
        c &&
        String(c.domain || c.host_key || "").toLowerCase().includes("tiktok.com") &&
        (c.name === "sessionid" || c.name === "sessionid_ss" || c.name === "sid_tt") &&
        String(c.value || "").trim().length > 0 &&
        String(c.value || "").trim() !== "disk_verified_sqlite",
    );
  if (
    hasPlaintextTtCookiesInPairs &&
    (isLiveWindow ||
      !rows.some((r) => String(r?.service || "").trim().toLowerCase() === "tiktok") ||
      rows.some(
        (r) =>
          String(r?.service || "").trim().toLowerCase() === "tiktok" &&
          String(r?.stealth_snapshot?.status || "") !== "logged_in",
      ))
  ) {
    cachedTikTokHttpVerify = await verifyTikTokCookiesLiveViaHttp(pairs);
    if (cachedTikTokHttpVerify.ok && cachedTikTokHttpVerify.loggedIn) {
      hasVerifiedTikTokAuth = true;
      const ttUser = String(cachedTikTokHttpVerify.tiktokUsername || "").trim().replace(/^@/, "").toLowerCase();
      const ttUid = String(cachedTikTokHttpVerify.tiktokUserId || "").trim();
      const ttCandidates = [...new Set([ttUser, ttUser ? `@${ttUser}` : "", ttUid].filter(Boolean))];
      if (
        ttCandidates.length > 0 &&
        !rows.some((r) => {
          if (String(r?.service || "").trim().toLowerCase() !== "tiktok") return false;
          const accNorm = String(r?.account || "").trim().replace(/^@/, "").toLowerCase();
          return (
            (ttUser && accNorm === ttUser) ||
            (ttUid && (accNorm === ttUid || String(r?.stealth_snapshot?.tiktok_user_id || "") === ttUid))
          );
        })
      ) {
        try {
          const ttInClause = ttCandidates.map((v) => `"${v}"`).join(",");
          const ttMatchUrl = `${cfg.url}/rest/v1/twofa_accounts?select=${selectCols}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&service=ilike.tiktok&account=in.(${encodeURIComponent(ttInClause)})&limit=10`;
          const ttRes = await fetch(ttMatchUrl, { headers, signal: AbortSignal.timeout(6000) });
          if (ttRes.ok) {
            const ttRows = await ttRes.json();
            if (Array.isArray(ttRows) && ttRows.length > 0) {
              const existingIds = new Set(rows.map((r) => r.id));
              for (const tr of ttRows) {
                if (!tr || !tr.id || existingIds.has(tr.id)) continue;
                const curBrowser = String(tr.browser || "").trim();
                if (!curBrowser || curBrowser.padStart(4, "0") === code) {
                  rows.push(tr);
                  existingIds.add(tr.id);
                }
              }
            }
          }
        } catch {
          /* ignore transient fetch error */
        }
      }
    }
  }

  let cachedTwitterHttpVerify = null;
  let hasVerifiedTwitterAuth = false;
  const hasPlaintextXCookiesInPairs =
    Array.isArray(pairs) &&
    pairs.some(
      (c) =>
        c &&
        /(?:^|\.)(?:x|twitter)\.com$/i.test(String(c.domain || c.host_key || "").trim()) &&
        c.name === "auth_token" &&
        String(c.value || "").trim().length > 0 &&
        String(c.value || "").trim() !== "disk_verified_sqlite",
    );
  if (
    hasPlaintextXCookiesInPairs &&
    (isLiveWindow ||
      !rows.some((r) => isTwitterFamilyService(r?.service)) ||
      rows.some(
        (r) =>
          isTwitterFamilyService(r?.service) &&
          String(r?.stealth_snapshot?.status || "") !== "logged_in",
      ))
  ) {
    cachedTwitterHttpVerify = await verifyTwitterCookiesLiveViaHttp(pairs, 4500, fetch, {
      allowDirectHostHttp: true,
    });
    if (cachedTwitterHttpVerify.ok && cachedTwitterHttpVerify.loggedIn) {
      hasVerifiedTwitterAuth = true;
      const xScreen = String(cachedTwitterHttpVerify.twitterScreenName || "")
        .trim()
        .replace(/^@/, "");
      const xCandidates = [
        ...new Set([xScreen, xScreen.toLowerCase(), xScreen ? `@${xScreen}` : ""].filter(Boolean)),
      ];
      if (
        xCandidates.length > 0 &&
        !rows.some((r) => {
          if (!isTwitterFamilyService(r?.service)) return false;
          const accNorm = String(r?.account || "").trim().replace(/^@/, "").toLowerCase();
          return accNorm === xScreen.toLowerCase();
        })
      ) {
        try {
          const xInClause = xCandidates.map((v) => `"${v}"`).join(",");
          const xMatchUrl = `${cfg.url}/rest/v1/twofa_accounts?select=${selectCols}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&account=in.(${encodeURIComponent(xInClause)})&limit=10`;
          const xRes = await fetch(xMatchUrl, { headers, signal: AbortSignal.timeout(6000) });
          if (xRes.ok) {
            const xRows = await xRes.json();
            if (Array.isArray(xRows) && xRows.length > 0) {
              const existingIds = new Set(rows.map((r) => r.id));
              for (const xr of xRows) {
                if (!xr || !xr.id || existingIds.has(xr.id)) continue;
                if (!isTwitterFamilyService(xr.service)) continue;
                const curBrowser = String(xr.browser || "").trim();
                if (!curBrowser || curBrowser.padStart(4, "0") === code) {
                  rows.push(xr);
                  existingIds.add(xr.id);
                }
              }
            }
          }
        } catch {
          /* ignore transient fetch error */
        }
      }
    }
  }

  let cachedInstagramHttpVerify = null;
  let hasVerifiedInstagramAuth = false;
  const hasPlaintextIgCookiesInPairs =
    Array.isArray(pairs) &&
    pairs.some(
      (c) =>
        c &&
        String(c.domain || c.host_key || "").toLowerCase().includes("instagram.com") &&
        c.name === "sessionid" &&
        String(c.value || "").trim().length > 0 &&
        String(c.value || "").trim() !== "disk_verified_sqlite",
    );
  if (
    hasPlaintextIgCookiesInPairs &&
    (isLiveWindow ||
      !rows.some((r) => String(r?.service || "").trim().toLowerCase() === "instagram") ||
      rows.some(
        (r) =>
          String(r?.service || "").trim().toLowerCase() === "instagram" &&
          String(r?.stealth_snapshot?.status || "") !== "logged_in",
      ))
  ) {
    cachedInstagramHttpVerify = await verifyInstagramCookiesLiveViaHttp(pairs, 4500, fetch, {
      allowDirectHostHttp: true,
    });
    if (cachedInstagramHttpVerify.ok && cachedInstagramHttpVerify.loggedIn) {
      hasVerifiedInstagramAuth = true;
      const igUid = String(cachedInstagramHttpVerify.instagramUserId || "").trim();
      const igUser = String(cachedInstagramHttpVerify.instagramUsername || "")
        .trim()
        .replace(/^@/, "")
        .toLowerCase();
      const igEmail = normalizeComparableEmail(cachedInstagramHttpVerify.instagramEmail);
      const igCandidates = [
        ...new Set([igUser, igUser ? `@${igUser}` : "", igEmail, igUid].filter(Boolean)),
      ];
      if (
        igCandidates.length > 0 &&
        !rows.some((r) => String(r?.service || "").trim().toLowerCase() === "instagram")
      ) {
        try {
          const existingIds = new Set(rows.map((r) => r.id));
          const igInClause = igCandidates.map((v) => `"${v}"`).join(",");
          const igMatchUrl = `${cfg.url}/rest/v1/twofa_accounts?select=${selectCols}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&service=ilike.instagram&account=in.(${encodeURIComponent(igInClause)})&limit=10`;
          const igRes = await fetch(igMatchUrl, { headers, signal: AbortSignal.timeout(6000) });
          if (igRes.ok) {
            const igRows = await igRes.json();
            if (Array.isArray(igRows)) {
              for (const ir of igRows) {
                if (!ir || !ir.id || existingIds.has(ir.id)) continue;
                const curBrowser = String(ir.browser || "").trim();
                if (!curBrowser || curBrowser.padStart(4, "0") === code) {
                  rows.push(ir);
                  existingIds.add(ir.id);
                }
              }
            }
          }
          if (
            igUid &&
            !rows.some((r) => String(r?.service || "").trim().toLowerCase() === "instagram")
          ) {
            const igUidUrl = `${cfg.url}/rest/v1/twofa_accounts?select=${selectCols}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&service=ilike.instagram&or=(browser.is.null,browser.eq.)&limit=25`;
            const igUidRes = await fetch(igUidUrl, { headers, signal: AbortSignal.timeout(6000) });
            if (igUidRes.ok) {
              const igUidRows = await igUidRes.json();
              if (Array.isArray(igUidRows)) {
                for (const ir of igUidRows) {
                  if (!ir || !ir.id || existingIds.has(ir.id)) continue;
                  const snapIgUid = String(
                    ir.stealth_snapshot?.instagram_user_id || ir.stealth_snapshot?.ds_user_id || "",
                  ).trim();
                  if (snapIgUid && snapIgUid === igUid) {
                    rows.push(ir);
                    existingIds.add(ir.id);
                  }
                }
              }
            }
          }
        } catch {
          /* ignore transient fetch error */
        }
      }
    }
  }

  // Auto-match unassigned (`browser` empty/null) standalone AI service rows (`ChatGPT`, `Claude`, `Cursor`, `Grok`, `CapCut`, `ElevenLabs`)
  // ONLY when server API verification returns an explicit verified UID and/or unmasked email (`ok 1`).
  // Strictly never overwrite or move a row that already has a non-empty `browser` assigned to another profile.
  const cachedAiHttpVerify = {};
  const hasRowForService = (svcKey) =>
    rows.some((r) => String(r?.service || "").trim().toLowerCase() === svcKey);
  const buildDomainCookieHeader = (domSubstr) =>
    (Array.isArray(pairs) ? pairs : [])
      .filter(
        (c) =>
          c &&
          c.name &&
          c.value &&
          c.value !== "disk_verified_sqlite" &&
          String(c.domain || c.host_key || "").toLowerCase().includes(domSubstr),
      )
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

  const tryAutoBindUnassignedAiRow = async (svcKey, verifiedEmail, verifiedUid, uidSnapKey) => {
    const cleanEmail =
      verifiedEmail && !verifiedEmail.includes("*") && verifiedEmail.includes("@")
        ? normalizeComparableEmail(verifiedEmail)
        : "";
    const cleanUid = String(verifiedUid || "").trim();
    if (!cleanEmail && !cleanUid) return;
    try {
      const existingIds = new Set(rows.map((r) => r.id));
      if (cleanEmail) {
        const aiUrl = `${cfg.url}/rest/v1/twofa_accounts?select=${selectCols}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&service=ilike.${encodeURIComponent(svcKey)}&account=eq.${encodeURIComponent(cleanEmail)}&limit=5`;
        const aiRes = await fetch(aiUrl, { headers, signal: AbortSignal.timeout(6000) });
        if (aiRes.ok) {
          const aiRows = await aiRes.json();
          if (Array.isArray(aiRows)) {
            for (const ar of aiRows) {
              if (!ar || !ar.id || existingIds.has(ar.id)) continue;
              if (String(ar.service || "").trim().toLowerCase() !== svcKey) continue;
              const curBrowser = String(ar.browser || "").trim();
              if (!curBrowser || curBrowser.padStart(4, "0") === code) {
                rows.push(ar);
                existingIds.add(ar.id);
                return;
              }
            }
          }
        }
      }
      if (cleanUid && uidSnapKey) {
        const aiUidUrl = `${cfg.url}/rest/v1/twofa_accounts?select=${selectCols}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&service=ilike.${encodeURIComponent(svcKey)}&or=(browser.is.null,browser.eq.)&limit=25`;
        const aiUidRes = await fetch(aiUidUrl, { headers, signal: AbortSignal.timeout(6000) });
        if (aiUidRes.ok) {
          const aiUidRows = await aiUidRes.json();
          if (Array.isArray(aiUidRows)) {
            for (const ar of aiUidRows) {
              if (!ar || !ar.id || existingIds.has(ar.id)) continue;
              if (String(ar.service || "").trim().toLowerCase() !== svcKey) continue;
              const snapUid = String(ar.stealth_snapshot?.[uidSnapKey] || "").trim();
              if (snapUid && snapUid === cleanUid) {
                rows.push(ar);
                existingIds.add(ar.id);
                return;
              }
            }
          }
        }
      }
    } catch {
      /* ignore transient fetch error */
    }
  };

  if (Array.isArray(pairs) && pairs.length > 0) {
    // 1. ChatGPT
    const chatgptHdr = buildDomainCookieHeader("chatgpt.com") || buildDomainCookieHeader("openai.com");
    if (!hasRowForService("chatgpt") && /session-token(?:\.\d+)?=/i.test(chatgptHdr)) {
      try {
        const oRes = await fetch("https://chatgpt.com/api/auth/session", {
          headers: { Cookie: chatgptHdr, Accept: "application/json", "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(4000),
        });
        if (oRes.ok) {
          const oJson = await oRes.json().catch(() => null);
          const uid = String(oJson?.user?.id || "").trim();
          const email = normalizeComparableEmail(oJson?.user?.email);
          if (uid && oJson?.accessToken) {
            cachedAiHttpVerify.chatgpt = { ok: true, loggedIn: true, uid, email, method: "chatgpt_api_auth_session" };
            await tryAutoBindUnassignedAiRow("chatgpt", email, uid, "oai_user_id");
          }
        }
      } catch {}
    }

    // 2. Cursor
    const cursorHdr = buildDomainCookieHeader("cursor.com");
    if (!hasRowForService("cursor") && /WorkosCursorSessionToken=/i.test(cursorHdr)) {
      try {
        const cRes = await fetch("https://cursor.com/api/auth/me", {
          headers: { Cookie: cursorHdr, Accept: "application/json", "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(4000),
        });
        if (cRes.ok) {
          const cJson = await cRes.json().catch(() => null);
          const uid = String(cJson?.sub || cJson?.id || cJson?.user?.id || "").trim();
          const email = normalizeComparableEmail(cJson?.email || cJson?.user?.email);
          if (uid) {
            cachedAiHttpVerify.cursor = { ok: true, loggedIn: true, uid, email, method: "cursor_auth_me_api" };
            await tryAutoBindUnassignedAiRow("cursor", email, uid, "workos_user_id");
          }
        }
      } catch {}
    }

    // 3. Claude
    const claudeHdr = buildDomainCookieHeader("claude.ai");
    if (!hasRowForService("claude") && /sessionKey=sk-ant-sid/i.test(claudeHdr)) {
      const cVerify = await verifyClaudeCookiesLiveViaHttp(pairs);
      cachedAiHttpVerify.claude = cVerify;
      if (cVerify.ok && cVerify.loggedIn && cVerify.claudeOrgUuid) {
        await tryAutoBindUnassignedAiRow("claude", cVerify.claudeVerifiedEmail || "", cVerify.claudeOrgUuid, "claude_org_uuid");
      }
    }

    // 4. Grok
    const grokHdr = buildDomainCookieHeader("grok.com") || buildDomainCookieHeader("x.ai");
    if (!hasRowForService("grok") && /\bsso=eyJ/i.test(grokHdr)) {
      try {
        const gRes = await fetch("https://grok.com/rest/auth/get-user", {
          headers: { Cookie: grokHdr, Accept: "application/json" },
          signal: AbortSignal.timeout(4000),
        });
        if (gRes.ok) {
          const gJson = await gRes.json().catch(() => null);
          const uid = String(gJson?.userId || gJson?.user?.id || gJson?.id || "").trim();
          const email = normalizeComparableEmail(gJson?.email || gJson?.user?.email);
          if (uid) {
            cachedAiHttpVerify.grok = { ok: true, loggedIn: true, uid, email, method: "grok_rest_auth_get_user" };
            await tryAutoBindUnassignedAiRow("grok", email, uid, "xai_user_id");
          }
        }
      } catch {}
    }

    // 5. CapCut (note: CapCut masks email as a***3@outlook.com, so only auto-bind by unmasked email OR exact capcut_user_id)
    const capcutHdr = buildDomainCookieHeader("capcut.com");
    if (!hasRowForService("capcut") && /\b(?:sessionid|sid_tt)=/i.test(capcutHdr)) {
      try {
        const ccRes = await fetch("https://www.capcut.com/passport/web/account/info/?aid=348188", {
          headers: {
            Cookie: capcutHdr,
            "User-Agent": "Mozilla/5.0",
            Origin: "https://www.capcut.com",
            Referer: "https://www.capcut.com/",
          },
          signal: AbortSignal.timeout(4000),
        });
        if (ccRes.ok) {
          const ccJson = await ccRes.json().catch(() => null);
          const uid = String(ccJson?.data?.user_id_str || ccJson?.data?.user_id || "").trim();
          const rawEmail = String(ccJson?.data?.email || "").trim();
          const unmaskedEmail = !rawEmail.includes("*") ? normalizeComparableEmail(rawEmail) : "";
          if (uid && uid !== "0") {
            const ccConnects = Array.isArray(ccJson?.data?.connects) ? ccJson.data.connects : [];
            cachedAiHttpVerify.capcut = {
              ok: true,
              loggedIn: true,
              uid,
              email: unmaskedEmail,
              connectsCount: ccConnects.length,
              method: "capcut_passport_account_info_api",
            };
            await tryAutoBindUnassignedAiRow("capcut", unmaskedEmail, uid, "capcut_user_id");
          }
        }
      } catch {}
    }
  }

  // 6. ElevenLabs (Firebase IndexedDB email + refreshToken)
  if (!hasRowForService("elevenlabs") && userDataDir) {
    if (spaSummary === undefined) {
      spaSummary = readProfileSpaStorageSummary(userDataDir);
    }
    if (spaSummary) {
      const elSpa = matchServiceSpaStorage("ElevenLabs", spaSummary);
      const elEmail =
        elSpa?.matched && elSpa.accountEmail && !elSpa.accountEmail.includes("*")
          ? normalizeComparableEmail(elSpa.accountEmail)
          : "";
      if (elEmail && elSpa.firebaseRefreshToken) {
        await tryAutoBindUnassignedAiRow("elevenlabs", elEmail, "", "xi_user_id");
      }
    }
  }

  return {
    spaSummary,
    hasVerifiedGoogleAuth,
    cachedTikTokHttpVerify,
    hasVerifiedTikTokAuth,
    cachedTwitterHttpVerify,
    hasVerifiedTwitterAuth,
    cachedInstagramHttpVerify,
    hasVerifiedInstagramAuth,
    cachedAiHttpVerify,
  };
}

/**
 * Verifies per-row live/HTTP session validity, platform restrictions, and AI service UID/email ownership.
 */
async function verifyRowPlatformAndAiSession({
  row,
  svcLower,
  rowStatusLower,
  rowResCodeLower,
  match,
  pairs,
  vaultEntryCookies,
  rows,
  code,
  userDataDir,
  isLiveWindow,
  isPassiveUserLiveSync,
  liveCdpTargets,
  fbLiveTargetState,
  googleLiveTargetState,
  msLiveTargetState,
  claudeLiveTargetState,
  hasVerifiedGoogleLiveTab,
  hasVerifiedMicrosoftLiveTab,
  hasPlaintextGoogleAuth,
  hasPlaintextMsAuth,
  candidateGoogleCookies,
  cachedGoogleHttpVerify,
  hasChallengedOrBlockedGoogleRow,
  cachedMicrosoftHttpVerify,
  hasVerifiedMicrosoftAuth,
  profileMicrosoftAliasEmails,
  probeState,
}) {
  let {
    hasVerifiedGoogleAuth,
    cachedTikTokHttpVerify,
    hasVerifiedTikTokAuth,
    cachedTwitterHttpVerify,
    hasVerifiedTwitterAuth,
    cachedInstagramHttpVerify,
    hasVerifiedInstagramAuth,
    cachedAiHttpVerify,
  } = probeState;

    // If live window or HTTP redirect check on Facebook/Google cookies reveals Checkpoint / Challenge / Login, override match immediately
    let fbForcedOverride = null;
    let hasVerifiedFacebookAuth = false;
    if (svcLower === "facebook") {
      const hasPlaintextXs = (list) =>
        Array.isArray(list) &&
        list.some((c) => c && c.name === "xs" && String(c.value || "").trim().length > 0) &&
        list.some((c) => c && c.name === "c_user" && String(c.value || "").trim().length > 0);
      if (fbLiveTargetState?.restricted) {
        fbForcedOverride = fbLiveTargetState;
        match.loggedIn = false;
        match.resultCode = fbLiveTargetState.resultCode;
      } else if (!match.loggedIn && !isLiveWindow) {
        // Agent shadow launches (`p0003-agent-shadow`) save verified plaintext `c_user+xs` into P0020 Vault (`row.stealth_cookies` / `service_cookies`)
        // without writing to main `D:\StealthBrowser\profiles\<id>` SQLite. Never downgrade a live Vault session on close!
        const curSnapCheck = row.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : null;
        const vaultBackedFbCookies = hasPlaintextXs(vaultEntryCookies)
          ? vaultEntryCookies
          : hasPlaintextXs(row.stealth_cookies)
            ? row.stealth_cookies
            : hasPlaintextXs(curSnapCheck?.service_cookies)
              ? curSnapCheck.service_cookies
              : null;
        if (vaultBackedFbCookies && String(curSnapCheck?.status || "") === "logged_in") {
          const httpVerify = await verifyFacebookCookiesLiveViaHttp(vaultBackedFbCookies, 4000, {
            allowDirectHostHttp: !isPassiveUserLiveSync,
          });
          if (httpVerify.loggedIn) {
            match.loggedIn = true;
            match.resultCode = "fb_cookies";
            match.matchedNames = ["c_user", "xs"];
            hasVerifiedFacebookAuth = true;
          } else if (httpVerify.ok) {
            fbForcedOverride = httpVerify;
            match.loggedIn = false;
            match.resultCode = httpVerify.resultCode || "login_page";
          }
        }
      } else if (match.loggedIn) {
        const fbPlaintextCookies = hasPlaintextXs(pairs)
          ? pairs
          : hasPlaintextXs(vaultEntryCookies)
            ? vaultEntryCookies
            : hasPlaintextXs(row.stealth_cookies)
              ? row.stealth_cookies
              : null;
        if (!fbPlaintextCookies) {
          // On-disk SQLite `Cookies` only exposes `(domain, name)` without decrypted `value`;
          // checkpointed (282/956) and 2FA-challenged Facebook profiles still retain `c_user`+`xs` rows on disk.
          match.loggedIn = false;
          match.resultCode = "login_page";
        } else {
          const curSnapCheck = row.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : null;
          const hasCleanFbLiveTab =
            isLiveWindow &&
            !fbLiveTargetState?.restricted &&
            liveCdpTargets.some((t) => {
              const u = String(t?.url || "");
              return /facebook\.com/i.test(u) && !/\/(login|recover|checkpoint)|two_step_verification|auth_platform/i.test(u);
            });
          const needsLiveHttpCheck =
            String(curSnapCheck?.status || "") !== "logged_in" ||
            String(row.status || "").trim().toLowerCase() !== "active" ||
            String(row.browser || "").trim().padStart(4, "0") !== code ||
            isLiveWindow;
          if (needsLiveHttpCheck) {
            const httpVerify = await verifyFacebookCookiesLiveViaHttp(fbPlaintextCookies, 4000, {
              allowDirectHostHttp:
                String(curSnapCheck?.status || "") !== "logged_in" ||
                String(row.status || "").trim().toLowerCase() !== "active" ||
                (!isPassiveUserLiveSync && !hasCleanFbLiveTab),
            });
            if (!httpVerify.loggedIn) {
              if (httpVerify.ok) fbForcedOverride = httpVerify;
              match.loggedIn = false;
              match.resultCode = httpVerify.resultCode || "login_page";
            } else {
              hasVerifiedFacebookAuth = true;
              if (isLiveWindow && !isPassiveUserLiveSync && liveCdpTargets.length > 0) {
                await autoHealCompletedSocialChallengeTabs(liveCdpTargets, {
                  hasVerifiedFacebookAuth: true,
                }).catch(() => undefined);
              }
            }
          } else {
            hasVerifiedFacebookAuth = true;
          }
        }
      }
    } else if (svcLower === "tiktok" && match.loggedIn) {
      const hasPlaintextTtAuth = (list) =>
        Array.isArray(list) &&
        list.some(
          (c) =>
            c &&
            (c.name === "sessionid" || c.name === "sessionid_ss" || c.name === "sid_tt") &&
            String(c.value || "").trim().length > 0,
        );
      const ttPlaintextCookies = hasPlaintextTtAuth(pairs)
        ? pairs
        : hasPlaintextTtAuth(vaultEntryCookies)
          ? vaultEntryCookies
          : hasPlaintextTtAuth(row.stealth_cookies)
            ? row.stealth_cookies
            : null;
      if (!ttPlaintextCookies) {
        match.loggedIn = false;
        match.resultCode = "login_page";
      } else {
        const curSnapCheck = row.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : null;
        if (
          String(curSnapCheck?.status || "") !== "logged_in" ||
          String(row.status || "").trim().toLowerCase() !== "active" ||
          !String(row.browser || "").trim() ||
          isLiveWindow
        ) {
          const ttVerify =
            ttPlaintextCookies === pairs && cachedTikTokHttpVerify
              ? cachedTikTokHttpVerify
              : await verifyTikTokCookiesLiveViaHttp(ttPlaintextCookies);
          if (ttVerify.ok && !ttVerify.loggedIn) {
            fbForcedOverride = ttVerify;
            match.loggedIn = false;
            match.resultCode = ttVerify.resultCode || "login_page";
          } else if (ttVerify.ok && ttVerify.loggedIn) {
            hasVerifiedTikTokAuth = true;
            cachedTikTokHttpVerify = ttVerify;
            if (isLiveWindow && !isPassiveUserLiveSync && liveCdpTargets.length > 0) {
              await autoHealCompletedSocialChallengeTabs(liveCdpTargets, {
                hasVerifiedTikTokAuth: true,
              }).catch(() => undefined);
            }
          }
        } else {
          hasVerifiedTikTokAuth = true;
        }
      }
    } else if (
      isGoogleFamilyService(svcLower) &&
      googleLiveTargetState?.restricted &&
      doesGoogleTargetRestrictionApplyToService(googleLiveTargetState, svcLower) &&
      googleLiveTargetState.resultCode !== "challenged_captcha_grid" &&
      !(
        !isLiveWindow &&
        (rowStatusLower === "appeal" || rowResCodeLower === "disabled_appeal_submitted") &&
        googleLiveTargetState.resultCode !== "disabled_appeal_submitted"
      ) &&
      (!hasVerifiedGoogleAuth ||
        (isLiveWindow &&
          !hasVerifiedGoogleLiveTab &&
          Boolean(googleLiveTargetState.restrictedServices) &&
          (googleLiveTargetState.resultCode === "checkpoint_qr" ||
            googleLiveTargetState.resultCode === "phone_sms_required")) ||
        googleLiveTargetState.resultCode === "account_disabled" ||
        googleLiveTargetState.resultCode === "disabled_appeal_submitted")
    ) {
      const hasRowTwofaCredentials = Boolean(
        String(row.secret || "").trim() || String(row.backup_code || "").trim(),
      );
      if (
        isLiveWindow &&
        googleLiveTargetState.challengeType === "device_prompt" &&
        hasRowTwofaCredentials &&
        rowStatusLower !== "check_phone"
      ) {
        fbForcedOverride = {
          ...googleLiveTargetState,
          status: "challenged",
          rowStatus: null,
          resultCode: "2fa_pending",
          evidence: `Google:2fa_pending url=${String(googleLiveTargetState.evidence || "").replace(/^Google:phone_sms_required url=/, "")}`,
          note: "Google 2-Step Verification (Device Prompt / Try another way -> TOTP/Backup Code) pending in live window",
        };
        match.loggedIn = false;
        match.resultCode = "2fa_pending";
      } else {
        fbForcedOverride = googleLiveTargetState;
        match.loggedIn = false;
        match.resultCode = googleLiveTargetState.resultCode;
      }
    } else if (isGoogleFamilyService(svcLower) && match.loggedIn) {
      const googlePlaintextCookies = hasPlaintextGoogleAuth(pairs)
        ? pairs
        : !userDataDir && hasPlaintextGoogleAuth(vaultEntryCookies)
          ? vaultEntryCookies
          : !userDataDir && hasPlaintextGoogleAuth(row.stealth_cookies)
            ? row.stealth_cookies
            : null;
      if (googlePlaintextCookies) {
        const gVerify =
          googlePlaintextCookies === candidateGoogleCookies && cachedGoogleHttpVerify
            ? cachedGoogleHttpVerify
            : await verifyGoogleCookiesLiveViaHttp(googlePlaintextCookies, 4500, fetch, {
                resolveIdentity: true,
                userDataDir,
                profileCode: code,
                hasChallengedOrBlockedRow: hasChallengedOrBlockedGoogleRow,
              });
        if (gVerify.ok && gVerify.loggedIn) {
          const expectedGoogleEmail = normalizeComparableEmail(row.account);
          if (
            expectedGoogleEmail &&
            /@(?:gmail|googlemail)\.com$/i.test(expectedGoogleEmail) &&
            Array.isArray(gVerify.verifiedEmails) &&
            gVerify.verifiedEmails.length > 0 &&
            !gVerify.verifiedEmails.some((em) => areComparableEmailsEqual(em, expectedGoogleEmail))
          ) {
            match.loggedIn = false;
            match.resultCode = "account_mismatch";
            match.actualAccount = gVerify.verifiedEmails[0];
          } else if (gVerify.mode !== "offline_proxy_safe") {
            hasVerifiedGoogleAuth = true;
          }
        } else if (gVerify.ok && !gVerify.loggedIn) {
          fbForcedOverride = gVerify;
          match.loggedIn = false;
          match.resultCode = gVerify.resultCode || "login_page";
        }
      } else {
        match.loggedIn = false;
        match.resultCode = "login_page";
      }
    } else if ((svcLower === "twitter (x)" || svcLower === "twitter" || svcLower === "x") && match.loggedIn) {
      const hasPlaintextXAuth = (list) =>
        Array.isArray(list) &&
        list.some((c) => c && c.name === "auth_token" && String(c.value || "").trim().length > 0);
      const xPlaintextCookies = hasPlaintextXAuth(pairs)
        ? pairs
        : !userDataDir && hasPlaintextXAuth(vaultEntryCookies)
          ? vaultEntryCookies
          : !userDataDir && hasPlaintextXAuth(row.stealth_cookies)
            ? row.stealth_cookies
            : null;
      if (!xPlaintextCookies) {
        match.loggedIn = false;
        match.resultCode = "login_page";
      } else {
        const curSnapCheck = row.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : null;
        if (
          String(curSnapCheck?.status || "") !== "logged_in" ||
          !String(row.browser || "").trim() ||
          !curSnapCheck?.login_verified_at ||
          isLiveWindow
        ) {
          const xVerify =
            xPlaintextCookies === pairs && cachedTwitterHttpVerify
              ? cachedTwitterHttpVerify
              : await verifyTwitterCookiesLiveViaHttp(xPlaintextCookies, 4500, fetch, {
                  allowDirectHostHttp: true,
                });
          if (xVerify.ok && !xVerify.loggedIn) {
            fbForcedOverride = xVerify;
            match.loggedIn = false;
            match.resultCode = xVerify.resultCode || "login_page";
          } else if (xVerify.ok && xVerify.loggedIn && xVerify.resultCode !== "offline_proxy_safe") {
            hasVerifiedTwitterAuth = true;
            cachedTwitterHttpVerify = xVerify;
          }
        }
      }
    } else if (svcLower === "instagram" && match.loggedIn) {
      const hasPlaintextIgAuth = (list) =>
        Array.isArray(list) &&
        list.some((c) => c && c.name === "sessionid" && String(c.value || "").trim().length > 0);
      const igPlaintextCookies = hasPlaintextIgAuth(pairs)
        ? pairs
        : !userDataDir && hasPlaintextIgAuth(vaultEntryCookies)
          ? vaultEntryCookies
          : !userDataDir && hasPlaintextIgAuth(row.stealth_cookies)
            ? row.stealth_cookies
            : null;
      if (!igPlaintextCookies) {
        match.loggedIn = false;
        match.resultCode = "login_page";
      } else {
        const curSnapCheck = row.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : null;
        if (
          String(curSnapCheck?.status || "") !== "logged_in" ||
          !String(row.browser || "").trim() ||
          !curSnapCheck?.login_verified_at ||
          isLiveWindow
        ) {
          const igVerify =
            igPlaintextCookies === pairs && cachedInstagramHttpVerify
              ? cachedInstagramHttpVerify
              : await verifyInstagramCookiesLiveViaHttp(igPlaintextCookies, 4500, fetch, {
                  allowDirectHostHttp: true,
                });
          if (igVerify.ok && !igVerify.loggedIn) {
            fbForcedOverride = igVerify;
            match.loggedIn = false;
            match.resultCode = igVerify.resultCode || "login_page";
          } else if (igVerify.ok && igVerify.loggedIn && igVerify.resultCode !== "offline_proxy_safe") {
            hasVerifiedInstagramAuth = true;
            cachedInstagramHttpVerify = igVerify;
          }
        }
      }
    } else if (svcLower === "claude" && claudeLiveTargetState?.restricted) {
      fbForcedOverride = claudeLiveTargetState;
      match.loggedIn = false;
      match.resultCode = claudeLiveTargetState.resultCode;
    }
    const aiUidSpec = AI_SERVICE_UID_KEY_MAP[svcLower] || null;
    let verifiedAiServerUid = "";
    let verifiedAiMethod = aiUidSpec ? aiUidSpec.method : "";
    let verifiedElevenLabsOnboarding = null;
    let verifiedCapcutConnectsCount = null;

    if (svcLower === "elevenlabs" && match.loggedIn) {
      const hasSignInLiveTab =
        isLiveWindow &&
        liveCdpTargets.some((t) =>
          /elevenlabs\.io\/app\/(sign-in|sign-up)/i.test(String(t?.url || "")),
        );
      if (hasSignInLiveTab) {
        match.loggedIn = false;
        match.resultCode = "login_page";
      } else {
        const curSnapCheck =
          row.stealth_snapshot && typeof row.stealth_snapshot === "object"
            ? row.stealth_snapshot
            : null;
        verifiedAiServerUid = String(
          curSnapCheck?.xi_user_id || curSnapCheck?.firebase_local_id || "",
        ).trim();
        const elKeyMatch =
          String(
            row.mail_youtube_api_v3 ||
              curSnapCheck?.service_api_key ||
              row.note ||
              "",
          ).match(/\b(sk_[A-Za-z0-9_]{20,})\b/);
        const elApiKey = elKeyMatch ? elKeyMatch[1] : "";
        if (
          elApiKey &&
          (isLiveWindow ||
            !verifiedAiServerUid ||
            String(curSnapCheck?.status || "") !== "logged_in" ||
            curSnapCheck?.is_onboarding_completed === false)
        ) {
          try {
            const elRes = await fetch("https://api.elevenlabs.io/v1/user", {
              headers: { "xi-api-key": elApiKey },
              signal: AbortSignal.timeout(4000),
            });
            if (elRes.ok) {
              const elUser = await elRes.json().catch(() => null);
              if (elUser) {
                const liveXiUid = String(
                  elUser.user_id || elUser.subscription?.user_id || "",
                ).trim();
                if (liveXiUid) verifiedAiServerUid = liveXiUid;
                const hasActiveQuota =
                  Number(elUser.subscription?.character_limit || 0) > 0 ||
                  Boolean(liveXiUid && elApiKey);
                if (elUser.is_onboarding_completed === true || hasActiveQuota) {
                  verifiedElevenLabsOnboarding = true;
                } else if (elUser.is_onboarding_completed === false) {
                  verifiedElevenLabsOnboarding = false;
                  match.loggedIn = false;
                  match.resultCode = "onboarding_incomplete";
                }
              }
            }
          } catch {
            /* ignore transient network error */
          }
        }
      }
    } else if (
      isMicrosoftFamilyService(svcLower) &&
      msLiveTargetState?.restricted &&
      (!hasVerifiedMicrosoftAuth || msLiveTargetState.resultCode === "account_disabled")
    ) {
      fbForcedOverride = msLiveTargetState;
      match.loggedIn = false;
      match.resultCode = msLiveTargetState.resultCode;
    } else if (isMicrosoftFamilyService(svcLower) && match.loggedIn) {
      if (match.resultCode === "service_cookies") {
        match.resultCode = "outlook_cookies";
      }
      const curSnapCheck = row.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : null;
      const curCooldownMs = curSnapCheck?.cooldown_until ? Date.parse(String(curSnapCheck.cooldown_until)) : NaN;
      if (
        Number.isFinite(curCooldownMs) &&
        curCooldownMs > Date.now() &&
        (String(curSnapCheck?.status || "") === "challenged" ||
          curSnapCheck?.specific_label === "otp_rate_limited_24h" ||
          curSnapCheck?.result_code === "otp_rate_limited_24h")
      ) {
        match.loggedIn = false;
        match.resultCode = String(curSnapCheck?.result_code || "otp_rate_limited_24h");
      } else if (cachedMicrosoftHttpVerify && cachedMicrosoftHttpVerify.ok && !cachedMicrosoftHttpVerify.loggedIn) {
        fbForcedOverride = cachedMicrosoftHttpVerify;
        match.loggedIn = false;
        match.resultCode = cachedMicrosoftHttpVerify.resultCode || "login_page";
      } else if (!hasVerifiedMicrosoftAuth && !hasVerifiedMicrosoftLiveTab) {
        if (!(cachedMicrosoftHttpVerify && !cachedMicrosoftHttpVerify.ok && hasPlaintextMsAuth(pairs))) {
          match.loggedIn = false;
          match.resultCode = "login_page";
        }
      }
    }

    if (aiUidSpec && match.loggedIn) {
      const isSyntheticUid = (v) => {
        const s = String(v || "").trim();
        if (!s) return true;
        return (
          /^(kalo|nf|sync|gs|zai|nord|2cap|oai|ims|canva|freepik|rw|gh|vcp|sb|discord|mj):/i.test(s) ||
          /^[a-z0-9]+-(sid|sess|pt|uid):/i.test(s) ||
          /^(chatgpt|claude|grok|elevenlabs|cursor|perplexity|heygen|higgsfield|suno|kling|capcut|adobe|canva|freepik|runway|github|vercel|supabase|discord|midjourney|sync\.?so|muse|netflix|genspark|kalodata)_[A-Za-z0-9]{12,}$/i.test(s) ||
          /^(xai_verified_user|grok\||client_|auth0\||google-oauth2\||AAAA)/i.test(s)
        );
      };
      const curSnapCheck =
        row.stealth_snapshot && typeof row.stealth_snapshot === "object"
          ? row.stealth_snapshot
          : null;
      const isCurrentlyDisabledOrBanned =
        /^(disable|banned|appeal)$/i.test(String(row.status || "").trim()) ||
        String(curSnapCheck?.result_code || "") === "account_disabled_banned" ||
        String(curSnapCheck?.auth_state || "") === "disabled";
      const curVerifiedMethod = String(curSnapCheck?.login_verified_method || "").trim();
      const isCookieOnlyMethod = svcLower === "claude" && /_cookie$/i.test(curVerifiedMethod);
      if (!verifiedAiServerUid && !isCurrentlyDisabledOrBanned && !isCookieOnlyMethod) {
        const candidateUid = String(
          curSnapCheck?.[aiUidSpec.key] ||
            row.service_uid ||
            (svcLower === "canva" ? curSnapCheck?.canva_workspace?.userId : "") ||
            "",
        ).trim();
        if (!isSyntheticUid(candidateUid)) {
          if (svcLower === "claude") {
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateUid)) {
              verifiedAiServerUid = candidateUid;
            }
          } else {
            verifiedAiServerUid = candidateUid;
          }
        }
        if (
          !verifiedAiServerUid &&
          svcLower === "claude" &&
          (curVerifiedMethod === "claude_api_organizations" ||
            String(curSnapCheck?.source || "") === "p0020_live_auth_verify" ||
            String(curSnapCheck?.result_code || "") === "claude_api_organizations")
        ) {
          verifiedAiServerUid = "claude_api_organizations_verified";
          verifiedAiMethod = "claude_api_organizations";
        }
      }
      const aiCookieList =
        Array.isArray(pairs) && pairs.some((c) => c && c.value)
          ? pairs
          : Array.isArray(vaultEntryCookies) && vaultEntryCookies.some((c) => c && c.value)
            ? vaultEntryCookies
            : Array.isArray(row.stealth_cookies)
              ? row.stealth_cookies
              : [];
      const decodeJwtSubFromValue = (rawVal) => {
        const clean = decodeURIComponent(String(rawVal || "").trim());
        const jwtMatch = clean.match(/(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
        if (!jwtMatch) return "";
        try {
          const payload = JSON.parse(
            Buffer.from(jwtMatch[1].split(".")[1], "base64url").toString("utf8"),
          );
          return String(
            payload?.sub || payload?.user_id || payload?.session_id || payload?.uid || payload?.id || "",
          ).trim();
        } catch {
          return "";
        }
      };
      if (
        !verifiedAiServerUid &&
        !isCurrentlyDisabledOrBanned &&
        aiCookieList.length > 0 &&
        !["claude", "elevenlabs"].includes(svcLower)
      ) {
        const hasChatgptSessionCookie =
          svcLower === "chatgpt" &&
          aiCookieList.some(
            (c) =>
              /^(__Secure-)?next-auth\.session-token(\.0)?$/i.test(String(c?.name || "").trim()) &&
              String(c?.value || "").trim().length >= 500,
          );
        for (const c of aiCookieList) {
          const cName = String(c?.name || "").trim();
          const cVal = String(c?.value || "").trim();
          const cDom = String(c?.domain || c?.host_key || "").toLowerCase();
          if (!cName || !cVal) continue;
          if (svcLower === "sora openai" && cName === "_puid" && cVal.startsWith("user-")) {
            verifiedAiServerUid = cVal;
          } else if (svcLower === "kling" && cName === "userId" && /^[0-9]{5,15}$/.test(cVal)) {
            verifiedAiServerUid = cVal;
          } else if ((svcLower === "github" || svcLower === "github copilot") && cDom.includes("github.com") && cName === "dotcom_user" && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(cVal)) {
            verifiedAiServerUid = cVal;
          } else if (svcLower === "canva" && cDom.includes("canva.com") && cName === "CAU") {
            try {
              const dec = JSON.parse(Buffer.from(decodeURIComponent(cVal), "base64").toString("utf8"));
              if (dec?.A && /^UA[A-Za-z0-9_-]{4,}$/.test(String(dec.A))) {
                verifiedAiServerUid = String(dec.A);
                verifiedAiMethod = "canva_cau_user_id";
              }
            } catch {}
          } else if (svcLower === "grok" && (cName === "sso" || cName === "sso-rw") && cVal.startsWith("eyJ") && cVal.length >= 80) {
            const sub = decodeJwtSubFromValue(cVal);
            if (sub && !isSyntheticUid(sub)) {
              verifiedAiServerUid = sub;
              verifiedAiMethod = "grok_sso_jwt_cookie";
            }
          } else if (svcLower === "cursor" && /^WorkosCursorSessionToken$/i.test(cName) && cVal.length >= 50) {
            const prefix = cVal.includes("%3A%3A")
              ? cVal.split("%3A%3A")[0]
              : cVal.includes("::")
                ? cVal.split("::")[0]
                : decodeJwtSubFromValue(cVal);
            if (prefix && !isSyntheticUid(prefix)) {
              verifiedAiServerUid = prefix;
              verifiedAiMethod = "cursor_workos_session_cookie";
            }
          } else if (
            ((svcLower === "chatgpt" || svcLower === "sora openai") && /session-token/i.test(cName) && (!cDom || cDom.includes("chatgpt.com") || cDom.includes("openai.com"))) ||
            ((svcLower === "higgsfield" || svcLower === "suno") && /^__(session|client)/i.test(cName)) ||
            (svcLower === "heygen" && /heygen|token|session/i.test(cName) && cDom.includes("heygen.com"))
          ) {
            const sub = decodeJwtSubFromValue(cVal);
            if (sub && !isSyntheticUid(sub)) verifiedAiServerUid = sub;
          } else if (
            svcLower === "chatgpt" &&
            hasChatgptSessionCookie &&
            (cName === "_account" || cName === "oai-did") &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cVal.replace(/^"|"$/g, ""))
          ) {
            verifiedAiServerUid = cVal.replace(/^"|"$/g, "");
            verifiedAiMethod = "chatgpt_nextauth_session_cookie";
          }
          if (verifiedAiServerUid) break;
        }
        if (!verifiedAiServerUid && svcLower === "chatgpt" && hasChatgptSessionCookie) {
          verifiedAiServerUid = "nextauth_jwe_verified";
          verifiedAiMethod = "chatgpt_nextauth_session_cookie";
        }
      }
      const isAiAccountEmailMismatch = (apiEmailRaw, apiUid) => {
        const apiEmail =
          apiEmailRaw && !String(apiEmailRaw).includes("*") && String(apiEmailRaw).includes("@")
            ? normalizeComparableEmail(apiEmailRaw)
            : "";
        const expEmail = normalizeComparableEmail(row.account);
        if (!apiEmail || !expEmail || !expEmail.includes("@")) return false;
        if (areComparableEmailsEqual(apiEmail, expEmail)) return false;
        if (profileMicrosoftAliasEmails.has(apiEmail)) return false;
        const recEmail = normalizeComparableEmail(row.mail_recover);
        if (recEmail && areComparableEmailsEqual(apiEmail, recEmail)) return false;
        const noteText = `${String(row.note || "")} ${String(row.log_tip_message || "")}`.toLowerCase();
        if (noteText.includes(apiEmail)) return false;
        const curBoundUid = aiUidSpec?.key ? String(curSnapCheck?.[aiUidSpec.key] || "").trim() : "";
        if (curBoundUid && apiUid && curBoundUid === String(apiUid).trim()) return false;
        return true;
      };
      if (cachedAiHttpVerify[svcLower]?.ok && cachedAiHttpVerify[svcLower]?.loggedIn && cachedAiHttpVerify[svcLower]?.uid) {
        const cachedEntry = cachedAiHttpVerify[svcLower];
        if (isAiAccountEmailMismatch(cachedEntry.email, cachedEntry.uid)) {
          match.loggedIn = false;
          match.resultCode = "account_mismatch";
          match.actualAccount = normalizeComparableEmail(cachedEntry.email);
          verifiedAiServerUid = "";
        } else {
          verifiedAiServerUid = cachedEntry.uid;
          verifiedAiMethod = cachedEntry.method || verifiedAiMethod;
          match.resultCode = verifiedAiMethod;
          if (svcLower === "capcut" && Number.isFinite(cachedAiHttpVerify.capcut?.connectsCount)) {
            verifiedCapcutConnectsCount = cachedAiHttpVerify.capcut.connectsCount;
          }
        }
      }
      if (
        svcLower === "capcut" &&
        !cachedAiHttpVerify.capcut &&
        aiCookieList.length > 0 &&
        (isLiveWindow ||
          !verifiedAiServerUid ||
          !String(row.browser || "").trim() ||
          String(curSnapCheck?.status || "") !== "logged_in" ||
          String(curSnapCheck?.result_code || "") === "service_cookies" ||
          String(curSnapCheck?.result_code || "") === "COOKIE_RECONCILED_OK" ||
          String(curSnapCheck?.result_code || "") === "UNVERIFIED_SESSION_BLOCKED")
      ) {
        const ccHdr = aiCookieList
          .filter((c) => c?.name && c?.value && String(c?.domain || "").toLowerCase().includes("capcut.com"))
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        if (ccHdr) {
          const capcutInfoUrls = [
            "https://www.capcut.com/passport/web/account/info/?aid=348188",
            "https://login-us.www.capcut.com/passport/web/account/info/?aid=348188",
            "https://login-row.www.capcut.com/passport/web/account/info/?aid=348188",
          ];
          let sawExplicitCapcutExpired = false;
          for (const ccUrl of capcutInfoUrls) {
            try {
              const ccRes = await fetch(ccUrl, {
                headers: {
                  Cookie: ccHdr,
                  "User-Agent": "Mozilla/5.0",
                  Origin: "https://www.capcut.com",
                  Referer: "https://www.capcut.com/",
                },
                signal: AbortSignal.timeout(4000),
              });
              if (ccRes.ok) {
                const ccJson = await ccRes.json().catch(() => null);
                const uid = String(ccJson?.data?.user_id_str || ccJson?.data?.user_id || "").trim();
                if (uid && uid !== "0") {
                  const ccConnects = Array.isArray(ccJson?.data?.connects) ? ccJson.data.connects : [];
                  verifiedCapcutConnectsCount = ccConnects.length;
                  const ccEmailRaw = String(ccJson?.data?.email || "").trim().toLowerCase();
                  const expCapcutEmail = normalizeComparableEmail(row.account);
                  let capcutEmailMismatch = false;
                  if (ccEmailRaw.includes("@") && expCapcutEmail.includes("@") && ccConnects.length === 0) {
                    const [ccLocal, ccDom] = ccEmailRaw.split("@");
                    const [expLocal, expDom] = expCapcutEmail.split("@");
                    if (ccDom && expDom && ccDom !== expDom) {
                      capcutEmailMismatch = true;
                    } else if (
                      ccLocal &&
                      expLocal &&
                      ccLocal.length >= 3 &&
                      expLocal.length >= 3 &&
                      (ccLocal[0] !== expLocal[0] || ccLocal[ccLocal.length - 1] !== expLocal[expLocal.length - 1])
                    ) {
                      capcutEmailMismatch = true;
                    }
                  }
                  if (capcutEmailMismatch) {
                    match.loggedIn = false;
                    match.resultCode = "account_mismatch";
                    match.actualAccount = ccEmailRaw;
                    verifiedAiServerUid = "";
                  } else {
                    verifiedAiServerUid = uid;
                    verifiedAiMethod = "capcut_passport_account_info_api";
                    match.resultCode = "capcut_passport_account_info_api";
                  }
                  sawExplicitCapcutExpired = false;
                  break;
                }
                if (/session expired|sign in/i.test(String(ccJson?.data?.description || ccJson?.message || ""))) {
                  sawExplicitCapcutExpired = true;
                }
              }
            } catch {
              /* ignore transient network error */
            }
          }
          if (!verifiedAiServerUid && sawExplicitCapcutExpired) {
            match.loggedIn = false;
            match.resultCode = "SESSION_EXPIRED_OR_REVOKED";
            verifiedAiServerUid = "";
          }
        }
      }
      if (
        svcLower === "claude" &&
        aiCookieList.some(
          (c) => c?.name === "sessionKey" && c?.value && c.value !== "disk_verified_sqlite" && String(c.value).length > 15,
        ) &&
        (isLiveWindow ||
          !verifiedAiServerUid ||
          !String(row.browser || "").trim() ||
          String(curSnapCheck?.status || "") !== "logged_in" ||
          String(curSnapCheck?.login_verified_method || "") === "claude_session_key_cookie" ||
          String(curSnapCheck?.result_code || "") === "service_cookies" ||
          String(curSnapCheck?.result_code || "") === "claude_session_key_verified" ||
          String(curSnapCheck?.result_code || "") === "UNVERIFIED_SESSION_BLOCKED")
      ) {
        const cVerify = cachedAiHttpVerify.claude || (await verifyClaudeCookiesLiveViaHttp(aiCookieList));
        if (cVerify.ok && !cVerify.loggedIn) {
          fbForcedOverride = cVerify;
          match.loggedIn = false;
          match.resultCode = cVerify.resultCode || "login_page";
          verifiedAiServerUid = "";
        } else if (cVerify.ok && cVerify.loggedIn && cVerify.claudeOrgUuid) {
          if (isAiAccountEmailMismatch(cVerify.claudeVerifiedEmail, cVerify.claudeOrgUuid)) {
            match.loggedIn = false;
            match.resultCode = "account_mismatch";
            match.actualAccount = normalizeComparableEmail(cVerify.claudeVerifiedEmail);
            verifiedAiServerUid = "";
          } else {
            verifiedAiServerUid = cVerify.claudeOrgUuid;
            verifiedAiMethod = "claude_api_organizations";
            match.resultCode = "claude_api_organizations";
          }
        }
      }
      const needsLiveAiApiIdentityCheck =
        !cachedAiHttpVerify[svcLower] &&
        (svcLower === "grok" || svcLower === "cursor" || svcLower === "chatgpt") &&
        (isLiveWindow ||
          !verifiedAiServerUid ||
          verifiedAiServerUid === "nextauth_jwe_verified" ||
          !String(row.browser || "").trim() ||
          String(curSnapCheck?.status || "") !== "logged_in");
      if (
        (!verifiedAiServerUid || needsLiveAiApiIdentityCheck) &&
        !isCurrentlyDisabledOrBanned &&
        aiCookieList.length > 0 &&
        !fbForcedOverride &&
        match.resultCode !== "account_mismatch"
      ) {
        const cookieHdr = aiCookieList
          .filter((c) => c?.name && c?.value)
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        try {
          if (svcLower === "grok" && /sso=/i.test(cookieHdr)) {
            const gRes = await fetch("https://grok.com/rest/auth/get-user", {
              headers: { Cookie: cookieHdr, Accept: "application/json" },
              signal: AbortSignal.timeout(4000),
            });
            if (gRes.ok) {
              const gJson = await gRes.json().catch(() => null);
              const uid = String(gJson?.userId || gJson?.user?.id || gJson?.id || "").trim();
              const email = normalizeComparableEmail(gJson?.email || gJson?.user?.email);
              if (uid) {
                cachedAiHttpVerify.grok = { ok: true, loggedIn: true, uid, email, method: "grok_rest_auth_get_user" };
                if (isAiAccountEmailMismatch(email, uid)) {
                  match.loggedIn = false;
                  match.resultCode = "account_mismatch";
                  match.actualAccount = email;
                  verifiedAiServerUid = "";
                } else {
                  verifiedAiServerUid = uid;
                  verifiedAiMethod = "grok_rest_auth_get_user";
                  match.resultCode = "grok_rest_auth_get_user";
                }
              }
            }
          } else if (svcLower === "cursor" && /WorkosCursorSessionToken=/i.test(cookieHdr)) {
            const cRes = await fetch("https://cursor.com/api/auth/me", {
              headers: { Cookie: cookieHdr, Accept: "application/json", "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(4000),
            });
            if (cRes.ok) {
              const cJson = await cRes.json().catch(() => null);
              const uid = String(cJson?.sub || cJson?.id || cJson?.user?.id || "").trim();
              const email = normalizeComparableEmail(cJson?.email || cJson?.user?.email);
              if (uid) {
                cachedAiHttpVerify.cursor = { ok: true, loggedIn: true, uid, email, method: "cursor_auth_me_api" };
                if (isAiAccountEmailMismatch(email, uid)) {
                  match.loggedIn = false;
                  match.resultCode = "account_mismatch";
                  match.actualAccount = email;
                  verifiedAiServerUid = "";
                } else {
                  verifiedAiServerUid = uid;
                  verifiedAiMethod = "cursor_auth_me_api";
                  match.resultCode = "cursor_auth_me_api";
                }
              }
            }
          } else if (svcLower === "chatgpt" && /session-token(?:\.\d+)?=/i.test(cookieHdr)) {
            const oRes = await fetch("https://chatgpt.com/api/auth/session", {
              headers: { Cookie: cookieHdr, Accept: "application/json", "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(4000),
            });
            if (oRes.ok) {
              const oJson = await oRes.json().catch(() => null);
              const uid = String(oJson?.user?.id || "").trim();
              const email = normalizeComparableEmail(oJson?.user?.email);
              if (uid && oJson?.accessToken) {
                cachedAiHttpVerify.chatgpt = { ok: true, loggedIn: true, uid, email, method: "chatgpt_api_auth_session" };
                if (isAiAccountEmailMismatch(email, uid)) {
                  match.loggedIn = false;
                  match.resultCode = "account_mismatch";
                  match.actualAccount = email;
                  verifiedAiServerUid = "";
                } else {
                  verifiedAiServerUid = uid;
                  verifiedAiMethod = "chatgpt_api_auth_session";
                  match.resultCode = "chatgpt_api_auth_session";
                }
              }
            }
          } else if (svcLower === "perplexity") {
            const pRes = await fetch("https://www.perplexity.ai/api/auth/session", {
              headers: { Cookie: cookieHdr, Accept: "application/json" },
              signal: AbortSignal.timeout(4000),
            });
            if (pRes.ok) {
              const pJson = await pRes.json().catch(() => null);
              const uid = String(pJson?.user?.id || "").trim();
              if (uid) verifiedAiServerUid = uid;
            }
          }
        } catch {
          /* ignore transient network error */
        }
      }
      if (isCurrentlyDisabledOrBanned && !verifiedAiServerUid) {
        match.loggedIn = false;
        match.resultCode = "account_disabled_banned";
      } else if (
        !verifiedAiServerUid &&
        !fbForcedOverride &&
        match.resultCode !== "account_mismatch" &&
        match.resultCode !== "SESSION_EXPIRED_OR_REVOKED" &&
        (svcLower === "claude" ||
          svcLower === "chatgpt" ||
          svcLower === "cursor" ||
          svcLower === "grok" ||
          ((svcLower === "capcut" || svcLower === "elevenlabs") && !curSnapCheck?.login_verified_at))
      ) {
        match.loggedIn = false;
        match.resultCode = "UNVERIFIED_SESSION_BLOCKED";
      }
    }

    if (
      match.resultCode === "account_mismatch" &&
      match.actualAccount &&
      rows.some(
        (r) =>
          r &&
          r.id !== row.id &&
          String(r.service || "").trim().toLowerCase() === svcLower &&
          areComparableEmailsEqual(r.account, match.actualAccount),
      )
    ) {
      match.loggedIn = false;
      match.resultCode = "login_page";
      match.actualAccount = "";
    }


  Object.assign(probeState, {
    hasVerifiedGoogleAuth,
    cachedTikTokHttpVerify,
    hasVerifiedTikTokAuth,
    cachedTwitterHttpVerify,
    hasVerifiedTwitterAuth,
    cachedInstagramHttpVerify,
    hasVerifiedInstagramAuth,
    cachedAiHttpVerify,
  });

  return {
    fbForcedOverride,
    hasVerifiedFacebookAuth,
    aiUidSpec,
    verifiedAiServerUid,
    verifiedAiMethod,
    verifiedElevenLabsOnboarding,
    verifiedCapcutConnectsCount,
  };
}

module.exports = {
  isTwitterFamilyService,
  AI_SERVICE_UID_KEY_MAP,
  discoverAndAutoBindUnassignedP0020Rows,
  verifyRowPlatformAndAiSession,
};
