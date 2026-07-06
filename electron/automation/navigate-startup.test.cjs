const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isPlaceholderTabUrl,
  selectLaunchPlaceholderPages,
} = require("./navigate-startup.cjs");

test("isPlaceholderTabUrl detects blank and chrome new-tab URLs", () => {
  assert.equal(isPlaceholderTabUrl(""), true);
  assert.equal(isPlaceholderTabUrl("about:blank"), true);
  assert.equal(isPlaceholderTabUrl("chrome://newtab/"), true);
  assert.equal(isPlaceholderTabUrl("chrome://new-tab-page/"), true);
  assert.equal(isPlaceholderTabUrl("https://example.com/"), false);
});

test("selectLaunchPlaceholderPages keeps user tabs opened during startup nav", () => {
  const primary = { url: () => "https://myaccount.google.com/", isClosed: () => false };
  const launchBlank = { url: () => "chrome://newtab/", isClosed: () => false };
  const userTab = { url: () => "chrome://newtab/", isClosed: () => false };
  const launchPages = new Set([primary, launchBlank]);

  const toClose = selectLaunchPlaceholderPages(
    [primary, launchBlank, userTab],
    primary,
    launchPages,
  );

  assert.deepEqual(toClose, [launchBlank]);
});
