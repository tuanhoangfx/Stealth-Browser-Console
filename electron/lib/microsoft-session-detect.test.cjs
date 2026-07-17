"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyMicrosoftUrl,
  countMicrosoftAuthCookies,
  detectMicrosoftSession,
  isMicrosoftSessionUrl,
} = require("./microsoft-session-detect.cjs");

test("classifyMicrosoftUrl detects inbox and challenge", () => {
  assert.equal(classifyMicrosoftUrl("https://outlook.live.com/mail/0/"), "inbox");
  assert.equal(classifyMicrosoftUrl("https://login.live.com/"), "challenge");
  assert.equal(classifyMicrosoftUrl("https://example.com"), "other");
});

test("isMicrosoftSessionUrl flags Outlook and Live login", () => {
  assert.equal(isMicrosoftSessionUrl("https://outlook.live.com/mail/0/"), true);
  assert.equal(isMicrosoftSessionUrl("https://login.live.com/?wa=wsignin1.0"), true);
  assert.equal(isMicrosoftSessionUrl("https://mail.google.com"), false);
});

test("detectMicrosoftSession returns logged_in for outlook inbox + cookies", async () => {
  const page = {
    url: () => "https://outlook.live.com/mail/0/",
    isClosed: () => false,
    evaluate: async () => "user@outlook.com",
    context() {
      return context;
    },
  };
  const context = {
    cookies: async () => [
      { name: "MSPAuth", value: "1" },
      { name: "DefaultAnchorMailbox", value: "user@outlook.com" },
    ],
    pages: () => [page],
  };
  const result = await detectMicrosoftSession(context);
  assert.equal(result.status, "logged_in");
  assert.equal(result.result_code, "inbox_ok");
  assert.equal(result.email, "user@outlook.com");
});

test("detectMicrosoftSession returns challenged on login.live without cookies", async () => {
  const page = {
    url: () => "https://login.live.com/",
    isClosed: () => false,
    evaluate: async () => "",
    context() {
      return context;
    },
  };
  const context = {
    cookies: async () => [],
    pages: () => [page],
  };
  const result = await detectMicrosoftSession(context);
  assert.equal(result.status, "challenged");
  assert.equal(result.result_code, "microsoft_challenge");
});

test("countMicrosoftAuthCookies counts known names", () => {
  assert.equal(
    countMicrosoftAuthCookies([{ name: "MSPAuth", value: "1" }, { name: "NID", value: "x" }]),
    1,
  );
});
