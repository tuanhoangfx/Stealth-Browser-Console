const fs = require("node:fs");
const path = require("node:path");

const { readJson, writeJson } = require("./profile-chrome-json.cjs");

/** Chromium Local State — prefer search over single-label intranet URL guesses. */
const INTRANET_REDIRECT_BEHAVIOR = 1; // DisableInterceptionChecksDisableInfobar

function ensureProfileChromeOmniboxSearchPrefs(userDataDir) {
  if (!userDataDir) return { ok: false };
  const base = path.resolve(String(userDataDir));
  let changed = 0;

  const localStateFile = path.join(base, "Local State");
  const localState = readJson(localStateFile) || {};
  if (localState.dns_interception_checks_enabled !== false) {
    localState.dns_interception_checks_enabled = false;
    changed += 1;
  }
  localState.browser = localState.browser || {};
  if (Number(localState.browser.intranet_redirect_behavior) !== INTRANET_REDIRECT_BEHAVIOR) {
    localState.browser.intranet_redirect_behavior = INTRANET_REDIRECT_BEHAVIOR;
    changed += 1;
  }
  if (changed) writeJson(localStateFile, localState);

  const prefsFile = path.join(base, "Default", "Preferences");
  const prefs = readJson(prefsFile) || {};
  let prefsChanged = false;
  if (prefs.default_search_provider_enabled !== true) {
    prefs.default_search_provider_enabled = true;
    prefsChanged = true;
  }
  const template = prefs.default_search_provider_data?.template_url_data;
  if (!template?.url?.includes("{searchTerms}")) {
    prefs.default_search_provider_data = {
      template_url_data: {
        short_name: "Google",
        keyword: "google.com",
        url: "https://www.google.com/search?q={searchTerms}",
        favicon_url: "https://www.google.com/favicon.ico",
        safe_for_autoreplace: true,
        input_encodings: ["UTF-8"],
      },
    };
    prefsChanged = true;
  }
  if (prefsChanged) {
    fs.mkdirSync(path.dirname(prefsFile), { recursive: true });
    writeJson(prefsFile, prefs);
    changed += 1;
  }

  const policyDir = path.join(base, "policies", "managed");
  const policyFile = path.join(policyDir, "stealth-omnibox-search.json");
  const policy = {
    DNSInterceptionChecksEnabled: false,
    IntranetRedirectBehavior: INTRANET_REDIRECT_BEHAVIOR,
    DefaultSearchProviderEnabled: true,
    DefaultSearchProviderName: "Google",
    DefaultSearchProviderKeyword: "google.com",
    DefaultSearchProviderSearchURL: "https://www.google.com/search?q={searchTerms}",
  };
  const policyJson = JSON.stringify(policy);
  if (!fs.existsSync(policyFile) || fs.readFileSync(policyFile, "utf8") !== policyJson) {
    fs.mkdirSync(policyDir, { recursive: true });
    fs.writeFileSync(policyFile, policyJson, "utf8");
    changed += 1;
  }

  return { ok: changed > 0, changed };
}

module.exports = {
  INTRANET_REDIRECT_BEHAVIOR,
  ensureProfileChromeOmniboxSearchPrefs,
};
