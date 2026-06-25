const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseOmniboxSingleLabelNav,
  buildSearchUrlForTerm,
} = require("./omnibox-search-guard.cjs");
const { ensureProfileChromeOmniboxSearchPrefs } = require("./profile-chrome-omnibox.cjs");

describe("omnibox-search-guard", () => {
  it("detects single-label http navigations from omnibox", () => {
    assert.equal(parseOmniboxSingleLabelNav("http://2fa/"), "2fa");
    assert.equal(parseOmniboxSingleLabelNav("http://2fa"), "2fa");
    assert.equal(parseOmniboxSingleLabelNav("https://demo/"), "demo");
  });

  it("ignores real domains, paths, localhost, and IPs", () => {
    assert.equal(parseOmniboxSingleLabelNav("https://google.com/"), null);
    assert.equal(parseOmniboxSingleLabelNav("http://check/path"), null);
    assert.equal(parseOmniboxSingleLabelNav("http://localhost/"), null);
    assert.equal(parseOmniboxSingleLabelNav("http://127.0.0.1/"), null);
    assert.equal(parseOmniboxSingleLabelNav("http://2fa/search?q=1"), null);
  });

  it("builds Google search URL for terms", () => {
    assert.equal(buildSearchUrlForTerm("2fa"), "https://www.google.com/search?q=2fa");
  });
});

describe("profile-chrome-omnibox", () => {
  it("seeds Local State prefs before profile launch", () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-omnibox-"));
    const result = ensureProfileChromeOmniboxSearchPrefs(userDataDir);
    assert.equal(result.ok, true);
    const localState = JSON.parse(fs.readFileSync(path.join(userDataDir, "Local State"), "utf8"));
    assert.equal(localState.dns_interception_checks_enabled, false);
    assert.equal(localState.browser.intranet_redirect_behavior, 1);
    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    assert.match(prefs.default_search_provider_data.template_url_data.url, /searchTerms/);
    const policy = JSON.parse(
      fs.readFileSync(path.join(userDataDir, "policies", "managed", "stealth-omnibox-search.json"), "utf8"),
    );
    assert.equal(policy.DefaultSearchProviderEnabled, true);
  });
});
