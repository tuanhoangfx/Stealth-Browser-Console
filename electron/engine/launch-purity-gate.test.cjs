const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { markProfileChromeCleanExit } = require("../lib/profile-chrome-session.cjs");
const { ensureProfileChromeOmniboxSearchPrefs } = require("../lib/profile-chrome-omnibox.cjs");

test("Launch Purity & Latency Gate (< 50ms)", async (t) => {
  await t.test("session-manager.cjs and cloak-browser-engine.cjs hot-path are free of automatic Cookie Guard / Vault sync hooks", () => {
    const src = fs.readFileSync(path.join(__dirname, "session-manager.cjs"), "utf8");
    const engineSrc = fs.readFileSync(path.join(__dirname, "cloak-browser-engine.cjs"), "utf8");
    const forbiddenHooks = [
      "autoHealWipedProfileCookies",
      "hydrateContextFromEcosystemVaults",
      "hydrateProfileCookiesFromP0020Vault",
      "installPlaywrightContextCookieGuard",
      "snapshotProfileCookiesIfHealthy",
      "syncLiveCdpCookiesToVaultIfChanged",
      "syncLiveContextCookiesToVaultIfChanged",
      "scheduleLiveCookieAndP0020Sync",
    ];
    for (const hook of forbiddenHooks) {
      assert.equal(
        src.includes(hook),
        false,
        `session-manager.cjs must not invoke ${hook} in launch/navigation/close lifecycle`,
      );
      assert.equal(
        engineSrc.includes(hook),
        false,
        `cloak-browser-engine.cjs must not invoke ${hook} in launch/openProfile lifecycle`,
      );
    }
    for (const badGpuFlag of ["--disable-gpu", "--disable-gpu-compositing"]) {
      assert.equal(
        engineSrc.includes(badGpuFlag),
        false,
        `cloak-browser-engine.cjs must not pass ${badGpuFlag} (cripples CloakBrowser WebGL/WebGPU hardware fingerprint spoofing)`,
      );
    }
  });

  await t.test("pre-launch preference preparation completes in < 50ms and keeps startup_urls unpolluted", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-launch-gate-"));
    try {
      const defaultDir = path.join(tmpDir, "Default");
      fs.mkdirSync(defaultDir, { recursive: true });
      fs.writeFileSync(
        path.join(defaultDir, "Preferences"),
        JSON.stringify({
          profile: { exit_type: "Crashed" },
          session: { restore_on_startup: 4, startup_urls: ["https://mail.google.com/"] },
        }),
        "utf8",
      );

      const t0 = performance.now();
      markProfileChromeCleanExit(tmpDir);
      ensureProfileChromeOmniboxSearchPrefs(tmpDir);
      const elapsedMs = performance.now() - t0;

      assert.ok(elapsedMs < 50, `Expected pre-launch prep < 50ms, got ${elapsedMs.toFixed(2)}ms`);

      const prefs = JSON.parse(fs.readFileSync(path.join(defaultDir, "Preferences"), "utf8"));
      assert.equal(prefs.profile.exit_type, "Normal");
      assert.equal(prefs.session?.restore_on_startup, undefined);
      assert.equal(prefs.session?.startup_urls, undefined);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("Zero External SQLite Write & Post-Close Backup Invariant: stealth-headless-cdp.mjs and stealth-multiplatform-sync.cjs never write to Default/Network/Cookies during normal launch/sync", () => {
    const syncSrc = fs.readFileSync(path.join(__dirname, "../lib/stealth-multiplatform-sync.cjs"), "utf8");
    const headlessCdpPath = path.resolve(__dirname, "../../../../scripts/lib/stealth-headless-cdp.mjs");
    if (fs.existsSync(headlessCdpPath)) {
      const headlessSrc = fs.readFileSync(headlessCdpPath, "utf8");
      // connectStealthHeadless must use native Chromium launchPersistentContext directly on userDataDir
      assert.equal(
        headlessSrc.includes("chromium.launchPersistentContext(srcUserDataDir"),
        true,
        "connectStealthHeadless must use native chromium.launchPersistentContext(srcUserDataDir) instead of manual SQLite cookie writes",
      );
      const fnStart = headlessSrc.indexOf("export async function connectStealthHeadless");
      const fnBody = fnStart >= 0 ? headlessSrc.slice(fnStart) : "";
      assert.equal(
        fnBody.includes("writeDiskCookiesForProfile("),
        false,
        "connectStealthHeadless must never call writeDiskCookiesForProfile on a profile's SQLite Cookies DB",
      );
    }

    // stealth-multiplatform-sync.cjs must open SQLite Cookies with readOnly: true and schedule snapshotProfileCookiesIfHealthy on close
    assert.equal(
      syncSrc.includes("readOnly: true"),
      true,
      "stealth-multiplatform-sync.cjs must open SQLite Cookies in readOnly: true mode",
    );
    assert.equal(
      syncSrc.includes("snapshotProfileCookiesIfHealthy(userDataDir)"),
      true,
      "stealth-multiplatform-sync.cjs must trigger snapshotProfileCookiesIfHealthy(userDataDir) after profile close",
    );
  });

  await t.test("SQLite Schema Parity Gate & Strict Zero-Write on Default/Network/Cookies", () => {
    const chromeSessionSrc = fs.readFileSync(path.join(__dirname, "../lib/profile-chrome-session.cjs"), "utf8");
    const cookieGuardSrc = fs.readFileSync(path.join(__dirname, "../lib/profile-cookie-guard.cjs"), "utf8");

    assert.equal(
      chromeSessionSrc.includes("sanitizeProfileSqliteCookiesInPlace("),
      false,
      "profile-chrome-session.cjs must never call sanitizeProfileSqliteCookiesInPlace on Default/Network/Cookies during pre-launch/close",
    );

    const snapStart = cookieGuardSrc.indexOf("function snapshotProfileCookiesIfHealthy(");
    const snapEnd = cookieGuardSrc.indexOf("function readProfileCookieSummary(", snapStart);
    const snapBody = snapStart >= 0 && snapEnd > snapStart ? cookieGuardSrc.slice(snapStart, snapEnd) : "";
    assert.equal(
      snapBody.includes("sanitizeProfileSqliteCookiesInPlace("),
      false,
      "snapshotProfileCookiesIfHealthy must never mutate Default/Network/Cookies in place",
    );

    assert.equal(
      cookieGuardSrc.includes("dotSidSplitOlderThanLsid"),
      false,
      "profile-cookie-guard.cjs must never prune SID/LSID or __Secure-1PSIDTS by timestamp diff",
    );

    assert.equal(
      cookieGuardSrc.includes("has_cross_site_ancestor INTEGER NOT NULL DEFAULT 1"),
      true,
      "profile-cookie-guard.cjs must normalize unpartitioned cookies to Chromium 146 has_cross_site_ancestor = 1",
    );
    assert.equal(
      cookieGuardSrc.includes("VALUES (?, ?, '', ?, '', ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, 2, 443, ?, 1, 1)"),
      true,
      "injectVaultCookiesIntoClosedSqlite must insert with source_scheme=2, source_port=443, source_type=1, has_cross_site_ancestor=1",
    );

    const syncSrc = fs.readFileSync(path.join(__dirname, "../lib/stealth-multiplatform-sync.cjs"), "utf8");
    assert.equal(
      syncSrc.includes("opts?.resolveIdentity !== true"),
      false,
      "verifyGoogleCookiesLiveViaHttp must never bypass offline_proxy_safe when resolveIdentity: true is passed with default Node.js fetch",
    );

    const scriptStepsSrc = fs.readFileSync(path.join(__dirname, "../automation/script-steps.cjs"), "utf8");
    assert.equal(
      scriptStepsSrc.includes("async function completePostGoogleAuthChallenges"),
      true,
      "script-steps.cjs must include completePostGoogleAuthChallenges for post-TOTP recovery email and backup code fallback",
    );
    const vaultBridgeSrc = fs.readFileSync(path.join(__dirname, "../lib/twofa-vault-bridge.cjs"), "utf8");
    assert.equal(
      vaultBridgeSrc.includes("backup_code") && vaultBridgeSrc.includes("backupCode: data.backup_code"),
      true,
      "twofa-vault-bridge.cjs must load backup_code into mailCredentials.backupCode",
    );
  });
});
