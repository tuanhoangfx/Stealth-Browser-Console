const test = require("node:test");
const assert = require("node:assert/strict");
const { isGoogleSignInUrl, assertGoogleSession } = require("./google-session-guard.cjs");

test("isGoogleSignInUrl detects accounts sign-in", () => {
  assert.equal(
    isGoogleSignInUrl("https://accounts.google.com/v3/signin/identifier?continue=https://one.google.com"),
    true,
  );
  assert.equal(isGoogleSignInUrl("https://one.google.com/u/0/ai/activity"), false);
});

test("assertGoogleSession throws on sign-in page", async () => {
  const page = { url: () => "https://accounts.google.com/v3/signin/identifier" };
  const logs = [];
  const logger = { push: (_level, message) => logs.push(message) };
  await assert.rejects(
    () => assertGoogleSession(page, logger, { targetUrl: "https://one.google.com/u/0/ai/activity" }),
    /Google sign-in required/,
  );
});
