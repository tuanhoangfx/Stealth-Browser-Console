"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildP0020RowSnapshotAndPatch,
  mergePreserveNewerForwardingSnapshot,
  normalizeFacebookDobToDdMmYyyy,
  extractFacebookBirthdayFromAboutText,
} = require("./p0020-snapshot-builder.cjs");
const {
  canPropagatePasswordBetweenServices,
} = require("./service-cookie-matchers.cjs");

test("flags password_reverify_needed when cookie promotes incorrect_info without fresh password verification", () => {
  const { nextSnap, patchBody } = buildP0020RowSnapshotAndPatch({
    row: {
      id: "row-1",
      account: "user@gmail.com",
      status: "incorrect_info",
      note: "Google: Mật khẩu không chính xác (Wrong password on #0135)\nMember since Sep 2026",
      stealth_checked_at: "2026-11-15T10:00:00.000Z",
      stealth_cookies: [],
    },
    svc: "Gmail",
    svcLower: "gmail",
    code: "0135",
    profileId: "prof-1",
    source: "p0003_deferred_post_close",
    nowIso: "2026-11-15T13:50:00.000Z",
    match: { loggedIn: true, resultCode: "google_cookies", matchedNames: ["SID", "LSID"] },
    curSnap: {
      status: "not_logged_in",
      result_code: "wrong_password",
      checked_at: "2026-11-15T10:00:00.000Z",
      password_verified_at: "2026-11-09T21:52:16.348Z",
    },
    targetStatus: "logged_in",
    rowStatusLower: "incorrect_info",
    pairs: [],
    vaultEntryCookies: [],
    needsRowStatusPromotion: true,
    hasStaleChallengeNoteWhenLoggedIn: true,
    existingRowNote: "Google: Mật khẩu không chính xác (Wrong password on #0135)\nMember since Sep 2026",
    hasFreshDecryptedPairs: false,
    needsBrowserAssignmentUpdate: false,
  });

  assert.equal(patchBody.status, "active");
  assert.equal("updated_at" in patchBody, false);
  assert.equal(nextSnap.password_reverify_needed, true);
  assert.equal(nextSnap.password_reverify_reason, "cookie_promoted_from_wrong_password");
  assert.equal(nextSnap.password_reverify_flagged_at, "2026-11-15T13:50:00.000Z");
  assert.match(patchBody.note, /Cookie sống nhưng mật khẩu DB chưa xác minh lại/);
  assert.match(patchBody.note, /Member since Sep 2026/);
});

test("clears password_reverify_needed once password_verified_at is newer than flagged timestamp", () => {
  const { nextSnap, patchBody } = buildP0020RowSnapshotAndPatch({
    row: {
      id: "row-1",
      account: "user@gmail.com",
      status: "active",
      note: "⚠️ Cookie sống nhưng mật khẩu DB chưa xác minh lại — cần kiểm tra/đổi pass\nMember since Sep 2026",
      stealth_checked_at: "2026-11-15T13:50:00.000Z",
      stealth_cookies: [],
    },
    svc: "Gmail",
    svcLower: "gmail",
    code: "0135",
    profileId: "prof-1",
    source: "p0003_live_nav",
    nowIso: "2026-11-15T14:05:00.000Z",
    match: { loggedIn: true, resultCode: "google_cookies", matchedNames: ["SID", "LSID"] },
    curSnap: {
      status: "logged_in",
      result_code: "google_cookies",
      checked_at: "2026-11-15T13:50:00.000Z",
      password_reverify_needed: true,
      password_reverify_reason: "cookie_promoted_from_wrong_password",
      password_reverify_flagged_at: "2026-11-15T13:50:00.000Z",
      password_verified_at: "2026-11-15T14:00:00.000Z",
      password_verified_method: "manual_ui",
    },
    targetStatus: "logged_in",
    rowStatusLower: "active",
    pairs: [],
    vaultEntryCookies: [],
    needsRowStatusPromotion: false,
    hasStaleChallengeNoteWhenLoggedIn: false,
    existingRowNote: "⚠️ Cookie sống nhưng mật khẩu DB chưa xác minh lại — cần kiểm tra/đổi pass\nMember since Sep 2026",
    hasFreshDecryptedPairs: false,
    needsBrowserAssignmentUpdate: false,
  });

  assert.equal(nextSnap.password_reverify_needed, undefined);
  assert.equal(nextSnap.password_reverify_reason, undefined);
  assert.equal(nextSnap.password_reverify_flagged_at, undefined);
  assert.equal("updated_at" in patchBody, false);
  assert.doesNotMatch(patchBody.note, /Cookie sống nhưng mật khẩu DB/);
  assert.match(patchBody.note, /Member since Sep 2026/);
});

