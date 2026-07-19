const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyUrl,
  countGoogleAuthCookies,
  detectGoogleSession,
  GOOGLE_AUTH_COOKIE_NAMES,
  isGoogleSessionUrl,
} = require("./google-session-detect.cjs");

test("classifyUrl detects inbox, challenge, and account pages", () => {
  assert.equal(classifyUrl("https://mail.google.com/mail/u/0/#inbox"), "inbox");
  assert.equal(
    classifyUrl("https://accounts.google.com/v3/signin/identifier?continue=https://mail.google.com"),
    "challenge",
  );
  assert.equal(classifyUrl("https://myaccount.google.com/u/0/"), "account");
  assert.equal(classifyUrl("https://example.com"), "other");
});

test("isGoogleSessionUrl flags Gmail and Google auth pages", () => {
  assert.equal(isGoogleSessionUrl("https://mail.google.com/mail/u/0/#inbox"), true);
  assert.equal(isGoogleSessionUrl("https://accounts.google.com/v3/signin/identifier"), true);
  assert.equal(isGoogleSessionUrl("https://myaccount.google.com/u/0/"), true);
  assert.equal(isGoogleSessionUrl("https://example.com"), false);
});

test("countGoogleAuthCookies counts known Google auth cookies only", () => {
  const cookies = [
    { name: "SID", value: "1" },
    { name: "HSID", value: "2" },
    { name: "NID", value: "3" },
    { name: "SSID", value: "4" },
  ];
  assert.equal(countGoogleAuthCookies(cookies), 3);
  assert.equal(GOOGLE_AUTH_COOKIE_NAMES.has("SID"), true);
});

test("detectGoogleSession returns logged_in for inbox with auth cookies", async () => {
  const page = {
    url: () => "https://mail.google.com/mail/u/0/#inbox",
    isClosed: () => false,
    evaluate: async () => "user@gmail.com",
    context() {
      return context;
    },
  };
  const context = {
    cookies: async () => [
      { name: "SID", value: "1" },
      { name: "HSID", value: "2" },
      { name: "SSID", value: "3" },
    ],
    pages: () => [page],
  };

  const result = await detectGoogleSession(context);
  assert.equal(result.status, "logged_in");
  assert.equal(result.result_code, "inbox_ok");
  assert.equal(result.email, "user@gmail.com");
});

test("detectGoogleSession returns challenged on sign-in URL", async () => {
  const page = {
    url: () => "https://accounts.google.com/v3/signin/challenge/totp",
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

  const result = await detectGoogleSession(context);
  assert.equal(result.status, "challenged");
  assert.equal(result.result_code, "2fa_pending");
});

test("detectGoogleSession keeps challenged when only challenge tab has stale auth cookies", async () => {
  const page = {
    url: () => "https://accounts.google.com/v3/signin/challenge/totp",
    isClosed: () => false,
    evaluate: async () => "user@gmail.com",
    context() {
      return context;
    },
  };
  const context = {
    cookies: async () => [
      { name: "SID", value: "1" },
      { name: "HSID", value: "2" },
      { name: "SSID", value: "3" },
    ],
    pages: () => [page],
  };

  const result = await detectGoogleSession(context);
  assert.equal(result.status, "challenged");
  assert.equal(result.result_code, "2fa_pending");
  assert.equal(result.evidence, "challenge_url+stale_auth_cookies");
});

test("detectGoogleSession prefers inbox over challenge when both tabs exist", async () => {
  const challenge = {
    url: () => "https://accounts.google.com/v3/signin/identifier",
    isClosed: () => false,
    evaluate: async () => "",
    context() {
      return context;
    },
  };
  const inbox = {
    url: () => "https://mail.google.com/mail/u/0/#inbox",
    isClosed: () => false,
    evaluate: async () => "user@gmail.com",
    context() {
      return context;
    },
  };
  const context = {
    cookies: async () => [
      { name: "SID", value: "1" },
      { name: "HSID", value: "2" },
      { name: "SSID", value: "3" },
    ],
    pages: () => [challenge, inbox],
  };

  const result = await detectGoogleSession(context);
  assert.equal(result.status, "logged_in");
  assert.equal(result.result_code, "inbox_ok");
  assert.equal(result.email, "user@gmail.com");
});

test("detectGoogleSession does not mark partial cookies as Challenge", async () => {
  const page = {
    url: () => "https://example.com/",
    isClosed: () => false,
    evaluate: async () => "",
    context() {
      return context;
    },
  };
  const context = {
    cookies: async () => [{ name: "SID", value: "1" }],
    pages: () => [page],
  };

  const result = await detectGoogleSession(context);
  assert.equal(result.status, "not_logged_in");
  assert.equal(result.result_code, "partial_auth_cookies");
});
