"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAgentLoginSnapshot, vaultStatusForAgentLogin } = require("./stealth-account-sync.cjs");
const { classifyGoogleChallenge } = require("./google-session-detect.cjs");

test("agent login snapshot stamps the stored Gmail, not a different session email", () => {
  const snapshot = buildAgentLoginSnapshot({
    detect: {
      status: "logged_in",
      result_code: "inbox_ok",
      email: "other@gmail.com",
      evidence: "mail_url+cookies",
    },
    actualBrowser: "0300",
    profileId: "profile-300",
    email: "stored@gmail.com",
    family: "google",
    checkedAt: "2026-10-21T12:00:00.000Z",
  });

  assert.equal(snapshot.status, "logged_in");
  assert.equal(snapshot.result_code, "inbox_ok");
  assert.equal(snapshot.source, "agent_login:google");
  assert.equal(snapshot.assigned_browser, "0300");
  assert.equal(snapshot.actual_browser, "0300");
  assert.equal(snapshot.mismatch, false);
  assert.equal(snapshot.note, "vault:stored@gmail.com session:other@gmail.com");
  assert.equal(snapshot.checked_at, "2026-10-21T12:00:00.000Z");
});

test("agent login snapshot keeps a challenge result on the stored mailbox", () => {
  const snapshot = buildAgentLoginSnapshot({
    detect: {
      status: "challenged",
      result_code: "2fa_pending",
      email: "",
      evidence: "challenge_url+stale_auth_cookies",
    },
    actualBrowser: "0400",
    profileId: "profile-400",
    email: "range@gmail.com",
    family: "google",
  });

  assert.equal(snapshot.status, "challenged");
  assert.equal(snapshot.result_code, "2fa_pending");
  assert.equal(snapshot.evidence, "challenge_url+stale_auth_cookies");
  assert.equal(snapshot.note, "vault:range@gmail.com");
});

test("agent login maps a proven Google page to mail Status", () => {
  assert.equal(vaultStatusForAgentLogin({ status: "logged_in", result_code: "inbox_ok" }), "active");
  assert.equal(vaultStatusForAgentLogin({ status: "challenged", result_code: "phone_challenge" }), "check_phone");
  assert.equal(vaultStatusForAgentLogin({ status: "challenged", result_code: "mail_challenge" }), "check_mail");
  assert.equal(vaultStatusForAgentLogin({ status: "challenged", result_code: "password_rejected" }), "incorrect_info");
  assert.equal(vaultStatusForAgentLogin({ status: "challenged", result_code: "account_disabled" }), "disable");
  assert.equal(vaultStatusForAgentLogin({ status: "challenged", result_code: "account_appeal" }), "appeal");
  assert.equal(vaultStatusForAgentLogin({ status: "challenged", result_code: "2fa_pending" }), null);
  assert.equal(vaultStatusForAgentLogin({ status: "challenged", result_code: "google_challenge" }), null);
});

test("google challenge text picks the mail status bucket", () => {
  assert.equal(classifyGoogleChallenge("https://accounts.google.com/signin/challenge/pwd", "Wrong password"), "password_rejected");
  assert.equal(classifyGoogleChallenge("https://accounts.google.com/signin/challenge/dp", "Enter a phone number"), "phone_challenge");
  assert.equal(classifyGoogleChallenge("https://accounts.google.com/signin/challenge/kpe", "Confirm your recovery email"), "mail_challenge");
  assert.equal(classifyGoogleChallenge("https://accounts.google.com/signin/challenge/totp", ""), "2fa_pending");
  assert.equal(classifyGoogleChallenge("https://accounts.google.com/signin/rejected", "This account has been disabled"), "account_disabled");
});

test("profile open, navigation, and close do not write Stealth status", () => {
  const sessionManager = fs.readFileSync(path.join(__dirname, "../engine/session-manager.cjs"), "utf8");
  const profileOps = fs.readFileSync(path.join(__dirname, "../services/profile-ops.cjs"), "utf8");
  const openUrl = fs.readFileSync(path.join(__dirname, "../automation/open-url.cjs"), "utf8");

  assert.equal(sessionManager.includes("captureAndQueueStealthSnapshot"), false);
  assert.equal(sessionManager.includes("google_nav"), false);
  assert.equal(sessionManager.includes('source: "profile_open"'), false);
  assert.equal(sessionManager.includes('source: "profile_close"'), false);
  assert.equal(profileOps.includes("forceStealthCapture"), false);
  assert.equal(openUrl.includes("stampStoredMailLoginSnapshot"), true);
  assert.equal(openUrl.includes("detectPreferredMailEmail"), false);
});