test("P0003 twofa_accounts REST/Supabase PATCH writers omit client batch-start updated_at", () => {
  const electronDir = path.resolve(__dirname, "..");
  const checks = [
    {
      rel: path.join("multiplatform-sync", "p0020-snapshot-builder.cjs"),
      anchor: "const patchBody = {",
      span: 320,
    },
    {
      rel: path.join("multiplatform-sync", "session-activity-logs.cjs"),
      anchor: "log_tip_at: at,",
      span: 160,
    },
    {
      rel: path.join("multiplatform-sync", "session-activity-logs.cjs"),
      anchor: "stealth_snapshot: nextSnap,\n            }),",
      span: 120,
    },
    {
      rel: path.join("multiplatform-sync", "p0020-fleet-healers.cjs"),
      anchor: "stealth_snapshot: nextSnap,\n            stealth_checked_at: nowIso,",
      span: 120,
    },
    {
      rel: "twofa-vault-bridge.cjs",
      anchor: "async function patchStealthSnapshotByAccountId",
      span: 520,
    },
    {
      rel: "twofa-vault-bridge.cjs",
      anchor: "async function patchMailAccountOutcome",
      span: 1700,
    },
    {
      rel: "billing-autofill-bridge.cjs",
      anchor: "async function syncChatGptPlusPlanByVerifiedEmail",
      span: 2400,
    },
  ];
  for (const { rel, anchor, span } of checks) {
    const src = fs.readFileSync(path.join(electronDir, rel), "utf8");
    const idx = src.indexOf(anchor);
    assert.notEqual(idx, -1, `missing anchor in ${rel}: ${anchor}`);
    const slice = src.slice(idx, idx + span);
    assert.equal(
      /\bupdated_at\s*:/.test(slice),
      false,
      `unexpected client updated_at property in ${rel}`,
    );
  }
});

test("mergePreserveNewerForwardingSnapshot preserves newer DB anti_spam_filter_enabled and forwarding fields across stale window close sync", () => {
  const staleNext = {
    source: "p0003_window_close_sync:elevenlabs",
    forwarding_mode: "permanent_gmail_server_side",
    forwarding_enabled: true,
    anti_spam_filter_enabled: false,
    forwarding_updated_at: "2026-11-17T11:24:20.471Z",
    pending_mail_forward: "c99@infi28.com",
  };
  const latestDb = {
    forwarding_mode: "permanent_gmail_server_side",
    forwarding_verified_server_side: true,
    forwarding_enabled: true,
    anti_spam_filter_enabled: true,
    anti_spam_filter_sentinel: "infi28_never_match_sentinel_999",
    forwarding_updated_at: "2026-11-17T11:26:36.434Z",
    forwarding_target: "c99@infi28.com",
  };
  const merged = mergePreserveNewerForwardingSnapshot(staleNext, latestDb);
  assert.equal(merged.anti_spam_filter_enabled, true);
  assert.equal(merged.anti_spam_filter_sentinel, "infi28_never_match_sentinel_999");
  assert.equal(merged.forwarding_updated_at, "2026-11-17T11:26:36.434Z");
  assert.equal(merged.source, "p0003_window_close_sync:elevenlabs");
  assert.equal("pending_mail_forward" in merged, false);
});

test("mergePreserveNewerForwardingSnapshot preserves google_recovery_email_verified and app_password even when forwarding_updated_at did not advance", () => {
  const closeSyncSnap = {
    source: "p0003_window_close_sync:gmail",
    forwarding_mode: "permanent_gmail_server_side",
    forwarding_enabled: true,
    anti_spam_filter_enabled: true,
    forwarding_updated_at: "2026-11-17T20:22:39.224Z",
  };
  const latestDb = {
    forwarding_mode: "permanent_gmail_server_side",
    forwarding_enabled: true,
    anti_spam_filter_enabled: true,
    forwarding_updated_at: "2026-11-17T20:22:39.224Z",
    google_recovery_email_verified: "c32@elixcard.com",
    google_recovery_email_verified_at: "2026-11-17T20:22:38.000Z",
    recovery_email_policy_unavailable: false,
    app_password: "abcd efgh ijkl mnop",
    imap_app_password: "abcdefghijklmnop",
    previous_password_backup: "oldPass@1",
  };
  const merged = mergePreserveNewerForwardingSnapshot(closeSyncSnap, latestDb);
  assert.equal(merged.google_recovery_email_verified, "c32@elixcard.com");
  assert.equal(merged.google_recovery_email_verified_at, "2026-11-17T20:22:38.000Z");
  assert.equal(merged.app_password, "abcd efgh ijkl mnop");
  assert.equal(merged.imap_app_password, "abcdefghijklmnop");
  assert.equal(merged.previous_password_backup, "oldPass@1");
  assert.equal(merged.source, "p0003_window_close_sync:gmail");
});

