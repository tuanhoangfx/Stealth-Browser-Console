"use strict";

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  COOKIES_REL_PATH,
  COOKIES_BAK_REL_PATH,
  LOCAL_STATE_REL_PATH,
  LOCAL_STORAGE_REL_PATH,
  LOCAL_STORAGE_BAK_REL_PATH,
  openGuardSqlite,
  protectDpapiKey,
  unprotectDpapiKey,
  inspectProfileSqliteCookiesSummary,
  snapshotProfileCookiesIfHealthy,
  autoHealWipedProfileCookies,
  installPlaywrightContextCookieGuard,
  getProfileCookieGuardStatus,
  restoreProfileCookiesManual,
  collectVaultCookiesForProfileCode,
  reconcileSplitGoogleAuthCookies,
  sanitizeProfileSqliteCookiesInPlace,
} = require("./profile-cookie-guard.cjs");
const {
  matchServiceCookiePairs,
  shouldPreserveChallengedState,
  verifyTikTokCookiesLiveViaHttp,
  verifyGoogleCookiesLiveViaHttp,
  verifyTwitterCookiesLiveViaHttp,
  verifyInstagramCookiesLiveViaHttp,
  verifyMicrosoftCookiesLiveViaHttp,
  isAuthenticatedGoogleAppUrl,
  classifyGoogleLiveCdpTargets,
  autoSkipGoogleSpeedbumpTargets,
} = require("./stealth-multiplatform-sync.cjs");

const tmpDirs = [];

function makeTempProfileDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-ck-guard-test-"));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, "Default", "Network"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, LOCAL_STATE_REL_PATH),
    JSON.stringify({ os_crypt: { encrypted_key: "RFBAPI_TEST_ENCRYPTED_KEY_1234567890" } }),
    "utf8",
  );
  return dir;
}

