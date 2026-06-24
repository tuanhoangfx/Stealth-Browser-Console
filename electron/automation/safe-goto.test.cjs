const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isAbortNavigationError,
  navigationLikelySucceeded,
  safePageGoto,
} = require("./safe-goto.cjs");

test("isAbortNavigationError detects Playwright net::ERR_ABORTED", () => {
  assert.equal(isAbortNavigationError(new Error("page.goto: net::ERR_ABORTED at https://example.com/")), true);
  assert.equal(isAbortNavigationError(new Error("Navigation failed: timeout")), false);
});

test("navigationLikelySucceeded accepts Google redirect hosts", () => {
  const page = { url: () => "https://accounts.google.com/signin" };
  assert.equal(
    navigationLikelySucceeded(page, "https://one.google.com/u/0/ai/activity"),
    true
  );
  assert.equal(navigationLikelySucceeded(page, "https://example.com/path"), false);
});

test("safePageGoto retries aborted navigations", async () => {
  let attempts = 0;
  const page = {
    isClosed: () => false,
    url: () => "about:blank",
    waitForTimeout: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForURL: async () => {
      throw new Error("timeout");
    },
    goto: async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("page.goto: net::ERR_ABORTED at https://example.com/");
      }
    },
  };

  await safePageGoto(page, "https://example.com/", { timeout: 1000 });
  assert.equal(attempts, 2);
});

test("safePageGoto treats redirect landing as success after abort", async () => {
  let attempts = 0;
  const page = {
    isClosed: () => false,
    url: () =>
      attempts > 0
        ? "https://accounts.google.com/v3/signin/identifier"
        : "about:blank",
    waitForTimeout: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForURL: async () => undefined,
    goto: async () => {
      attempts += 1;
      throw new Error("page.goto: net::ERR_ABORTED at https://one.google.com/u/0/ai/activity");
    },
  };

  await safePageGoto(page, "https://one.google.com/u/0/ai/activity", { timeout: 1000 });
  assert.equal(attempts, 1);
});