test("canPropagatePasswordBetweenServices keeps Google SSO (including Google Flow and Gmail Edu) isolated from Facebook, Muse, and ChatGPT", () => {
  assert.equal(canPropagatePasswordBetweenServices("Gmail", "Google One"), true);
  assert.equal(canPropagatePasswordBetweenServices("Gmail", "Google Flow"), true);
  assert.equal(canPropagatePasswordBetweenServices("Gmail", "Gmail Edu"), true);
  assert.equal(canPropagatePasswordBetweenServices("Gmail", "YouTube"), true);
  assert.equal(canPropagatePasswordBetweenServices("Facebook", "Gmail"), false);
  assert.equal(canPropagatePasswordBetweenServices("Muse", "Gmail"), false);
  assert.equal(canPropagatePasswordBetweenServices("Gmail", "Facebook"), false);
  assert.equal(canPropagatePasswordBetweenServices("ChatGPT", "Gmail"), false);
});

test("Facebook c_user auto-match never hijacks a row already assigned to another profile", () => {
  const syncSrc = fs.readFileSync(
    path.resolve(__dirname, "..", "stealth-multiplatform-sync.cjs"),
    "utf8",
  );
  const uidLookupIdx = syncSrc.indexOf("const fbUidUrl =");
  assert.notEqual(uidLookupIdx, -1, "missing Facebook c_user lookup in stealth-multiplatform-sync.cjs");
  const uidLookupSlice = syncSrc.slice(uidLookupIdx, uidLookupIdx + 900);
  assert.match(
    uidLookupSlice,
    /if\s*\(\s*!curBrowser\s*\|\|\s*curBrowser\.padStart\(4,\s*"0"\)\s*===\s*code\s*\)/,
    "Facebook c_user lookup must skip rows already assigned to a different browser profile",
  );

  const assignIdx = syncSrc.indexOf("const needsBrowserAssignmentUpdate =");
  assert.notEqual(assignIdx, -1, "missing needsBrowserAssignmentUpdate in stealth-multiplatform-sync.cjs");
  const assignSlice = syncSrc.slice(assignIdx, assignIdx + 650);
  assert.match(
    assignSlice,
    /match\.loggedIn\s*&&\s*!curRowBrowser\s*&&/,
    "needsBrowserAssignmentUpdate must require !curRowBrowser across all services including Facebook",
  );
});

test("normalizeFacebookDobToDdMmYyyy converts unambiguous dates and preserves ambiguous D/M vs M/D dates", () => {
  assert.equal(normalizeFacebookDobToDdMmYyyy("1998-09-18"), "18/09/1998");
  assert.equal(normalizeFacebookDobToDdMmYyyy("1/25/01"), "25/01/2001");
  assert.equal(normalizeFacebookDobToDdMmYyyy("25/1/1995"), "25/01/1995");
  assert.equal(normalizeFacebookDobToDdMmYyyy("5.5.1993"), "05/05/1993");
  assert.equal(normalizeFacebookDobToDdMmYyyy("17/11/1995"), "17/11/1995");
  // Ambiguous short date must remain untouched rather than guessing DD/MM vs MM/DD
  assert.equal(normalizeFacebookDobToDdMmYyyy("1/11/92"), "1/11/92");
  // Reject impossible calendar day (Feb 30)
  assert.equal(normalizeFacebookDobToDdMmYyyy("1995-02-30"), "1995-02-30");

  const { patchBody } = buildP0020RowSnapshotAndPatch({
    row: {
      id: "row-fb-dob",
      account: "1001276236",
      status: "active",
      fb_dob: "1995-11-17",
      stealth_cookies: [],
    },
    svc: "Facebook",
    svcLower: "facebook",
    code: "0003",
    profileId: "prof-3",
    source: "p0003_live_nav",
    nowIso: "2026-11-21T06:00:00.000Z",
    match: { loggedIn: true, resultCode: "facebook_cookies", matchedNames: ["c_user", "xs"] },
    curSnap: { status: "logged_in", account: "1001276236" },
    targetStatus: "logged_in",
    rowStatusLower: "active",
    pairs: [],
    vaultEntryCookies: [],
    needsRowStatusPromotion: false,
    hasStaleChallengeNoteWhenLoggedIn: false,
    existingRowNote: "",
    hasFreshDecryptedPairs: false,
    needsBrowserAssignmentUpdate: false,
  });
  assert.equal(patchBody.fb_dob, "17/11/1995");
});

