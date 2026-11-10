const test = require("node:test");
const assert = require("node:assert/strict");
const { detectGoogleCaptcha, assertNotGoogleCaptcha, GoogleCaptchaStopError } = require("./script-steps.cjs");

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

function captchaPage({ url, frames = [], imageVisible = false, onClick }) {
  let current = url;
  return {
    url: () => current,
    setUrl: (next) => {
      current = next;
    },
    locator: (selector) => ({
      first: () => ({
        isVisible: async () => imageVisible && /bframe/i.test(String(selector)),
      }),
      count: async () => 0,
    }),
    frames: () => frames,
  };
}

test("assertNotGoogleCaptcha clicks the checkbox and continues when the challenge clears", async () => {
  let clicks = 0;
  const page = captchaPage({
    url: "https://accounts.google.com/v3/signin/challenge/recaptcha?TL=x",
    frames: [
      {
        url: () => "https://www.google.com/recaptcha/api2/anchor?k=1",
        locator: () => ({
          count: async () => 1,
          click: async () => {
            clicks += 1;
            page.setUrl("https://mail.google.com/mail/u/0/");
          },
        }),
      },
    ],
  });
  const logs = [];
  await assertNotGoogleCaptcha(page, { push: (_level, message) => logs.push(message) }, { captchaClearWaitMs: 800 });
  assert.equal(clicks, 1);
  assert.match(logs.join("\n"), /checkbox accepted/i);
});

test("assertNotGoogleCaptcha stops when the checkbox opens an image grid", async () => {
  const page = captchaPage({
    url: "https://accounts.google.com/v3/signin/challenge/recaptcha?TL=x",
    imageVisible: true,
    frames: [
      {
        url: () => "https://www.google.com/recaptcha/api2/anchor?k=1",
        locator: () => ({
          count: async () => 1,
          click: async () => {},
        }),
      },
    ],
  });
  await assert.rejects(
    () => assertNotGoogleCaptcha(page, { push: () => {} }, { captchaClearWaitMs: 800 }),
    (error) => error.code === "GOOGLE_CAPTCHA",
  );
});
