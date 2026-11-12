"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  resolveP0002VaultDir,
  resolveServiceMatcher,
  buildMailCookieTelemetryMetadata,
} = require("./service-cookie-matchers.cjs");
const {
  sanitizePlaywrightCookieForVault,
} = require("./disk-sqlite-cookies.cjs");
const {
  isGoogleFamilyService,
  resolveGoogleRestrictionTargetServices,
  doesGoogleTargetRestrictionApplyToService,
  isMicrosoftFamilyService,
} = require("./live-cdp-targets.cjs");
const { isTwitterFamilyService } = require("./p0020-row-verifier.cjs");

const STALE_NON_LOGGED_IN_SPECIFIC_LABELS = new Set([
  "queued_ready_to_login",
  "queued_totp_ready",
  "totp_2fa_ready_to_heal",
  "missing_credentials",
  "account_disabled_banned",
  "wiped_cookie_requeued",
  "challenge_no_totp",
  "captcha_or_slider",
]);

const NON_OVERRIDABLE_RESTRICTED_RESULT_CODES = new Set([
  "permanently_closed_restricted",
  "appeal_submitted",
  "disabled_appeal_submitted",
  "disabled_pending_appeal",
  "account_suspended_or_logged_out",
  "anonymous_cookie_purged",
  "fb_checkpoint_282",
  "fb_checkpoint_956",
  "checkpoint",
  "account_disabled",
  "account_disabled_banned",
  "disabled_final",
  "disabled_final_282",
  "two_step_verification",
  "challenged_verification",
  "challenged_or_logged_out",
  "phone_sms_required",
  "phone_locked_abuse",
  "unowned_recovery_email",
  "mark_lost_pending_30d",
  "microsoft_challenge",
  "phone_challenge",
  "mail_challenge",
  "selfie_verification_required",
  "google_challenge",
  "password_rejected",
  "2fa_pending",
  "totp_secret_mismatch",
]);

let _checkpointFilesCache = null;
let _checkpointFilesLoadedAt = 0;