test("extractFacebookBirthdayFromAboutText parses VI and EN Facebook /me/about_contact_and_basic_info birthday blocks", () => {
  assert.equal(
    extractFacebookBirthdayFromAboutText("Thông tin cơ bản\n7 tháng 11\nNgày sinh\n1995\nNăm sinh"),
    "07/11/1995",
  );
  assert.equal(
    extractFacebookBirthdayFromAboutText("Basic info\nAugust 6, 1991\nBirthday\nMale"),
    "06/08/1991",
  );
  assert.equal(
    extractFacebookBirthdayFromAboutText("Basic info\n8 June\nBirthday\n1991\nBirth year"),
    "08/06/1991",
  );
  assert.equal(extractFacebookBirthdayFromAboutText("Basic info\nNovember 7\nBirthday\nFemale"), "");
});

test("buildP0020RowSnapshotAndPatch clears stale mail_checking = ❌ Skipped on active Gmail & non-Mail rows", () => {
  const { patchBody: activeMailPatch } = buildP0020RowSnapshotAndPatch({
    svc: "Gmail",
    svcLower: "gmail",
    match: {
      loggedIn: true,
      resultCode: "inbox_ok",
      matchedNames: ["SID", "HSID"],
      accountEmail: "th.moonlight143@gmail.com",
      note: "Verified Gmail inbox",
      evidence: "mail.google.com inbox active on #0030",
    },
    row: {
      id: "row-gmail-0030",
      service: "Gmail",
      account: "th.moonlight143@gmail.com",
      status: "active",
      mail_checking: "❌ Skipped",
      stealth_snapshot: { status: "logged_in", result_code: "inbox_ok" },
      stealth_cookies: [],
    },
    curSnap: { status: "logged_in", result_code: "inbox_ok" },
    targetStatus: "logged_in",
    rowStatusLower: "active",
    pairs: [],
    vaultEntryCookies: [],
    code: "0030",
    profileId: "prof-0030",
    source: "p0003_live_nav:gmail",
    nowIso: "2026-11-21T11:50:00.000Z",
    needsRowStatusPromotion: false,
    hasStaleChallengeNoteWhenLoggedIn: false,
    existingRowNote: "",
    hasFreshDecryptedPairs: false,
    needsBrowserAssignmentUpdate: false,
  });
  assert.equal(activeMailPatch.mail_checking, "✅ Checked");

  const { patchBody: servicePatch } = buildP0020RowSnapshotAndPatch({
    svc: "Google One",
    svcLower: "google one",
    match: {
      loggedIn: true,
      resultCode: "google_cookies",
      matchedNames: ["SID", "HSID"],
      accountEmail: "th.moonlight143@gmail.com",
      note: "Logged in Google One",
      evidence: "one.google.com active",
    },
    row: {
      id: "row-g1-0030",
      service: "Google One",
      account: "th.moonlight143@gmail.com",
      status: "active",
      mail_checking: "❌ Skipped",
      stealth_snapshot: { status: "logged_in" },
      stealth_cookies: [],
    },
    curSnap: { status: "logged_in" },
    targetStatus: "logged_in",
    rowStatusLower: "active",
    pairs: [],
    vaultEntryCookies: [],
    code: "0030",
    profileId: "prof-0030",
    source: "p0003_live_nav:google",
    nowIso: "2026-11-21T11:50:00.000Z",
    needsRowStatusPromotion: false,
    hasStaleChallengeNoteWhenLoggedIn: false,
    existingRowNote: "",
    hasFreshDecryptedPairs: false,
    needsBrowserAssignmentUpdate: false,
  });
  assert.equal(servicePatch.mail_checking, null);
});
