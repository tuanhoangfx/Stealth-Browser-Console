const test = require("node:test");
const assert = require("node:assert/strict");
const { detectGoogleCaptcha, GoogleCaptchaStopError } = require("./script-steps.cjs");

test("GoogleCaptchaStopError carries close + vault codes", () => {
  const err = new GoogleCaptchaStopError("https://accounts.google.com/v3/signin/challenge/recaptcha");
  assert.equal(err.code, "GOOGLE_CAPTCHA");
  assert.equal(err.closeProfile, true);
  assert.equal(err.vaultStatus, "error");
  assert.match(err.message, /reCAPTCHA/i);
});

test("detectGoogleCaptcha matches recaptcha URL via mock page", async () => {
  const page = {
    url: () => "https://accounts.google.com/v3/signin/challenge/recaptcha?TL=x",
    locator: () => ({
      first: () => ({ isVisible: async () => false }),
      count: async () => 0,
    }),
  };
  assert.equal(await detectGoogleCaptcha(page), true);
});

test("detectGoogleCaptcha ignores password challenge URL", async () => {
  const page = {
    url: () => "https://accounts.google.com/v3/signin/challenge/pwd?TL=x",
    locator: () => ({
      first: () => ({ isVisible: async () => false }),
      count: async () => 0,
    }),
  };
  assert.equal(await detectGoogleCaptcha(page), false);
});