function getDiskCheckpointCodeForProfile(profileCode = "") {
  const code = String(profileCode || "").trim().padStart(4, "0");
  if (!/^\d{4}$/.test(code)) return "";
  const nowMs = Date.now();
  if (!_checkpointFilesCache || nowMs - _checkpointFilesLoadedAt > 60_000) {
    const map = new Map();
    try {
      const vaultDir = resolveP0002VaultDir();
      const cpDir = vaultDir ? path.join(vaultDir, "checkpoints") : "";
      if (cpDir && fs.existsSync(cpDir)) {
        const files = fs.readdirSync(cpDir);
        for (const f of files) {
          const m = String(f).match(/^checkpoint-(\d{4})-(282|956|902|checkpoint)-/i);
          if (m) {
            const pCode = m[1];
            const cpCode = m[2].toLowerCase();
            if (!map.has(pCode) || cpCode === "282" || cpCode === "956") {
              map.set(pCode, cpCode);
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
    _checkpointFilesCache = map;
    _checkpointFilesLoadedAt = nowMs;
  }
  return _checkpointFilesCache.get(code) || "";
}

function isFacebookRowInCheckpointOrDisabled(row) {
  const svcLower = String(row?.service || "").trim().toLowerCase();
  if (svcLower !== "facebook") return false;
  const rowStatus = String(row?.status || "").trim().toLowerCase();
  if (rowStatus === "disable" || rowStatus === "banned" || rowStatus === "appeal") return true;
  const curSnap = row?.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : {};
  const curSnapStatus = String(curSnap.status || "").trim().toLowerCase();
  const curResCode = String(curSnap.result_code || "").trim().toLowerCase();
  const curSpecific = String(curSnap.specific_label || "").trim().toLowerCase();
  const curSubState = String(curSnap.checkpoint_282_sub_state || "").trim().toLowerCase();
  const rowNote = String(row?.note || "");
  const logTip = String(row?.log_tip_message || "");
  const snapNote = String(curSnap.note || "");
  const snapEv = String(curSnap.evidence || "");
  const combinedNotes = `${rowNote} ${logTip} ${snapNote} ${snapEv}`;
  if (curSnapStatus === "challenged") return true;
  if (NON_OVERRIDABLE_RESTRICTED_RESULT_CODES.has(curResCode)) return true;
  if (/checkpoint|282|956|disabled|banned|two_step/i.test(curSpecific)) return true;
  if (Boolean(curSnap.checkpoint_url)) return true;
  if (curSubState && curSubState !== "approved_unlocked") return true;
  const explicitlyUnlocked =
    curResCode === "unlocked_checkpoint_282" ||
    curResCode === "unlocked_checkpoint_956" ||
    Boolean(curSnap.checkpoint_282_approved_at) ||
    /Unlocked from 282|Unlocked from 956/i.test(combinedNotes);
  if (
    !explicitlyUnlocked &&
    /checkpoint\s*282|checkpoint\s*956|1501092823525282|828281030927956|advanced_protection|hit Facebook login\/checkpoint|kh\u00f3a v\u0129nh vi\u1ec5n|permanently disabled|disabled_final|Die VV/i.test(
      combinedNotes,
    )
  ) {
    return true;
  }
  const code = String(row?.browser || curSnap.assigned_browser || "").trim().padStart(4, "0");
  if (!explicitlyUnlocked && /^\d{4}$/.test(code) && getDiskCheckpointCodeForProfile(code)) {
    return true;
  }
  return false;
}

function shouldPreserveChallengedState(
  row,
  loggedIn,
  {
    isLiveWindow = false,
    hasVerifiedGoogleLiveTab = false,
    hasVerifiedGoogleAuth = false,
    gmailRestriction54Lifted = false,
    hasVerifiedMicrosoftLiveTab = false,
    hasVerifiedMicrosoftAuth = false,
    hasVerifiedFacebookAuth = false,
    hasExplicitServiceLogout = false,
  } = {},
) {
  const curSnap = row?.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : {};
  const curSnapStatus = String(curSnap.status || "").trim().toLowerCase();
  const curResCode = String(curSnap.result_code || "").trim().toLowerCase();
  const curSpecific = String(curSnap.specific_label || "").trim().toLowerCase();
  const curNote = String(curSnap.note || "");
  const curSource = String(curSnap.source || "");
  const rowStatus = String(row?.status || "").trim().toLowerCase();
  const svcLower = String(row?.service || "").trim().toLowerCase();
  const hasExplicitGoogleChallengeNote =
    /(?:\[TẠM BỎ QUA|\[CHỜ SIM OTP|\[CHỜ QUÉT QR|Sai\/Lệch mã 2FA|LỆCH 2FA SECRET|Tài khoản bị Google vô hiệu hóa|Tài khoản đã bị xóa)/i.test(
      `${String(row?.note || "")} ${curNote}`,
    ) ||
    curResCode === "totp_secret_mismatch" ||
    curResCode === "phone_sms_required" ||
    curResCode === "checkpoint_qr" ||
    curSnapStatus === "quarantined_sms" ||
    curSnap.sms_quarantined === true;
  const isGoogleChallengedOrErrorRow =
    isGoogleFamilyService(svcLower) &&
    (hasExplicitGoogleChallengeNote ||
      ["error", "check_phone", "check_mail", "checkpoint_qr", "incorrect_info", "wrong_2fa", "appeal", "disable"].includes(rowStatus));
  const googleAuthVerified = Boolean((isLiveWindow && hasVerifiedGoogleLiveTab) || hasVerifiedGoogleAuth);
  const msAuthVerified = Boolean((isLiveWindow && hasVerifiedMicrosoftLiveTab) || hasVerifiedMicrosoftAuth);
  const fbAuthVerified = Boolean(hasVerifiedFacebookAuth);

  if (svcLower === "facebook" && fbAuthVerified && loggedIn) {
    return false;
  }

  // Never allow passive cookie scans to overwrite disabled/restricted/appealing rows
  // (e.g. Claude /restricted retains a sessionKey cookie; Facebook /checkpoint/282 & /checkpoint/956 retain c_user+xs cookies).
  const curRestrictionServices = resolveGoogleRestrictionTargetServices(String(curSnap.evidence || ""));
  const curRestrictionAppliesToRow =
    !(gmailRestriction54Lifted && /restrictions\/54\b/i.test(String(curSnap.evidence || ""))) &&
    doesGoogleTargetRestrictionApplyToService(
      curRestrictionServices ? { restrictedServices: curRestrictionServices } : null,
      svcLower,
    );
  if ((rowStatus === "disable" || rowStatus === "banned") && (!isGoogleFamilyService(svcLower) || curRestrictionAppliesToRow)) {
    return true;
  }
  if (
    isGoogleFamilyService(svcLower) &&
    (rowStatus === "appeal" || curResCode === "disabled_appeal_submitted") &&
    curRestrictionAppliesToRow &&
    !(isLiveWindow && hasVerifiedGoogleLiveTab && loggedIn)
  ) {
    return true;
  }
  if (
    isGoogleFamilyService(svcLower) &&
    (rowStatus === "checkpoint_qr" || curResCode === "checkpoint_qr") &&
    !(googleAuthVerified && loggedIn)
  ) {
    return true;
  }
  if (NON_OVERRIDABLE_RESTRICTED_RESULT_CODES.has(curResCode)) {
    if (isGoogleFamilyService(svcLower) && googleAuthVerified && loggedIn) {
      return false;
    }
    if (isMicrosoftFamilyService(svcLower) && msAuthVerified && loggedIn) {
      return false;
    }
    if (svcLower === "facebook" && fbAuthVerified && loggedIn) {
      return false;
    }
    return true;
  }
  if (rowStatus === "appeal" && (svcLower === "claude" || svcLower === "facebook")) return true;
  if (isFacebookRowInCheckpointOrDisabled(row)) return true;

  // Google leaves stale SID/SAPISID/LSID cookies on disk even when signed out or challenged on accounts.google.com.
  // Never allow passive unverified disk cookie scans to flip a challenged or explicitly logged-out Google row to logged_in.
  if (
    isGoogleFamilyService(svcLower) &&
    !googleAuthVerified &&
    (isGoogleChallengedOrErrorRow ||
      (curSnapStatus === "not_logged_in" && (curResCode === "login_page" || curResCode === "google_one_logged_out")))
  ) {
    return true;
  }

  // Preserve active 24h OTP rate-limit cooldown even on multi-account browsers where another account's cookies exist.
  const curCooldownUntilMs = curSnap?.cooldown_until ? Date.parse(String(curSnap.cooldown_until)) : NaN;
  if (
    Number.isFinite(curCooldownUntilMs) &&
    curCooldownUntilMs > Date.now() &&
    (curSnapStatus === "challenged" ||
      curSnap?.specific_label === "otp_rate_limited_24h" ||
      curSnap?.result_code === "otp_rate_limited_24h")
  ) {
    return true;
  }

  // Microsoft (Outlook/Hotmail) also retains stale RPSSecAuth / MSPAuth cookies when locked or challenged on account.live.com.
  if (
    isMicrosoftFamilyService(svcLower) &&
    !msAuthVerified &&
    (curSnapStatus === "challenged" ||
      ["error", "check_phone", "check_mail", "incorrect_info", "appeal", "disable"].includes(rowStatus))
  ) {
    return true;
  }

  if (loggedIn) return false;
  if (
    !hasExplicitServiceLogout &&
    curSnapStatus === "logged_in" &&
    (curSnap.source === "p0020_live_auth_verify" ||
      curSnap.login_verified_method === "claude_api_organizations" ||
      curSnap.result_code === "claude_api_organizations" ||
      Boolean(curSnap.kyc_appeal))
  ) {
    return true;
  }
  if (
    curSnapStatus === "challenged" ||
    curSnap.auto_unlock_exhausted === true ||
    curSnap.sms_quarantined === true
  ) {
    return true;
  }
  if (
    ["appeal", "disable", "incorrect_info", "check_phone", "checkpoint_qr", "verify_phone"].includes(rowStatus) ||
    (curSnapStatus !== "logged_in" && ["check_mail", "error"].includes(rowStatus))
  ) {
    return true;
  }
  return false;
}

/**
 * Constructs the normalized `stealth_snapshot` and Supabase PostgREST `patchBody`
 * for a P0020 `twofa_accounts` row whose session state changed.
 */
function buildP0020RowSnapshotAndPatch({
  row,
  svc,
  svcLower,
  code,
  profileId,
  source,
  nowIso,
  match,
  curSnap,
  targetStatus,
  fbForcedOverride,
  gcpLiveRestriction,
  targetGcpStatus,
  targetMailCloud,
  isLiveWindow,
  cleanDebugPort,
  rowStatusLower,
  gmailRestriction54Lifted,
  rowRestrictionAppliesToService,
  pairs,
  vaultEntryCookies,
  aiUidSpec,
  verifiedAiServerUid,
  verifiedAiMethod,
  verifiedElevenLabsOnboarding,
  verifiedCapcutConnectsCount,
  cachedGoogleHttpVerify,
  cachedMicrosoftHttpVerify,
  hasVerifiedFacebookAuth,
  hasVerifiedTikTokAuth,
  cachedTikTokHttpVerify,
  hasVerifiedTwitterAuth,
  cachedTwitterHttpVerify,
  hasVerifiedInstagramAuth,
  cachedInstagramHttpVerify,
  needsRowStatusPromotion,
  hasStaleChallengeNoteWhenLoggedIn,
  existingRowNote,
  hasFreshDecryptedPairs,
  needsBrowserAssignmentUpdate,
}) {
    const nextSnap = {
      ...(curSnap || {}),
      v: 1,
      status: targetStatus,
      session_status: targetStatus,
      logged_in: Boolean(match.loggedIn),
      auth_state: match.loggedIn
        ? "authenticated"
        : targetStatus === "challenged"
          ? "challenged"
          : "not_authenticated",
      result_code: match.resultCode,
      checked_at: nowIso,
      last_synced_at: nowIso,
      source: `${source}:${svc.toLowerCase()}`,
      assigned_browser: code,
      actual_browser: code,
      mismatch: match.resultCode === "account_mismatch",
      profile_id: profileId || curSnap?.profile_id || null,
      evidence: fbForcedOverride?.evidence
        ? fbForcedOverride.evidence
        : gcpLiveRestriction?.evidence
          ? gcpLiveRestriction.evidence
          : match.loggedIn
            ? `${svc}:logged_in (${match.matchedNames.slice(0, 3).join(",")}) on #${code}`
            : match.resultCode === "account_mismatch" && match.actualAccount
              ? `${svc}:account_mismatch (${match.actualAccount} != ${row.account}) on #${code}`
              : `${svc}:not_logged_in on #${code}`,
    };
    if (fbForcedOverride?.restrictedServiceId) {
      nextSnap.restricted_service_id = String(fbForcedOverride.restrictedServiceId);
    } else if (gcpLiveRestriction) {
      nextSnap.restricted_service_id = "47";
      nextSnap.gcp_restriction_status = targetGcpStatus;
    }
    if (isLiveWindow) {
      nextSnap.live_cdp = true;
      nextSnap.debug_port = cleanDebugPort;
    } else {
      delete nextSnap.live_cdp;
      delete nextSnap.debug_port;
    }
    if (fbForcedOverride?.note) {
      nextSnap.note = fbForcedOverride.note;
    }
    if (match.loggedIn) {
      if (
        isGoogleFamilyService(svcLower) &&
        (rowStatusLower === "appeal" || rowStatusLower === "disable") &&
        (gmailRestriction54Lifted || !rowRestrictionAppliesToService)
      ) {
        nextSnap.appeal_restored = true;
      }
      delete nextSnap.specific_label;
      delete nextSnap.specific_label_text;
      delete nextSnap.specific_category;
      delete nextSnap.checkpoint_url;
      delete nextSnap.checkpoint_282_sub_state;
      delete nextSnap.sms_quarantined;
      delete nextSnap.auto_unlock_exhausted;
      delete nextSnap.auto_unlock_exhausted_at;
      delete nextSnap.auto_unlock_exhausted_reason;
      delete nextSnap.exhausted_totp_secret;
      delete nextSnap.exhausted_with_password;
      nextSnap.note = isLiveWindow
        ? `Logged into ${svc} on #${code} (Live Window · Port ${cleanDebugPort})`
        : `Logged into ${svc} on #${code} (live session synced)`;
    } else if (
      targetStatus === "not_logged_in" &&
      /^(google_challenge|session_ambiguous|login_page|captcha_or_slider|NO_AUTH_SESSION_COOKIE)$/i.test(
        String(nextSnap.auto_unlock_exhausted_reason || nextSnap.result_code || ""),
      )
    ) {
      delete nextSnap.auto_unlock_exhausted;
      delete nextSnap.auto_unlock_exhausted_at;
      delete nextSnap.auto_unlock_exhausted_reason;
      if (nextSnap.specific_label === "auto_unlock_exhausted") {
        delete nextSnap.specific_label;
        delete nextSnap.specific_label_text;
      }
    }
    if (match.loggedIn) {
      if (String(nextSnap.session_token || "").includes("-auth-session=sso_")) {
        delete nextSnap.session_token;
      }
      if (!nextSnap.session_token || String(curSnap?.auth_state || "").toLowerCase() === "session_expired") {
        const svcMatcher = resolveServiceMatcher(svc);
        const rawCandidateList = Array.isArray(pairs) && pairs.some((c) => c && c.value) ? pairs : vaultEntryCookies;
        const candidateList = Array.isArray(rawCandidateList)
          ? rawCandidateList.filter((c) => {
              if (!c?.name || !c?.value || c.value === "disk_verified_sqlite") return false;
              if (!svcMatcher || typeof svcMatcher.match !== "function") return true;
              const d = String(c.domain || c.host_key || "").toLowerCase();
              return Boolean(svcMatcher.match(d, String(c.name || ""), c.value));
            })
          : null;
        const ck = Array.isArray(candidateList)
          ? candidateList.find(
              (c) =>
                c?.name &&
                c?.value &&
                String(c.value).length >= 6 &&
                (!isGoogleFamilyService(svcLower) ||
                  c.name === "SID" ||
                  c.name === "__Secure-1PSID" ||
                  c.name === "__Secure-3PSID" ||
                  c.name === "SAPISID" ||
                  c.name === "__Secure-1PAPISID" ||
                  c.name === "__Secure-3PAPISID" ||
                  c.name === "LSID"),
            ) || candidateList.find((c) => c?.name && c?.value && String(c.value).length >= 6)
          : null;
        if (ck) {
          nextSnap.session_token = `${ck.name}=${ck.value}`;
        }
      }
      if (aiUidSpec) {
        if (
          verifiedAiServerUid &&
          verifiedAiServerUid !== "nextauth_jwe_verified" &&
          verifiedAiServerUid !== "claude_api_organizations_verified"
        ) {
          nextSnap[aiUidSpec.key] = verifiedAiServerUid;
        }
        nextSnap.login_verified_at = curSnap?.login_verified_at || nowIso;
        nextSnap.login_verified_method = curSnap?.login_verified_method || verifiedAiMethod || "session_cookie_verified";
        if (svcLower === "elevenlabs" && verifiedElevenLabsOnboarding === true) {
          nextSnap.is_onboarding_completed = true;
        }
        if (svcLower === "elevenlabs" && match.firebaseRefreshToken) {
          nextSnap.firebase_refresh_token = match.firebaseRefreshToken;
        }
        if (svcLower === "capcut" && Number.isFinite(verifiedCapcutConnectsCount)) {
          nextSnap.passport_connects_count = verifiedCapcutConnectsCount;
          if (verifiedCapcutConnectsCount === 0) {
            delete nextSnap.verified_mail_google;
            delete nextSnap.google_oauth_verified;
          }
        }
      }
      if (isGoogleFamilyService(svcLower)) {
        nextSnap.gmail_session_ready = true;
        nextSnap.login_verified_at = curSnap?.login_verified_at || nowIso;
        nextSnap.login_verified_method = "google_list_accounts_http";
        delete nextSnap.actual_session_account;
        if (Array.isArray(cachedGoogleHttpVerify?.verifiedEmails) && cachedGoogleHttpVerify.verifiedEmails.length > 0) {
          nextSnap.verified_google_email = cachedGoogleHttpVerify.verifiedEmails[0];
        }
        const rawGoogleSource = Array.isArray(pairs) && pairs.some((c) => c && c.value) ? pairs : vaultEntryCookies;
        if (Array.isArray(rawGoogleSource) && rawGoogleSource.length > 0) {
          const mailMap = new Map();
          for (const c of rawGoogleSource) {
            const d = String(c?.domain || c?.host_key || "").toLowerCase();
            if ((d === ".google.com" || d === "google.com") && c?.name && c?.value && c.value !== "disk_verified_sqlite") {
              mailMap.set(c.name, c.value);
            }
          }
          for (const c of rawGoogleSource) {
            const d = String(c?.domain || c?.host_key || "").toLowerCase();
            if (d.includes("mail.google.com") && c?.name && c?.value && c.value !== "disk_verified_sqlite") {
              mailMap.set(c.name, c.value);
            }
          }
          if ((mailMap.has("SID") || mailMap.has("__Secure-1PSID")) && (mailMap.has("OSID") || mailMap.has("__Secure-OSID"))) {
            nextSnap.gmail_cookie_header = [...mailMap.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
          }
        }
      } else if (isMicrosoftFamilyService(svcLower)) {
        nextSnap.login_verified_at = curSnap?.login_verified_at || nowIso;
        nextSnap.login_verified_method = "microsoft_login_srf_http";
        delete nextSnap.actual_session_account;
        if (Array.isArray(cachedMicrosoftHttpVerify?.verifiedEmails) && cachedMicrosoftHttpVerify.verifiedEmails.length > 0) {
          nextSnap.verified_microsoft_email = cachedMicrosoftHttpVerify.verifiedEmails[0];
        }
      } else if (svcLower === "facebook" && hasVerifiedFacebookAuth) {
        nextSnap.login_verified_at = curSnap?.login_verified_at || nowIso;
        nextSnap.login_verified_method = "facebook_me_http";
        delete nextSnap.actual_session_account;
      } else if (svcLower === "tiktok" && hasVerifiedTikTokAuth) {
        nextSnap.login_verified_at = curSnap?.login_verified_at || nowIso;
        nextSnap.login_verified_method = "tiktok_passport_account_info_http";
        delete nextSnap.actual_session_account;
        if (cachedTikTokHttpVerify?.tiktokUserId) {
          nextSnap.tiktok_user_id = cachedTikTokHttpVerify.tiktokUserId;
        }
        if (cachedTikTokHttpVerify?.tiktokUsername) {
          nextSnap.tiktok_username = cachedTikTokHttpVerify.tiktokUsername;
        }
      } else if (isTwitterFamilyService(svcLower) && hasVerifiedTwitterAuth) {
        nextSnap.login_verified_at = curSnap?.login_verified_at || nowIso;
        nextSnap.login_verified_method = "twitter_account_settings_http";
        delete nextSnap.actual_session_account;
        if (cachedTwitterHttpVerify?.twitterScreenName) {
          nextSnap.twitter_screen_name = cachedTwitterHttpVerify.twitterScreenName;
        }
      } else if (svcLower === "instagram" && hasVerifiedInstagramAuth) {
        nextSnap.login_verified_at = curSnap?.login_verified_at || nowIso;
        nextSnap.login_verified_method = "instagram_accounts_edit_http";
        delete nextSnap.actual_session_account;
        if (cachedInstagramHttpVerify?.instagramUserId) {
          nextSnap.instagram_user_id = cachedInstagramHttpVerify.instagramUserId;
        }
        if (cachedInstagramHttpVerify?.instagramUsername) {
          nextSnap.instagram_username = cachedInstagramHttpVerify.instagramUsername;
        }
      }
      nextSnap.auth_state = "authenticated";
      nextSnap.logged_in = true;
      nextSnap.session_status = "logged_in";
      if (
        nextSnap.capcut_workspace &&
        typeof nextSnap.capcut_workspace === "object" &&
        /\/(signup|login|forget-password|reset-password)\b/i.test(String(nextSnap.capcut_workspace.workspaceUrl || ""))
      ) {
        nextSnap.capcut_workspace = {
          ...nextSnap.capcut_workspace,
          workspaceUrl: "https://www.capcut.com/my-edit",
        };
      }
      if (String(nextSnap.api_key_detail || "").includes("verified session / API key active")) {
        delete nextSnap.api_key_status;
        delete nextSnap.api_key_code;
        delete nextSnap.api_key_detail;
        delete nextSnap.api_key_checked_at;
      }
    } else {
      nextSnap.logged_in = false;
      nextSnap.session_status = targetStatus;
      nextSnap.auth_state =
        fbForcedOverride?.banned || match.resultCode === "account_disabled_banned"
          ? "disabled"
          : "session_expired";
      if (svcLower === "elevenlabs" && verifiedElevenLabsOnboarding === false) {
        nextSnap.is_onboarding_completed = false;
      }
      delete nextSnap.login_verified_at;
      delete nextSnap.login_verified_method;
      delete nextSnap.session_token;
      delete nextSnap.api_key_status;
      delete nextSnap.api_key_code;
      delete nextSnap.api_key_detail;
      if (isGoogleFamilyService(svcLower)) {
        delete nextSnap.gmail_session_ready;
        delete nextSnap.verified_google_email;
      }
      if (match.resultCode === "account_mismatch" && match.actualAccount) {
        nextSnap.actual_session_account = match.actualAccount;
      } else {
        delete nextSnap.actual_session_account;
      }
      if (aiUidSpec?.key) delete nextSnap[aiUidSpec.key];
      const hasTotpSecretMismatchLock =
        isGoogleFamilyService(svcLower) &&
        fbForcedOverride?.resultCode !== "checkpoint_qr" &&
        fbForcedOverride?.resultCode !== "account_disabled" &&
        fbForcedOverride?.resultCode !== "phone_sms_required" &&
        (row.status === "wrong_2fa" ||
          curSnap?.auto_unlock_exhausted_reason === "totp_secret_mismatch" ||
          curSnap?.result_code === "totp_secret_mismatch" ||
          curSnap?.specific_label === "totp_secret_mismatch" ||
          Boolean(curSnap?.exhausted_totp_secret));
      if (fbForcedOverride?.resultCode === "checkpoint_qr") {
        delete nextSnap.exhausted_totp_secret;
        delete nextSnap.auto_unlock_exhausted_reason;
        nextSnap.status = "quarantined_sms";
        nextSnap.session_status = "quarantined_sms";
        nextSnap.specific_label = "checkpoint_qr";
        nextSnap.specific_label_text = "📷 Checkpoint QR (Quét mã QR điện thoại)";
        nextSnap.specific_category = "platform_checkpoint";
      } else if (hasTotpSecretMismatchLock) {
        nextSnap.status = "challenged";
        nextSnap.session_status = "challenged";
        nextSnap.result_code = "totp_secret_mismatch";
        nextSnap.specific_label = "totp_secret_mismatch";
        nextSnap.specific_label_text = "🔐 Sai/Lệch 2FA Secret (Incorrect 2FA)";
        nextSnap.specific_category = "dead_permanent";
        nextSnap.note =
          curSnap?.note && /lệch.*2fa|sai.*2fa|totp_secret_mismatch/i.test(String(curSnap.note))
            ? curSnap.note
            : "Sai/Lệch mã 2FA Secret (Google từ chối mã TOTP 2FA hiện tại)";
      } else if (!curSnap?.auto_unlock_exhausted && !curSnap?.sms_quarantined && targetStatus !== "challenged") {
        delete nextSnap.sms_quarantined;
        delete nextSnap.specific_label;
        delete nextSnap.specific_label_text;
        delete nextSnap.specific_category;
      }
      if (!hasTotpSecretMismatchLock && !fbForcedOverride?.note && !curSnap?.auto_unlock_exhausted && !curSnap?.sms_quarantined) {
        nextSnap.note =
          match.resultCode === "account_mismatch" && match.actualAccount
            ? `Not logged into ${svc} on #${code} (account_mismatch: session belongs to ${match.actualAccount})`
            : `Not logged into ${svc} on #${code} (${match.resultCode || "login_page"})`;
      }
    }

    const patchBody = {
      stealth_snapshot: nextSnap,
      stealth_checked_at: nowIso,
      updated_at: nowIso,
      ...(targetMailCloud ? { mail_cloud: targetMailCloud } : {}),
    };
    if (
      !match.loggedIn &&
      (fbForcedOverride?.banned || fbForcedOverride?.expired || match.resultCode === "account_mismatch") &&
      Array.isArray(row.stealth_cookies) &&
      row.stealth_cookies.length > 0
    ) {
      patchBody.stealth_cookies = [];
    }
    if (
      !match.loggedIn &&
      nextSnap.result_code === "totp_secret_mismatch" &&
      row.status !== "disable" &&
      row.status !== "banned" &&
      row.status !== "appeal"
    ) {
      patchBody.status = "wrong_2fa";
    } else if (
      fbForcedOverride?.rowStatus &&
      row.status !== "disable" &&
      row.status !== "banned" &&
      row.status !== "appeal"
    ) {
      const hasExistingAppealEvidence =
        Boolean(curSnap?.appeal_submitted || curSnap?.appeal_reference) ||
        /📋 Hồ sơ kháng nghị|Ref:\s*(TS-|ANTHR-|OAI-)/i.test(String(row.note || ""));
      if (fbForcedOverride.rowStatus === "disable" && hasExistingAppealEvidence) {
        patchBody.status = "appeal";
        nextSnap.appeal_submitted = true;
        nextSnap.result_code = "appeal_submitted";
      } else {
        patchBody.status = fbForcedOverride.rowStatus;
      }
      if (fbForcedOverride.resultCode === "checkpoint_qr") {
        patchBody.mail_checking = "❌ Skipped";
        const nowVn = new Date(Date.now() + 7 * 3600_000);
        const dd = String(nowVn.getUTCDate()).padStart(2, "0");
        const mm = String(nowVn.getUTCMonth() + 1).padStart(2, "0");
        const yy = String(nowVn.getUTCFullYear()).slice(-2);
        const existingNoteStr = String(row.note || "").trim();
        if (/(?:💎|\bPlan\b)/i.test(existingNoteStr)) {
          const keptLines = existingNoteStr
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(
              (l) =>
                Boolean(l) &&
                !/Checkpoint Phone|\[CHỜ QUÉT QR\]|Lệch mã 2FA Secret|Sai\/Lệch mã 2FA Secret|\[TẠM BỎ QUA|^📅\s*\d{2}\/\d{2}\/\d{2}$/i.test(l),
            );
          patchBody.note = [...keptLines, `📅 ${dd}/${mm}/${yy}`, "✍️ 📷 [CHỜ QUÉT QR] Tài khoản dính Checkpoint QR điện thoại (/challenge/iap/qrcode)"].join("\n");
        } else {
          patchBody.note = `${dd}/${mm}/${yy} : 📷 [CHỜ QUÉT QR] Tài khoản dính Checkpoint QR điện thoại (/challenge/iap/qrcode)`;
        }
      }
    } else if (needsRowStatusPromotion && row.status !== "active") {
      patchBody.status = "active";
    }
    if (hasStaleChallengeNoteWhenLoggedIn) {
      const keptLines = existingRowNote
        .split(/\r?\n/)
        .map((l) =>
          l
            .trim()
            .replace(
              /^(?:✍️\s*)?(?:\d{2}\/\d{2}\/\d{2}\s*:\s*)?(?:❌\s*)?Google:\s*(?:Mật khẩu không chính xác|Mật khẩu của bạn đã thay đổi[^(\n]*|Your password was changed[^(\n]*)\s*\(Wrong password on #\d+\)\s*/i,
              "",
            )
            .trim(),
        )
        .filter(
          (l) =>
            Boolean(l) &&
            !/(?:Checkpoint Phone|\[CHỜ QUÉT QR\]|\/challenge\/iap|Lệch mã 2FA Secret|Sai\/Lệch mã 2FA Secret|\[TẠM BỎ QUA|\[CHỜ SIM OTP|Wrong password on #|Mật khẩu của bạn đã thay đổi|Your password was changed|Mật khẩu không chính xác|Lệch tài khoản Outlook trên #|Microsoft identity \/ recovery verification required|^📅\s*\d{2}\/\d{2}\/\d{2}$)/i.test(
              l,
            ),
        );
      patchBody.note = keptLines.join("\n");
    }

    const isMailNativeCloakRow = isGoogleFamilyService(svc) || isMicrosoftFamilyService(svc);
    if (isMailNativeCloakRow && Array.isArray(row.stealth_cookies) && row.stealth_cookies.length > 0) {
      // Read-Only Telemetry Metadata (`ok 1`): CloakBrowser SQLite is the sole SSOT for Gmail/Outlook/YouTube/Google One cookies.
      patchBody.stealth_cookies = null;
    }
    const rowHasPlaceholderCookies =
      Array.isArray(row.stealth_cookies) &&
      row.stealth_cookies.some((c) => !c?.value || c.value === "disk_verified_sqlite");
    if (
      match.loggedIn &&
      (!Array.isArray(row.stealth_cookies) ||
        row.stealth_cookies.length === 0 ||
        rowHasPlaceholderCookies ||
        hasFreshDecryptedPairs ||
        isMailNativeCloakRow)
    ) {
      const matcher = resolveServiceMatcher(svc);
      const candidateCookies =
        Array.isArray(pairs) && pairs.some((c) => c && c.value && c.value !== "disk_verified_sqlite")
          ? pairs
          : Array.isArray(vaultEntryCookies) &&
              vaultEntryCookies.some((c) => c && c.value && c.value !== "disk_verified_sqlite")
            ? vaultEntryCookies
            : null;
      if (matcher && Array.isArray(candidateCookies) && candidateCookies.length > 0) {
        const domainCookies = candidateCookies.filter((c) => {
          if (!c || !c.value || c.value === "disk_verified_sqlite") return false;
          const d = String(c.domain || "").toLowerCase();
          if (Array.isArray(matcher.domains)) {
            return matcher.domains.some((dom) => d.includes(dom));
          }
          if (typeof matcher.match === "function") {
            return Boolean(matcher.match(d, String(c.name || "")));
          }
          return false;
        });
        if (domainCookies.length > 0) {
          if (isMailNativeCloakRow) {
            nextSnap.cookie_telemetry = buildMailCookieTelemetryMetadata(domainCookies, svc);
            delete nextSnap.mail_cookies;
            delete nextSnap.service_cookies;
          } else {
            patchBody.stealth_cookies = domainCookies.map(sanitizePlaywrightCookieForVault);
          }
        }
      }
    }

    // If user solved challenge / logged in manually on P0003, promote row status back to active
    if (needsRowStatusPromotion) {
      patchBody.status = "active";
    }
    if (needsBrowserAssignmentUpdate) {
      patchBody.browser = code;
    }

  return { nextSnap, patchBody };
}

module.exports = {
  STALE_NON_LOGGED_IN_SPECIFIC_LABELS,
  NON_OVERRIDABLE_RESTRICTED_RESULT_CODES,
  getDiskCheckpointCodeForProfile,
  isFacebookRowInCheckpointOrDisabled,
  shouldPreserveChallengedState,
  buildP0020RowSnapshotAndPatch,
};