function seedCookiesSqlite(dir, rows = []) {
  const ckPath = path.join(dir, COOKIES_REL_PATH);
  fs.mkdirSync(path.dirname(ckPath), { recursive: true });
  if (fs.existsSync(ckPath)) fs.unlinkSync(ckPath);
  const db = openGuardSqlite(ckPath, { readOnly: false });
  db.exec(`
    CREATE TABLE cookies (
      host_key TEXT NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL
    );
  `);
  const stmt = db.prepare("INSERT INTO cookies (host_key, name, value) VALUES (?, ?, ?)");
  for (const r of rows) {
    stmt.run(r.host_key, r.name, r.value || "1");
  }
  db.close();
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("profile-cookie-guard", () => {
  it("snapshots healthy cookies and auto-heals when Cookies DB is wiped to zero", () => {
    const dir = makeTempProfileDir();
    seedCookiesSqlite(dir, [
      { host_key: ".google.com", name: "SID" },
      { host_key: ".google.com", name: "__Secure-1PSID" },
      { host_key: ".live.com", name: "RPSSecAuth" },
      { host_key: ".facebook.com", name: "c_user" },
    ]);

    const snap = snapshotProfileCookiesIfHealthy(dir);
    assert.equal(snap.snapshotted, true);
    assert.equal(snap.current.totalRows, 4);
    assert.equal(snap.current.authDomainsCount, 3);
    assert.equal(fs.existsSync(path.join(dir, COOKIES_BAK_REL_PATH)), true);

    // Simulate accidental global clearCookies wipe (0 rows)
    seedCookiesSqlite(dir, []);
    const afterWipe = inspectProfileSqliteCookiesSummary(dir);
    assert.equal(afterWipe.totalRows, 0);

    // Auto-heal should restore the 4 cookies from Cookies.last-good.bak
    const healed = autoHealWipedProfileCookies(dir);
    assert.equal(healed.healed, true);
    assert.equal(healed.cookiesRestored, true);

    const afterHeal = inspectProfileSqliteCookiesSummary(dir);
    assert.equal(afterHeal.totalRows, 4);
    assert.equal(afterHeal.hasGoogleAuth, true);
    assert.equal(afterHeal.hasOutlookAuth, true);
    assert.equal(afterHeal.hasFacebookAuth, true);
  });

  it("refuses to overwrite backup when current Cookies DB lost auth domains", () => {
    const dir = makeTempProfileDir();
    seedCookiesSqlite(dir, [
      { host_key: ".google.com", name: "SID" },
      { host_key: ".live.com", name: "RPSSecAuth" },
      { host_key: ".facebook.com", name: "c_user" },
      { host_key: ".tiktok.com", name: "sessionid" },
    ]);
    assert.equal(snapshotProfileCookiesIfHealthy(dir).snapshotted, true);

    // Degrade to 1 non-auth cookie
    seedCookiesSqlite(dir, [{ host_key: ".example.com", name: "pref" }]);
    const degradedSnap = snapshotProfileCookiesIfHealthy(dir);
    assert.equal(degradedSnap.snapshotted, false);
    assert.equal(degradedSnap.reason, "lost_core_auth_domain_compared_to_backup");
  });

  it("blocks un-scoped context.clearCookies() while allowing domain-scoped clearCookies", async () => {
    const calls = [];
    const mockContext = {
      clearCookies: async (opts) => {
        calls.push(opts);
      },
    };
    installPlaywrightContextCookieGuard(mockContext, { profileCode: "0164" });

    // 1. Un-scoped call must be blocked
    await mockContext.clearCookies();
    assert.equal(calls.length, 0);

    // 2. Domain-scoped call must be allowed
    await mockContext.clearCookies({ domain: /(^|\.)facebook\.com$/i });
    assert.equal(calls.length, 1);

    // 3. Explicit allowGlobalWipe must be allowed
    await mockContext.clearCookies({ allowGlobalWipe: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[1], undefined);

    // 4. Surgical CDP Network.deleteCookies when context.cookies + context.newCDPSession are present
    const cdpDeletes = [];
    const origWipeCalls = [];
    const cdpContext = {
      clearCookies: async (opts) => {
        origWipeCalls.push(opts);
      },
      cookies: async () => [
        { name: "c_user", value: "10001", domain: ".facebook.com", path: "/" },
        { name: "SID", value: "g.a000GoogleSid", domain: ".google.com", path: "/" },
      ],
      pages: () => [{ isClosed: () => false }],
      newCDPSession: async () => ({
        send: async (method, params) => {
          if (method === "Network.deleteCookies") cdpDeletes.push(params);
        },
        detach: async () => {},
      }),
    };
    installPlaywrightContextCookieGuard(cdpContext, { profileCode: "0009" });
    await cdpContext.clearCookies({ domain: /(^|\.)facebook\.com$/i });
    assert.equal(origWipeCalls.length, 0);
    assert.equal(cdpDeletes.length, 1);
    assert.equal(cdpDeletes[0].name, "c_user");
    assert.equal(cdpDeletes[0].domain, ".facebook.com");
  });

  it("reports getProfileCookieGuardStatus and manually restores backup + live context cookies", async () => {
    const dir = makeTempProfileDir();
    seedCookiesSqlite(dir, [
      { host_key: ".google.com", name: "SID" },
      { host_key: ".facebook.com", name: "c_user" },
      { host_key: ".live.com", name: "RPSSecAuth" },
    ]);
    snapshotProfileCookiesIfHealthy(dir);

    const statusBefore = getProfileCookieGuardStatus(dir, { profileCode: "9876" });
    assert.equal(statusBefore.current.totalRows, 3);
    assert.equal(statusBefore.backup.exists, true);
    assert.equal(statusBefore.backup.totalRows, 3);

    // Wipe current DB to 0 rows
    seedCookiesSqlite(dir, []);
    assert.equal(getProfileCookieGuardStatus(dir, { profileCode: "9876" }).current.totalRows, 0);

    // Manual restore should restore all 3 cookies from backup
    const restored = await restoreProfileCookiesManual(dir, {
      profileCode: "9876",
      context: null,
      isRunning: false,
    });
    assert.equal(restored.ok, true);
    assert.equal(restored.restoredFromBak, true);
    assert.equal(restored.status.current.totalRows, 3);
    assert.equal(restored.status.current.hasGoogleAuth, true);
    assert.equal(restored.status.current.hasFacebookAuth, true);
    assert.equal(restored.status.current.hasOutlookAuth, true);
  });

  it("matches multi-platform cookie pairs and preserves challenged state when signed out", () => {
    const pairs = [
      { domain: ".google.com", name: "SID" },
      { domain: ".google.com", name: "SAPISID" },
      { domain: ".facebook.com", name: "c_user" },
      { domain: ".facebook.com", name: "xs" },
      { domain: ".tiktok.com", name: "sessionid" },
      { domain: ".claude.ai", name: "sessionKey" },
      { domain: ".chatgpt.com", name: "__Secure-next-auth.session-token" },
    ];

    assert.equal(matchServiceCookiePairs("Gmail", pairs).loggedIn, true);
    assert.equal(matchServiceCookiePairs("Google One", pairs).loggedIn, true);
    assert.equal(matchServiceCookiePairs("Facebook", pairs).loggedIn, true);
    assert.equal(matchServiceCookiePairs("TikTok", pairs).loggedIn, true);
    assert.equal(matchServiceCookiePairs("Claude", pairs).loggedIn, true);
    assert.equal(matchServiceCookiePairs("ChatGPT", pairs).loggedIn, true);
    assert.equal(matchServiceCookiePairs("Outlook", pairs).loggedIn, false);
    assert.equal(matchServiceCookiePairs("Proxy", pairs).supported, false);

    // Facebook requires BOTH c_user and xs
    assert.equal(
      matchServiceCookiePairs("Facebook", [{ domain: ".facebook.com", name: "c_user" }]).loggedIn,
      false,
    );

    // Challenged state preservation when signed out
    assert.equal(
      shouldPreserveChallengedState({ status: "active", stealth_snapshot: { status: "challenged" } }, false),
      true,
    );
    assert.equal(
      shouldPreserveChallengedState({ status: "appeal", stealth_snapshot: { status: "not_logged_in" } }, false),
      true,
    );
    // If logged in, challenged state is cleared
    assert.equal(
      shouldPreserveChallengedState({ status: "appeal", stealth_snapshot: { status: "challenged" } }, true),
      false,
    );

    // SPA LocalStorage / IndexedDB fallback when SQLite Cookies lack HTTP auth cookie
    const mockSpa = {
      localStorageText:
        '_https://www.adobe.com idgTokenLs=eyJ... _https://app.heygen.com LAST_USED_AUTH_METHOD=google _https://web.telegram.org user_auth={"date":1793318483,"id":1911403634,"dcID":5} dc5_auth_key="52d7e034a1b2c3"',
      indexedDbFolders: ["https_elevenlabs.io_0.indexeddb.leveldb", "https_sync.so_0.indexeddb.leveldb"],
      idbTextByHost: {
        "https_elevenlabs.io_0.indexeddb.leveldb": "firebaseLocalStorage stsTokenManager refreshToken",
      },
    };
    assert.equal(matchServiceCookiePairs("ElevenLabs", [], mockSpa).loggedIn, true);
    assert.equal(matchServiceCookiePairs("Adobe", [], mockSpa).loggedIn, false);
    assert.equal(matchServiceCookiePairs("Adobe", [{ domain: ".adobe.com", name: "ims_sid" }], mockSpa).loggedIn, true);
    assert.equal(matchServiceCookiePairs("HeyGen", [{ domain: ".heygen.com", name: "heygen_session" }], mockSpa).loggedIn, true);
    assert.equal(matchServiceCookiePairs("Telegram", [], mockSpa).loggedIn, true);

    // Unauthenticated Telegram Web QR page (user_auth.id is null or missing) must not false-positive
    const mockTelegramQrPage = {
      localStorageText: '_https://web.telegram.org user_auth={"date":0,"id":null} dc2_auth_key="temp_qr_handshake"',
      indexedDbFolders: [],
      idbTextByHost: {},
    };
    assert.equal(matchServiceCookiePairs("Telegram", [], mockTelegramQrPage).loggedIn, false);
  });

  it("snapshots Default/Local Storage/leveldb to leveldb.last-good.bak and restores when wiped", async () => {
    const dir = makeTempProfileDir();
    seedCookiesSqlite(dir, [{ host_key: ".google.com", name: "SID" }]);

    const lsDir = path.join(dir, LOCAL_STORAGE_REL_PATH);
    fs.mkdirSync(lsDir, { recursive: true });
    fs.writeFileSync(
      path.join(lsDir, "000003.log"),
      "_https://www.adobe.com idgTokenLs=eyJ_SPA_TOKEN_DATA_1234567890_https://app.heygen.com LAST_USED_AUTH_METHOD=google".repeat(4),
      "utf8",
    );

    const snap = snapshotProfileCookiesIfHealthy(dir);
    assert.equal(snap.snapshotted, true);
    assert.equal(snap.localStorageSnapshotted, true);
    assert.equal(fs.existsSync(path.join(dir, LOCAL_STORAGE_BAK_REL_PATH, "000003.log")), true);

    const statusBefore = getProfileCookieGuardStatus(dir, { profileCode: "8888" });
    assert.equal(statusBefore.backup.hasLocalStorageBackup, true);
    assert.equal(statusBefore.backup.localStorageBackupBytes > 128, true);

    // Simulate accidental wipe of Local Storage/leveldb and Cookies
    fs.rmSync(lsDir, { recursive: true, force: true });
    seedCookiesSqlite(dir, []);

    const healed = autoHealWipedProfileCookies(dir);
    assert.equal(healed.healed, true);
    assert.equal(healed.localStorageRestored, true);
    assert.equal(fs.existsSync(path.join(lsDir, "000003.log")), true);
  });

  it("verifies TikTok session cookies via passport/web/account/info and rejects error_code 13 expired cookies", async () => {
    const validRes = await verifyTikTokCookiesLiveViaHttp(
      [{ domain: ".tiktok.com", name: "sessionid", value: "a1b2c3d4e5f60123456789abcdef0123" }],
      3000,
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          message: "success",
          data: { user_id_str: "6625078097510088706", username: "czprofess" },
        }),
      }),
    );
    assert.equal(validRes.ok, true);
    assert.equal(validRes.loggedIn, true);
    assert.equal(validRes.tiktokUserId, "6625078097510088706");
    assert.equal(validRes.tiktokUsername, "czprofess");

    const expiredRes = await verifyTikTokCookiesLiveViaHttp(
      [{ domain: ".tiktok.com", name: "sessionid", value: "f1e2d3c4b5a60123456789abcdef9999" }],
      3000,
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          message: "error",
          data: { error_code: 13, description: "Not login" },
        }),
      }),
    );
    assert.equal(expiredRes.ok, true);
    assert.equal(expiredRes.loggedIn, false);
    assert.equal(expiredRes.expired, true);
    assert.equal(expiredRes.errorCode, 13);
  });

  it("verifies Google, X/Twitter, and Instagram session cookies via live HTTP probes (ok 2)", async () => {
    const gValid = await verifyGoogleCookiesLiveViaHttp(
      [
        { domain: ".google.com", name: "SID", value: "sid_123" },
        { domain: ".google.com", name: "SAPISID", value: "sapi_123" },
      ],
      3000,
      async () => ({ status: 200, headers: new Map() }),
    );
    assert.equal(gValid.ok, true);
    assert.equal(gValid.loggedIn, true);

    const gExpired = await verifyGoogleCookiesLiveViaHttp(
      [{ domain: ".google.com", name: "SID", value: "sid_expired" }],
      3000,
      async () => ({
        status: 302,
        headers: new Map([["location", "https://accounts.google.com/ServiceLogin?passive=1209600"]]),
      }),
    );
    assert.equal(gExpired.ok, true);
    assert.equal(gExpired.loggedIn, false);
    assert.equal(gExpired.expired, true);

    const xValid = await verifyTwitterCookiesLiveViaHttp(
      [{ domain: ".x.com", name: "auth_token", value: "tok_123" }],
      3000,
      async () => ({
        status: 200,
        json: async () => ({ screen_name: "czprofess" }),
      }),
    );
    assert.equal(xValid.ok, true);
    assert.equal(xValid.loggedIn, true);
    assert.equal(xValid.twitterScreenName, "czprofess");

    const igExpired = await verifyInstagramCookiesLiveViaHttp(
      [{ domain: ".instagram.com", name: "sessionid", value: "ig_exp" }],
      3000,
      async () => ({
        status: 302,
        headers: new Map([["location", "https://www.instagram.com/accounts/login/?next=/accounts/edit/"]]),
      }),
    );
    assert.equal(igExpired.ok, true);
    assert.equal(igExpired.loggedIn, false);
    assert.equal(igExpired.expired, true);

    // Proposal 3 (`ok 3`): Outlook pre-login cookies (PPLState, OParams, SDIDC, MSPOK) must NOT match as logged_in
    const outlookPreLoginOnly = matchServiceCookiePairs("Outlook", [
      { host_key: ".live.com", name: "PPLState" },
      { host_key: ".login.live.com", name: "OParams" },
      { host_key: ".live.com", name: "SDIDC" },
      { host_key: ".login.live.com", name: "MSPOK" },
    ]);
    assert.equal(outlookPreLoginOnly.loggedIn, false);

    const outlookRealAuth = matchServiceCookiePairs("Outlook", [
      { host_key: ".live.com", name: "PPLState" },
      { host_key: ".outlook.live.com", name: "DefaultAnchorMailbox" },
      { host_key: ".live.com", name: "RPSSecAuth" },
    ]);
    assert.equal(outlookRealAuth.loggedIn, true);
  });

  it("handles Google ListAccounts payload, post-auth /speedbump/ URLs, and per-profile vault-hydrated.json fallback", async () => {
    const gListActive = await verifyGoogleCookiesLiveViaHttp(
      [
        { domain: ".google.com", name: "SID", value: "sid_1207" },
        { domain: ".google.com", name: "SAPISID", value: "sapisid_1207" },
        { domain: "accounts.google.com", name: "LSID", value: "lsid_1207" },
      ],
      3000,
      async () => ({
        status: 200,
        headers: new Map(),
        text: async () =>
          '["gaia.l.a.r",[["gaia.l.a",1,"Tania Gentili","taniagentili@gmail.com","",1,1,0,0,1,"105675657282653783539"]]]',
      }),
    );
    assert.equal(gListActive.ok, true);
    assert.equal(gListActive.loggedIn, true);
    assert.equal(gListActive.expired, false);

    const gListSignedOut = await verifyGoogleCookiesLiveViaHttp(
      [
        { domain: ".google.com", name: "SID", value: "sid_revoked" },
        { domain: ".google.com", name: "SAPISID", value: "sapisid_revoked" },
        { domain: "accounts.google.com", name: "LSID", value: "lsid_revoked" },
      ],
      3000,
      async () => ({
        status: 200,
        headers: new Map(),
        text: async () =>
          '["gaia.l.a.r",[["gaia.l.a",0,"Tania Gentili","taniagentili@gmail.com","",1,1,0,0,1,"105675657282653783539"]]]',
      }),
    );
    assert.equal(gListSignedOut.ok, true);
    assert.equal(gListSignedOut.loggedIn, false);
    assert.equal(gListSignedOut.expired, true);

    // Post-auth /speedbump/changepassword/changepasswordnudge and myaccount.google.com must be classified as authenticated
    assert.equal(
      isAuthenticatedGoogleAppUrl("https://accounts.google.com/speedbump/changepassword/changepasswordnudge"),
      true,
    );
    assert.equal(isAuthenticatedGoogleAppUrl("https://myaccount.google.com/"), true);
    assert.equal(isAuthenticatedGoogleAppUrl("https://www.google.com/"), false);
    assert.equal(
      isAuthenticatedGoogleAppUrl("https://accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn"),
      false,
    );

    const speedbumpTargetClass = classifyGoogleLiveCdpTargets([
      {
        type: "page",
        url: "https://accounts.google.com/speedbump/changepassword/changepasswordnudge",
        title: "Change password",
      },
    ]);
    assert.equal(speedbumpTargetClass, null);

    // Per-profile Default/Network/Cookies.vault-hydrated.json fallback
    const dir = makeTempProfileDir();
    const hydratedJsonPath = path.join(dir, "Default", "Network", "Cookies.vault-hydrated.json");
    fs.writeFileSync(
      hydratedJsonPath,
      JSON.stringify({
        profileCode: "8879",
        cookies: [
          { name: "SID", value: "sid_hydrated_8879", domain: ".google.com", path: "/" },
          { name: "__Secure-1PSID", value: "1psid_hydrated_8879", domain: ".google.com", path: "/", secure: true },
        ],
      }),
      "utf8",
    );
    const collected = collectVaultCookiesForProfileCode("8879", { userDataDir: dir });
    assert.equal(collected.gmail.length, 2);
    assert.equal(collected.allCookies.length, 2);
    assert.equal(collected.sources.includes("gmail"), true);

    // Non-destructive verifyMicrosoftCookiesLiveViaHttp (ok 3)
    const msValid = await verifyMicrosoftCookiesLiveViaHttp(
      [
        { domain: ".live.com", name: "WLSSC", value: "wlssc_live_token_1234567890" },
        { domain: ".outlook.live.com", name: "DefaultAnchorMailbox", value: "user@outlook.com" },
      ],
      3000,
      async () => ({
        status: 200,
        headers: new Map(),
      }),
    );
    assert.equal(msValid.ok, true);
    assert.equal(msValid.loggedIn, true);
    assert.equal(msValid.expired, false);

    // Redirect to login.live.com when only .live.com cookies are sent is non-destructive (loggedIn: true, expired: false)
    const msRedirect = await verifyMicrosoftCookiesLiveViaHttp(
      [{ domain: ".live.com", name: "WLSSC", value: "wlssc_live_token_1234567890" }],
      3000,
      async () => ({
        status: 302,
        headers: new Map([["location", "https://login.live.com/login.srf?wa=wsignin1.0"]]),
      }),
    );
    assert.equal(msRedirect.ok, true);
    assert.equal(msRedirect.loggedIn, true);
    assert.equal(msRedirect.expired, false);

    // autoSkipGoogleSpeedbumpTargets (ok 2) safely returns 0 when no WebSocket debugger URL exists
    const skipRes = await autoSkipGoogleSpeedbumpTargets([
      {
        type: "page",
        url: "https://accounts.google.com/speedbump/changepassword/changepasswordnudge",
      },
    ]);
    assert.equal(skipRes.skippedCount, 0);
  });

  it("purges stale Google OSID/SID session collisions and sanitizes SQLite creation_utc, duplicates, and __Secure-3P SameSite=None", () => {
    // 1. reconcileSplitGoogleAuthCookies must distinguish g.a000EQnZ0DteXA64 vs g.a000EQnZ0BSti5bt (same 11-char epoch prefix)
    // and purge stale OSID/__Secure-OSID from older sessions so mail.google.com never triggers CookieMismatch logout
    const reconciled = reconcileSplitGoogleAuthCookies(
      [
        {
          domain: ".google.com",
          path: "/",
          name: "SID",
          value: "g.a000EQnZ0DteXA64NewSessionToken12345",
          expires: 1825242486,
          _updatedUs: 13438179882234002n,
        },
        {
          domain: ".google.com",
          path: "/",
          name: "__Secure-1PSID",
          value: "g.a000EQnZ0DteXA64NewSessionToken12345",
          expires: 1825242486,
          _updatedUs: 13438179882234002n,
        },
        {
          domain: ".google.com",
          path: "/",
          name: "__Secure-3PSID",
          value: "g.a000EQnZ0BSti5btOldSessionToken99999",
          sameSite: "Lax",
          expires: 1825112808,
          _updatedUs: 13438050408000000n,
        },
        {
          domain: "mail.google.com",
          path: "/mail",
          name: "OSID",
          value: "g.a000EQnZ0Cmr9V3POldMailOsidToken",
          expires: 1825112808,
          _updatedUs: 13438050408000000n,
        },
        {
          domain: ".google.com",
          path: "/",
          name: "__Secure-3PAPISID",
          value: "3p_apisid_val",
          sameSite: "Lax",
          secure: false,
          expires: 1825242486,
          _updatedUs: 13438179882234002n,
        },
      ],
      [],
    );

    assert.equal(reconciled.some((c) => c.name === "__Secure-3PSID"), false);
    assert.equal(reconciled.some((c) => c.name === "OSID"), false);
    const fixed3p = reconciled.find((c) => c.name === "__Secure-3PAPISID");
    assert.ok(fixed3p);
    assert.equal(fixed3p.sameSite, "None");
    assert.equal(fixed3p.secure, true);

    // 2. sanitizeProfileSqliteCookiesInPlace repairs duplicate (host_key, name, path), colliding creation_utc, and __Secure-3P samesite
    const dir = makeTempProfileDir();
    const ckPath = path.join(dir, COOKIES_REL_PATH);
    if (fs.existsSync(ckPath)) fs.unlinkSync(ckPath);
    const db = openGuardSqlite(ckPath, { readOnly: false });
    db.exec(`
      CREATE TABLE cookies (
        creation_utc INTEGER NOT NULL,
        host_key TEXT NOT NULL,
        top_frame_site_key TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        encrypted_value BLOB NOT NULL DEFAULT X'',
        path TEXT NOT NULL DEFAULT '/',
        expires_utc INTEGER NOT NULL DEFAULT 0,
        is_secure INTEGER NOT NULL DEFAULT 1,
        is_httponly INTEGER NOT NULL DEFAULT 1,
        last_access_utc INTEGER NOT NULL DEFAULT 0,
        has_expires INTEGER NOT NULL DEFAULT 1,
        is_persistent INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 1,
        samesite INTEGER NOT NULL DEFAULT 1,
        source_scheme INTEGER NOT NULL DEFAULT 2,
        source_port INTEGER NOT NULL DEFAULT 443,
        last_update_utc INTEGER NOT NULL DEFAULT 0,
        source_type INTEGER NOT NULL DEFAULT 0,
        has_cross_site_ancestor INTEGER NOT NULL DEFAULT 0
      );
    `);
    const ins = db.prepare(`
      INSERT INTO cookies (creation_utc, host_key, name, value, path, expires_utc, is_secure, samesite, source_port, last_update_utc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Duplicate (.google.com, SID, /) with older and newer last_update_utc + identical creation_utc
    ins.run(13438180086000000n, ".google.com", "SID", "g.a000EQnZ0BSti5btOldSession", "/", 13449567208000000n, 0, 1, -1, 13438050408000000n);
    ins.run(13438180086000000n, ".google.com", "SID", "g.a000EQnZ0DteXA64NewSession", "/", 13449696886000000n, 0, 1, 443, 13438179882234002n);
    ins.run(13438180086000000n, ".google.com", "__Secure-1PSID", "g.a000EQnZ0DteXA64NewSession", "/", 13449696886000000n, 1, 1, 443, 13438179882234002n);
    ins.run(13438180086000000n, ".google.com", "__Secure-3PSID", "g.a000EQnZ0DteXA64NewSession", "/", 13449696886000000n, 0, 1, 443, 13438179882234002n);
    ins.run(13438180086000000n, "mail.google.com", "OSID", "g.a000EQnZ0Cmr9V3POldMailOsid", "/mail", 13449567208000000n, 1, 1, 443, 13438050408000000n);
    db.close();

    const sanitized = sanitizeProfileSqliteCookiesInPlace(dir);
    assert.equal(sanitized.ok, true);
    assert.equal(sanitized.mutated, true);
    assert.equal(sanitized.purgedStaleGoogleRows, 2); // old SID + old mail.google.com OSID
    assert.equal(sanitized.fixed3pRows, 1);
    assert.equal(sanitized.fixedCreationUtcRows, 2);

    const checkDb = openGuardSqlite(ckPath, { readOnly: true });
    const rowsAfter = checkDb
      .prepare("SELECT host_key, name, value, is_secure, samesite, CAST(creation_utc AS TEXT) AS cr FROM cookies")
      .all();
    checkDb.close();
    assert.equal(rowsAfter.length, 3);
    assert.equal(rowsAfter.some((r) => r.name === "OSID"), false);
    const sidRow = rowsAfter.find((r) => r.name === "SID");
    assert.equal(sidRow.value, "g.a000EQnZ0DteXA64NewSession");
    const sec3pRow = rowsAfter.find((r) => r.name === "__Secure-3PSID");
    assert.equal(sec3pRow.samesite, 0);
    assert.equal(sec3pRow.is_secure, 1);
    const uniqueCrs = new Set(rowsAfter.map((r) => r.cr));
    assert.equal(uniqueCrs.size, 3);
  });

  it("restoreProfileCookiesManual recovers 100% from Cookies.vault-hydrated.json even when both Cookies and Cookies.last-good.bak are missing", async () => {
    const dir = makeTempProfileDir();
    const ckPath = path.join(dir, COOKIES_REL_PATH);
    const bakPath = path.join(dir, COOKIES_BAK_REL_PATH);
    if (fs.existsSync(ckPath)) fs.unlinkSync(ckPath);
    if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
    // Remove Local State too so ensureProfileLocalStateDpapiKey generates a fresh DPAPI key
    const lsPath = path.join(dir, LOCAL_STATE_REL_PATH);
    if (fs.existsSync(lsPath)) fs.unlinkSync(lsPath);

    // Seed on-disk Cookies.vault-hydrated.json backup
    fs.writeFileSync(
      path.join(dir, "Default", "Network", "Cookies.vault-hydrated.json"),
      JSON.stringify({
        profileCode: "9877",
        cookies: [
          { domain: ".google.com", path: "/", name: "SID", value: "g.a000EQnZ0DteXA64VaultSid123", expires: 1850000000, secure: false, httpOnly: false },
          { domain: ".google.com", path: "/", name: "__Secure-1PSID", value: "g.a000EQnZ0DteXA64VaultSid123", expires: 1850000000, secure: true, httpOnly: true },
          { domain: ".live.com", path: "/", name: "RPSSecAuth", value: "VaultOutlookRpsToken", expires: 1850000000, secure: true, httpOnly: true },
        ],
      }),
      "utf8",
    );

    const res = await restoreProfileCookiesManual(dir, {
      profileCode: "9877",
      context: null,
      isRunning: false,
    });
    assert.equal(res.ok, true);
    assert.ok(res.vaultInjectedCount >= 3);
    assert.equal(fs.existsSync(ckPath), true);
    assert.equal(fs.existsSync(bakPath), true);
    assert.equal(res.status.current.hasGoogleAuth, true);
    assert.equal(res.status.current.hasOutlookAuth, true);
  });

  it("preserves newer regional .google.com.vn SID and upgrades stale SQLite Google session from Cookies.vault-hydrated.json on launch", () => {
    const dir = makeTempProfileDir();
    const ckPath = path.join(dir, COOKIES_REL_PATH);
    fs.mkdirSync(path.dirname(ckPath), { recursive: true });
    const db = openGuardSqlite(ckPath, { readOnly: false });
    db.exec(`
      CREATE TABLE meta(key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY, value LONGVARCHAR);
      INSERT INTO meta VALUES('version', '24');
      CREATE TABLE cookies(
        creation_utc INTEGER NOT NULL,
        host_key TEXT NOT NULL,
        top_frame_site_key TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        value TEXT NOT NULL DEFAULT '',
        encrypted_value BLOB NOT NULL DEFAULT X'',
        path TEXT NOT NULL DEFAULT '/',
        expires_utc INTEGER NOT NULL DEFAULT 0,
        is_secure INTEGER NOT NULL DEFAULT 1,
        is_httponly INTEGER NOT NULL DEFAULT 1,
        last_access_utc INTEGER NOT NULL DEFAULT 0,
        has_expires INTEGER NOT NULL DEFAULT 1,
        is_persistent INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 1,
        samesite INTEGER NOT NULL DEFAULT 1,
        source_scheme INTEGER NOT NULL DEFAULT 2,
        source_port INTEGER NOT NULL DEFAULT 443,
        last_update_utc INTEGER NOT NULL DEFAULT 0,
        source_type INTEGER NOT NULL DEFAULT 1,
        has_cross_site_ancestor INTEGER NOT NULL DEFAULT 1
      );
    `);
    const ins = db.prepare(`
      INSERT INTO cookies (creation_utc, host_key, name, value, path, expires_utc, last_update_utc)
      VALUES (?, ?, ?, ?, '/', ?, ?)
    `);
    // Older .google.com SID (expires_utc = 13469578665000000 -> 1825105065s)
    ins.run(13438105528959110n, ".google.com", "SID", "g.a000EQn2kAYePfAkvWTUjK_OLD", 13469578665000000n, 13438105528959110n);
    // Newer .google.com.vn SID (expires_utc = 13472802802528000 -> 1828329202.528s)
    ins.run(13438242802528000n, ".google.com.vn", "SID", "g.a000EQn2kBrSai-QpHXM5U_NEW", 13472802802528000n, 13438242802528000n);
    db.close();

    const sanitized = sanitizeProfileSqliteCookiesInPlace(dir);
    assert.equal(sanitized.ok, true);
    assert.equal(sanitized.purgedStaleGoogleRows, 1);

    const checkDb = openGuardSqlite(ckPath, { readOnly: true });
    const rows = checkDb.prepare("SELECT host_key, name, value FROM cookies").all();
    checkDb.close();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].host_key, ".google.com.vn");
    assert.equal(rows[0].value, "g.a000EQn2kBrSai-QpHXM5U_NEW");

    // Verify autoHealWipedProfileCookies does NOT mutate or inject into a non-empty SQLite DB (Strict Zero-Write)
    fs.writeFileSync(
      path.join(dir, "Default", "Network", "Cookies.vault-hydrated.json"),
      JSON.stringify({
        profileCode: "0004",
        cookies: [
          { domain: ".google.com", path: "/", name: "SID", value: "g.a000EQn2kFutureVaultSid999", expires: 1850000000, secure: false, httpOnly: false },
          { domain: ".google.com", path: "/", name: "__Secure-1PSID", value: "g.a000EQn2kFutureVaultSid999", expires: 1850000000, secure: true, httpOnly: true },
        ],
      }),
      "utf8",
    );
    const healed = autoHealWipedProfileCookies(dir);
    assert.equal(Boolean(healed.cookiesRestored), false);
  });

  it("rotates 2-slot native session backups (slot-latest -> slot-previous) and restores bit-for-bit across profiles", () => {
    const {
      snapshotProfileNativeSession,
      restoreProfileNativeSession,
      getProfileNativeBackupSlots,
      wrapMasterKeyPortable,
      unwrapMasterKeyPortable,
    } = require("./native-session-backup.cjs");

    // 1. Portable AES-256-GCM master key wrap/unwrap
    const rawKey = Buffer.alloc(32, 0x5a);
    const wrapped = wrapMasterKeyPortable(rawKey);
    const unwrapped = unwrapMasterKeyPortable(wrapped);
    assert.equal(Buffer.isBuffer(unwrapped), true);
    assert.equal(unwrapped.equals(rawKey), true);

    // 2. Snapshot v1 -> slot-latest
    const srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-native-bkp-"));
    const srcProfileDir = path.join(srcRoot, "profiles", "src-profile-0001");
    const dstProfileDir = path.join(srcRoot, "profiles", "dst-profile-10001");
    try {
      seedCookiesSqlite(srcProfileDir, [
        { host_key: ".google.com", name: "SID" },
        { host_key: ".facebook.com", name: "c_user" },
      ]);
      fs.writeFileSync(
        path.join(srcProfileDir, "Local State"),
        JSON.stringify({ os_crypt: { encrypted_key: "RFBBUEk=" } }),
        "utf8",
      );
      const lsDir = path.join(srcProfileDir, LOCAL_STORAGE_REL_PATH);
      fs.mkdirSync(lsDir, { recursive: true });
      fs.writeFileSync(path.join(lsDir, "000005.ldb"), "LEVELDB_SESSION_PAYLOAD_V1_".repeat(8), "utf8");

      const snap1 = snapshotProfileNativeSession(srcProfileDir, {
        profileCode: "0001",
        inspectSqliteCookiesFile: (p, sz) => ({
          exists: true,
          readable: true,
          totalRows: 2,
          authDomainsCount: 2,
          hasGoogleAuth: true,
          hasFacebookAuth: true,
          hasOutlookAuth: false,
          hasTikTokAuth: false,
          byteSize: sz,
        }),
        unprotectDpapiKey: () => rawKey,
      });
      assert.equal(snap1.ok, true);
      assert.equal(snap1.manifest.totalRows, 2);

      // 3. Snapshot v2 (new cookie added) -> rotates v1 into slot-previous
      seedCookiesSqlite(srcProfileDir, [
        { host_key: ".google.com", name: "SID" },
        { host_key: ".facebook.com", name: "c_user" },
        { host_key: ".tiktok.com", name: "sessionid" },
      ]);
      const snap2 = snapshotProfileNativeSession(srcProfileDir, {
        profileCode: "0001",
        inspectSqliteCookiesFile: (p, sz) => ({
          exists: true,
          readable: true,
          totalRows: 3,
          authDomainsCount: 3,
          hasGoogleAuth: true,
          hasFacebookAuth: true,
          hasOutlookAuth: false,
          hasTikTokAuth: true,
          byteSize: sz,
        }),
        unprotectDpapiKey: () => rawKey,
      });
      assert.equal(snap2.ok, true);

      const slots = getProfileNativeBackupSlots(srcProfileDir);
      assert.equal(slots.slotLatest.totalRows, 3);
      assert.equal(slots.slotPrevious.totalRows, 2);
      assert.notEqual(slots.slotLatest.cookiesSha256, slots.slotPrevious.cookiesSha256);

      // 4. Restore slot-latest into dstProfileDir (#10001) and verify bit-for-bit parity
      fs.mkdirSync(dstProfileDir, { recursive: true });
      const restLatest = restoreProfileNativeSession(dstProfileDir, {
        profileCode: "10001",
        slot: "latest",
        sourceUserDataDir: srcProfileDir,
        unprotectDpapiKey: () => rawKey,
      });
      assert.equal(restLatest.ok, true);
      assert.equal(restLatest.restoredSlot, "latest");
      assert.equal(restLatest.totalRows, 3);
      assert.equal(
        fs.existsSync(path.join(dstProfileDir, LOCAL_STORAGE_REL_PATH, "000005.ldb")),
        true,
      );

      // 5. Restore slot-previous into dstProfileDir and verify rollback to 2 rows
      const restPrev = restoreProfileNativeSession(dstProfileDir, {
        profileCode: "10001",
        slot: "previous",
        sourceUserDataDir: srcProfileDir,
        unprotectDpapiKey: () => rawKey,
      });
      assert.equal(restPrev.ok, true);
      assert.equal(restPrev.restoredSlot, "previous");
      assert.equal(restPrev.totalRows, 2);

      // 6. Verify cross-machine DPAPI re-wrapping via native koffi protectDpapiKey (< 30ms, 0 PowerShell)
      const crossMachineDir = path.join(srcRoot, "profiles", "dst-cross-machine");
      fs.mkdirSync(crossMachineDir, { recursive: true });
      const tWrap0 = performance.now();
      const restRewrap = restoreProfileNativeSession(crossMachineDir, {
        profileCode: "10002",
        slot: "latest",
        sourceUserDataDir: srcProfileDir,
        unprotectDpapiKey: () => null, // simulate foreign machine DPAPI failure so wrappedMasterKeyB64 is re-wrapped
      });
      const wrapElapsedMs = performance.now() - tWrap0;
      assert.equal(restRewrap.ok, true);
      if (process.platform === "win32") {
        assert.equal(restRewrap.dpapiRewrapped, true);
        assert.ok(wrapElapsedMs < 80, `Expected in-process koffi DPAPI rewrap < 80ms, took ${wrapElapsedMs.toFixed(1)}ms`);
        const lsRewrapped = JSON.parse(fs.readFileSync(path.join(crossMachineDir, "Local State"), "utf8"));
        const roundtripKey = unprotectDpapiKey(lsRewrapped.os_crypt.encrypted_key);
        assert.equal(Buffer.isBuffer(roundtripKey), true);
        assert.equal(roundtripKey.equals(rawKey), true);
      }
    } finally {
      fs.rmSync(srcRoot, { recursive: true, force: true });
    }
  });

  it("queries drive free bytes natively via koffi GetDiskFreeSpaceExW (< 20ms, 0 PowerShell) and runs p0020-reconcile-worker cleanly", async () => {
    const { driveFreeBytes, getWin32DiskFreeBytesNative } = require("./profiles-location.cjs");
    const { runP0020ReconcileInWorker } = require("./p0020-reconcile-worker.cjs");

    if (process.platform === "win32") {
      const targetRoot = path.parse(process.cwd()).root || "C:\\";
      const t0 = performance.now();
      const nativeFree = getWin32DiskFreeBytesNative(targetRoot);
      const elapsedMs = performance.now() - t0;
      assert.ok(nativeFree > 0, `Expected positive free bytes for ${targetRoot}, got ${nativeFree}`);
      assert.ok(elapsedMs < 35, `Expected native GetDiskFreeSpaceExW < 35ms, took ${elapsedMs.toFixed(2)}ms`);
      assert.ok(driveFreeBytes(targetRoot) > 0);
    }

    const tmpProfilesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-worker-test-"));
    try {
      const res = await runP0020ReconcileInWorker("harvestDiskSqliteToEcosystemVaults", {
        baseDir: tmpProfilesRoot,
      });
      assert.equal(typeof res, "object");
    } finally {
      fs.rmSync(tmpProfilesRoot, { recursive: true, force: true });
    }
  });
});
