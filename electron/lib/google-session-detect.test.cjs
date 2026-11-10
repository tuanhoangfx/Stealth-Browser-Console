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
  assert.equal(
    classifyUrl("https://accounts.google.com/AccountChooser?continue=https://one.google.com/storage"),
    "challenge",
  );
  assert.equal(
    classifyUrl("https://accounts.google.com/v3/signin/confirmidentifier?continue=https://one.google.com/storage"),
    "challenge",
  );
  assert.equal(classifyUrl("https://myaccount.google.com/u/0/"), "account");
  assert.equal(classifyUrl("https://one.google.com/storage"), "account");
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

test("shouldPreserveChallengedState and classifyGoogleLiveCdpTargets prevent false Google logged_in on stale disk cookies", () => {
  const {
    shouldPreserveChallengedState,
    classifyGoogleLiveCdpTargets,
  } = require("./stealth-multiplatform-sync.cjs");

  const challengedRow = {
    service: "Gmail",
    status: "error",
    stealth_snapshot: {
      status: "challenged",
      result_code: "challenged_captcha_grid",
    },
  };
  assert.equal(
    shouldPreserveChallengedState(challengedRow, true, { isLiveWindow: false, hasVerifiedGoogleLiveTab: false }),
    true,
  );
  assert.equal(
    shouldPreserveChallengedState(challengedRow, true, { isLiveWindow: true, hasVerifiedGoogleLiveTab: true }),
    false,
  );

  const loggedOutRow = {
    service: "Gmail",
    status: "active",
    stealth_snapshot: {
      status: "not_logged_in",
      result_code: "google_one_logged_out",
    },
  };
  assert.equal(
    shouldPreserveChallengedState(loggedOutRow, true, { isLiveWindow: false, hasVerifiedGoogleLiveTab: false }),
    true,
  );

  const liveCaptcha = classifyGoogleLiveCdpTargets([
    { url: "https://accounts.google.com/v3/signin/challenge/recaptcha?TL=abc", title: "Sign in" },
  ]);
  assert.equal(liveCaptcha?.restricted, true);
  assert.equal(liveCaptcha?.status, "challenged");
  assert.equal(liveCaptcha?.rowStatus, null);

  const liveSignedOut = classifyGoogleLiveCdpTargets([
    { url: "https://accounts.google.com/AccountChooser?continue=https://one.google.com/storage", title: "Sign in" },
  ]);
  assert.equal(liveSignedOut?.restricted, true);
  assert.equal(liveSignedOut?.status, "not_logged_in");

  const { classifyMicrosoftLiveCdpTargets } = require("./stealth-multiplatform-sync.cjs");
  const msAbuse = classifyMicrosoftLiveCdpTargets([
    { url: "https://account.live.com/Abuse?mkt=en-US", title: "Your account has been locked" },
  ]);
  assert.equal(msAbuse?.restricted, true);
  assert.equal(msAbuse?.status, "challenged");
  assert.equal(msAbuse?.rowStatus, "error");

  const msProofs = classifyMicrosoftLiveCdpTargets([
    { url: "https://account.live.com/proofs/Verify", title: "Verify your identity" },
  ]);
  assert.equal(msProofs?.restricted, true);
  assert.equal(msProofs?.status, "challenged");
  assert.equal(msProofs?.rowStatus, "check_phone");

  const outlookChallengedRow = {
    service: "Outlook",
    status: "error",
    stealth_snapshot: {
      status: "challenged",
      result_code: "account_disabled",
    },
  };
  assert.equal(
    shouldPreserveChallengedState(outlookChallengedRow, true, {
      isLiveWindow: false,
      hasVerifiedMicrosoftLiveTab: false,
    }),
    true,
  );
  assert.equal(
    shouldPreserveChallengedState(outlookChallengedRow, true, {
      isLiveWindow: true,
      hasVerifiedMicrosoftLiveTab: true,
    }),
    false,
  );
  assert.equal(
    shouldPreserveChallengedState(outlookChallengedRow, true, {
      isLiveWindow: false,
      hasVerifiedMicrosoftAuth: true,
    }),
    false,
  );
});

test("autoHealCompletedMicrosoftChallengeTabs and syncProfileWindowLiveCdpStateToP0020 guard OAuth and invalid codes cleanly", async () => {
  const {
    autoHealCompletedMicrosoftChallengeTabs,
    syncProfileWindowLiveCdpStateToP0020,
  } = require("./stealth-multiplatform-sync.cjs");

  const emptyHeal = await autoHealCompletedMicrosoftChallengeTabs([]);
  assert.deepEqual(emptyHeal, { closedCount: 0, redirectedCount: 0 });

  const oauthGuardHeal = await autoHealCompletedMicrosoftChallengeTabs([
    {
      url: "https://login.live.com/oauth20_authorize.srf?client_id=test&redirect_uri=https%3A%2F%2Fchat.openai.com",
      webSocketDebuggerUrl: "ws://127.0.0.1:9/devtools/page/1",
    },
  ]);
  assert.deepEqual(oauthGuardHeal, { closedCount: 0, redirectedCount: 0 });

  const invalidRes = await syncProfileWindowLiveCdpStateToP0020({
    profileCode: "",
    liveCdp: false,
  });
  assert.equal(invalidRes.ok, false);
  assert.equal(invalidRes.reason, "invalid_profile_code");
});

test("isAuthenticatedFacebookAppUrl, isAuthenticatedTikTokAppUrl, classifyFacebookLiveCdpTargets, and autoHealCompletedSocialChallengeTabs handle leftover 2FA/login tabs cleanly", async () => {
  const {
    isAuthenticatedFacebookAppUrl,
    isAuthenticatedTikTokAppUrl,
    classifyFacebookLiveCdpTargets,
    autoHealCompletedSocialChallengeTabs,
  } = require("./stealth-multiplatform-sync.cjs");

  assert.equal(isAuthenticatedFacebookAppUrl("https://www.facebook.com/"), true);
  assert.equal(isAuthenticatedFacebookAppUrl("https://www.facebook.com/messages/t/12345"), true);
  assert.equal(
    isAuthenticatedFacebookAppUrl("https://www.facebook.com/two_step_verification/authentication/"),
    false,
  );
  assert.equal(
    isAuthenticatedFacebookAppUrl("https://www.facebook.com/checkpoint/828281030927956/"),
    false,
  );
  assert.equal(isAuthenticatedFacebookAppUrl("https://www.facebook.com/login/"), false);

  assert.equal(isAuthenticatedTikTokAppUrl("https://www.tiktok.com/foryou"), true);
  assert.equal(isAuthenticatedTikTokAppUrl("https://www.tiktok.com/@username"), true);
  assert.equal(isAuthenticatedTikTokAppUrl("https://www.tiktok.com/login/phone-or-email/email"), false);

  // When a clean authenticated facebook.com tab is open alongside a leftover 2FA/login tab,
  // classifyFacebookLiveCdpTargets returns null so the verified session is not overridden.
  const mixedTabs = [
    { url: "https://www.facebook.com/two_step_verification/authentication/" },
    { url: "https://www.facebook.com/" },
  ];
  assert.equal(classifyFacebookLiveCdpTargets(mixedTabs), null);

  // Hard checkpoint 956 or 282 still restricts even if another tab is open
  const hardCheckpointTabs = [
    { url: "https://www.facebook.com/checkpoint/828281030927956/" },
    { url: "https://www.facebook.com/" },
  ];
  const hardState = classifyFacebookLiveCdpTargets(hardCheckpointTabs);
  assert.equal(hardState?.resultCode, "fb_checkpoint_956");

  const emptySocialHeal = await autoHealCompletedSocialChallengeTabs([], { platform: "facebook" });
  assert.deepEqual(emptySocialHeal, { closedCount: 0, redirectedCount: 0 });
});

test("reconcileSplitGoogleAuthCookies and verifyGoogleCookiesLiveViaHttp reconcile stale .google.com SID against newer regional .google.com.vn or backup cookies", async () => {
  const { reconcileSplitGoogleAuthCookies } = require("./profile-cookie-guard.cjs");
  const { verifyGoogleCookiesLiveViaHttp } = require("./stealth-multiplatform-sync.cjs");

  const primaryList = [
    { name: "SID", value: "g.a000Dglk_OLD_SESSION", domain: ".google.com", path: "/", _updatedUs: 100n },
    { name: "__Secure-1PSID", value: "g.a000EQlk_NEW_SESSION", domain: ".google.com", path: "/", _updatedUs: 200n },
    { name: "SID", value: "g.a000EQlk_NEW_SESSION", domain: ".google.com.vn", path: "/", _updatedUs: 200n },
    { name: "SAPISID", value: "NEW_SAPISID", domain: ".google.com.vn", path: "/", _updatedUs: 200n },
  ];
  const merged = reconcileSplitGoogleAuthCookies(primaryList, []);
  const dotGoogleSid = merged.find((c) => c.domain === ".google.com" && c.name === "SID");
  const dotGoogleSapisid = merged.find((c) => c.domain === ".google.com" && c.name === "SAPISID");
  assert.equal(dotGoogleSid?.value, "g.a000EQlk_NEW_SESSION");
  assert.equal(dotGoogleSapisid?.value, "NEW_SAPISID");

  let capturedCookieHeader = "";
  const mockFetch = async (_url, init) => {
    capturedCookieHeader = init?.headers?.cookie || "";
    return {
      status: 200,
      headers: { get: () => "" },
      text: async () =>
        JSON.stringify([
          "gaia.l.a.r",
          [["gaia.l.a", 1, "User", "killonfriday@gmail.com", "", 1, 1, 0, null, 1, "123"]],
        ]),
    };
  };
  const verifyRes = await verifyGoogleCookiesLiveViaHttp(primaryList, 2000, mockFetch);
  assert.equal(verifyRes.ok, true);
  assert.equal(verifyRes.loggedIn, true);
  assert.equal(capturedCookieHeader.includes("SID=g.a000EQlk_NEW_SESSION"), true);

  // Also verify Microsoft (Outlook / live.com) backup auth cookie reconciliation
  const msPrimary = [
    { name: "MSPAuth", value: "OLD_MSP", domain: ".live.com", path: "/", _updatedUs: 100n },
  ];
  const msBackup = [
    { name: "MSPAuth", value: "NEW_MSP", domain: ".live.com", path: "/", _updatedUs: 300n },
    { name: "RPSSecAuth", value: "NEW_RPS", domain: "outlook.live.com", path: "/", _updatedUs: 300n },
    { name: "WLSSC", value: "NEW_WLSSC", domain: ".live.com", path: "/", _updatedUs: 300n },
  ];
  const msMerged = reconcileSplitGoogleAuthCookies(msPrimary, msBackup);
  assert.equal(msMerged.find((c) => c.name === "MSPAuth")?.value, "NEW_MSP");
  assert.equal(msMerged.find((c) => c.name === "RPSSecAuth")?.value, "NEW_RPS");
  assert.equal(msMerged.find((c) => c.name === "WLSSC")?.value, "NEW_WLSSC");
});

test("classifyGoogleLiveCdpTargets flags https://www.google.com/ as not_logged_in when hasGoogleAuthCookies is false", () => {
  const { classifyGoogleLiveCdpTargets } = require("./stealth-multiplatform-sync.cjs");
  const googleHomeTargets = [{ url: "https://www.google.com/" }];
  const withoutCookies = classifyGoogleLiveCdpTargets(googleHomeTargets, { hasGoogleAuthCookies: false });
  assert.equal(withoutCookies?.status, "not_logged_in");
  assert.equal(withoutCookies?.resultCode, "login_page");
  assert.equal(withoutCookies?.restricted, true);

  const withCookies = classifyGoogleLiveCdpTargets(googleHomeTargets, { hasGoogleAuthCookies: true });
  assert.equal(withCookies, null);
});

test("classifyGoogleLiveCdpTargets detects 2FA TOTP (/challenge/totp) and Backup Code (/challenge/bc) screens as challenged", () => {
  const {
    classifyGoogleLiveCdpTargets,
    shouldPreserveChallengedState,
  } = require("./stealth-multiplatform-sync.cjs");

  const totpChallenge = classifyGoogleLiveCdpTargets([
    {
      url: "https://accounts.google.com/v3/signin/challenge/totp?TL=ALgCv6w&continue=https%3A%2F%2Fwww.google.com%2F",
      title: "Sign in - Google Accounts",
    },
  ]);
  assert.equal(totpChallenge?.restricted, true);
  assert.equal(totpChallenge?.status, "challenged");
  assert.equal(totpChallenge?.rowStatus, null);
  assert.equal(totpChallenge?.resultCode, "2fa_pending");

  const backupCodeChallenge = classifyGoogleLiveCdpTargets([
    {
      url: "https://accounts.google.com/v3/signin/challenge/bc?TL=ALgCv6w",
      title: "Sign in - Google Accounts",
    },
  ]);
  assert.equal(backupCodeChallenge?.restricted, true);
  assert.equal(backupCodeChallenge?.status, "challenged");
  assert.equal(backupCodeChallenge?.resultCode, "2fa_pending");

  const selectionChallenge = classifyGoogleLiveCdpTargets([
    {
      url: "https://accounts.google.com/v3/signin/challenge/selection?TL=ALgCv6w",
      title: "Sign in - Google Accounts",
    },
  ]);
  assert.equal(selectionChallenge?.restricted, true);
  assert.equal(selectionChallenge?.status, "challenged");
  assert.equal(selectionChallenge?.resultCode, "google_challenge");

  const totpRow = {
    service: "Gmail",
    status: "incorrect_info",
    stealth_snapshot: {
      status: "challenged",
      result_code: "2fa_pending",
    },
  };
  assert.equal(
    shouldPreserveChallengedState(totpRow, true, {
      isLiveWindow: false,
      hasVerifiedGoogleLiveTab: false,
      hasVerifiedGoogleAuth: false,
    }),
    true,
  );
  assert.equal(
    shouldPreserveChallengedState(totpRow, true, {
      isLiveWindow: true,
      hasVerifiedGoogleLiveTab: true,
      hasVerifiedGoogleAuth: true,
    }),
    false,
  );
});

test("verifyGoogleCookiesLiveViaHttp parses 17-element consumer ListAccounts and matchServiceCookiePairs rejects Google account_mismatch", async () => {
  const {
    verifyGoogleCookiesLiveViaHttp,
    matchServiceCookiePairs,
  } = require("./stealth-multiplatform-sync.cjs");

  const cookies = [
    { name: "SID", value: "g.a000Dwhw_KIENLAU_SESSION", domain: ".google.com", path: "/" },
    { name: "__Secure-1PSID", value: "g.a000Dwhw_KIENLAU_SESSION", domain: ".google.com", path: "/" },
    { name: "HSID", value: "HSID_1", domain: ".google.com", path: "/" },
    { name: "SSID", value: "SSID_1", domain: ".google.com", path: "/" },
    { name: "APISID", value: "APISID_1", domain: ".google.com", path: "/" },
    { name: "SAPISID", value: "SAPISID_1", domain: ".google.com", path: "/" },
  ];

  const mockFetch = async () => ({
    status: 200,
    headers: { get: () => "" },
    text: async () =>
      JSON.stringify([
        "gaia.l.a.r",
        [
          [
            "gaia.l.a",
            1,
            "kienlau",
            "kienlau1998@gmail.com",
            "https://lh3.googleusercontent.com/a/default-user=s48",
            0,
            null,
            null,
            null,
            0,
            "117878033613710190150",
            null,
            null,
            null,
            1,
            null,
            "kienlau",
          ],
        ],
      ]),
  });

  const verifyRes = await verifyGoogleCookiesLiveViaHttp(cookies, 2000, mockFetch, {
    resolveIdentity: true,
  });
  assert.equal(verifyRes.ok, true);
  assert.equal(verifyRes.loggedIn, true);
  assert.deepEqual(verifyRes.verifiedEmails, ["kienlau1998@gmail.com"]);

  const matchedOwner = matchServiceCookiePairs("Gmail", cookies, null, {
    expectedAccount: "kienlau1998@gmail.com",
  });
  assert.equal(matchedOwner.loggedIn, true);

  const mismatchedGmail = matchServiceCookiePairs("Gmail", cookies, null, {
    expectedAccount: "fshilling3@gmail.com",
  });
  assert.equal(mismatchedGmail.loggedIn, false);
  assert.equal(mismatchedGmail.resultCode, "account_mismatch");
  assert.equal(mismatchedGmail.actualAccount, "kienlau1998@gmail.com");

  const mismatchedGoogleOne = matchServiceCookiePairs("Google One", cookies, null, {
    expectedAccount: "fshilling3@gmail.com",
  });
  assert.equal(mismatchedGoogleOne.loggedIn, false);
  assert.equal(mismatchedGoogleOne.resultCode, "account_mismatch");
  assert.equal(mismatchedGoogleOne.actualAccount, "kienlau1998@gmail.com");

  // Regression (#0112 gregrosati340@gmail.com QR checkpoint):
  // When ListAccounts returns acc[5]=0, acc[9]=0, acc[14]=1 (signed-out / remembered in AccountChooser),
  // verifyGoogleCookiesLiveViaHttp MUST return loggedIn=false and expired=true instead of false-positive loggedIn=true.
  const signedOutRememberedPayload =
    `)]}'\n["gaia.l.a.r",[["gaia.l.a",1,"Gregro","gregrosati340@gmail.com","https://lh3.googleusercontent.com/a/default-user=s48",0,null,null,null,0,"103593473499804537686",null,null,null,1,null,"Gregro"]]]`;
  const qrChallengedCookies = [
    { domain: ".google.com", name: "SID", value: "g.a0003gght4hQR_CHALLENGED_SID_0112" },
    { domain: ".google.com", name: "HSID", value: "HSID_0112" },
    { domain: ".google.com", name: "SSID", value: "SSID_0112" },
    { domain: ".google.com", name: "SAPISID", value: "SAPISID_0112" },
    { domain: "accounts.google.com", name: "LSID", value: "LSID_0112_STALE_TOKEN_123456" },
    { domain: "accounts.google.com", name: "__Host-1PLSID", value: "1PLSID_0112_STALE_TOKEN_123456" },
  ];
  const qrVerifyRes = await verifyGoogleCookiesLiveViaHttp(qrChallengedCookies, 3000, async () => ({
    status: 200,
    headers: { get: () => null },
    text: async () => signedOutRememberedPayload,
  }));
  assert.equal(qrVerifyRes.ok, true);
  assert.equal(qrVerifyRes.loggedIn, false);
  assert.equal(qrVerifyRes.expired, true);
  assert.equal(qrVerifyRes.resultCode, "login_page");

  // Regression (#1106 beji.jihen@gmail.com resolved QR checkpoint):
  // When user logs in on a previously challenged row (`hasChallengedOrBlockedRow: true`) and has strong DBSC/Gmail post-auth
  // cookies (`__Secure-1PSIDTS`, `__Host-GMAIL_SCH_GML`), `acc[14]=1` MUST be accepted as loggedIn=true.
  const resolvedQrPayload =
    `)]}'\n["gaia.l.a.r",[["gaia.l.a",1,"Jihen Beji","beji.jihen@gmail.com","https://lh3.googleusercontent.com/a/default-user=s48",0,null,null,null,0,"100607176797674640610",null,null,null,1,null,"Jihen"]]]`;
  const resolvedQrCookies = [
    { domain: ".google.com", name: "__Secure-1PSID", value: "g.a0003gght4hRESOLVED_1PSID_1106" },
    { domain: ".google.com", name: "__Secure-1PSIDTS", value: "sidts-CjEB5H03P_FRESH_DBSC_1106" },
    { domain: ".google.com", name: "HSID", value: "HSID_1106" },
    { domain: ".google.com", name: "SSID", value: "SSID_1106" },
    { domain: ".google.com", name: "SAPISID", value: "SAPISID_1106" },
    { domain: "accounts.google.com", name: "LSID", value: "LSID_1106_VALID_TOKEN_123456" },
    { domain: "accounts.google.com", name: "SMSV", value: "ADHTe-SMSV_1106" },
    { domain: "mail.google.com", name: "__Host-GMAIL_SCH_GML", value: "GML_1106" },
  ];
  const resolvedQrRes = await verifyGoogleCookiesLiveViaHttp(
    resolvedQrCookies,
    3000,
    async () => ({
      status: 200,
      headers: { get: () => null },
      text: async () => resolvedQrPayload,
    }),
    { hasChallengedOrBlockedRow: true },
  );
  assert.equal(resolvedQrRes.ok, true);
  assert.equal(resolvedQrRes.loggedIn, true);
  assert.deepEqual(resolvedQrRes.verifiedEmails, ["beji.jihen@gmail.com"]);
});

test("syncProfilePlatformsToP0020IfChanged auto-matches unassigned Facebook, Gmail, Outlook, TikTok, and AI rows while strictly protecting already-assigned profiles and rejecting masked emails", async () => {
  const {
    verifyClaudeCookiesLiveViaHttp,
    syncProfilePlatformsToP0020IfChanged,
  } = require("./stealth-multiplatform-sync.cjs");

  // 1. Verify Claude organization email extraction
  const claudeVerify = await verifyClaudeCookiesLiveViaHttp(
    [{ name: "sessionKey", value: "sk-ant-sid01-VALID_SESSION_KEY_123456", domain: ".claude.ai", path: "/" }],
    2000,
    async () => ({
      status: 200,
      json: async () => [{ uuid: "c7103e46-9973-4476-bccc-49b415378c7c", name: "tonycontacto2017@gmail.com's Organization" }],
    }),
  );
  assert.equal(claudeVerify.ok, true);
  assert.equal(claudeVerify.loggedIn, true);
  assert.equal(claudeVerify.claudeOrgUuid, "c7103e46-9973-4476-bccc-49b415378c7c");
  assert.equal(claudeVerify.claudeVerifiedEmail, "tonycontacto2017@gmail.com");

  // 2. Mock global fetch to test full syncProfilePlatformsToP0020IfChanged auto-bind + anti-overwrite guards
  const origFetch = global.fetch;
  const origUrl = process.env.DATABOX_SUPABASE_URL;
  const origKey = process.env.DATABOX_SUPABASE_SERVICE_ROLE;

  process.env.DATABOX_SUPABASE_URL = "https://mock-p0020.local";
  process.env.DATABOX_SUPABASE_SERVICE_ROLE = "mock-service-key";

  const mockDbRows = [
    // Unassigned rows (browser: "") that SHOULD auto-bind to #0140
    { id: "row-fb-1", service: "Facebook", account: "100002878124288", browser: "", status: "error", stealth_status: "not_logged_in", stealth_snapshot: {} },
    { id: "row-gm-1", service: "Gmail", account: "alkeszjeno@gmail.com", browser: "", status: "check_phone", stealth_status: "challenged", stealth_snapshot: {} },
    { id: "row-ms-1", service: "Outlook", account: "ranklzedeenhm@hotmail.com", browser: "", status: "error", stealth_status: "not_logged_in", stealth_snapshot: {} },
    { id: "row-tt-1", service: "TikTok", account: "vitaminvuive01", browser: "", status: "not_logged_in", stealth_status: "not_logged_in", stealth_snapshot: {} },
    { id: "row-tw-1", service: "Twitter (X)", account: "racklorev1983St", browser: "", status: "not_logged_in", stealth_status: "not_logged_in", stealth_snapshot: {} },
    { id: "row-ig-1", service: "Instagram", account: "qzz0220@outlook.com", browser: "", status: "not_logged_in", stealth_status: "not_logged_in", stealth_snapshot: {} },
    { id: "row-ai-oai", service: "ChatGPT", account: "lovelinhhien@gmail.com", browser: "", status: "error", stealth_status: "not_logged_in", stealth_snapshot: {} },
    { id: "row-ai-cur", service: "Cursor", account: "a2g06@outlook.com", browser: "", status: "not_logged_in", stealth_status: "not_logged_in", stealth_snapshot: {} },
    { id: "row-ai-cld", service: "Claude", account: "tonycontacto2017@gmail.com", browser: "", status: "error", stealth_status: "not_logged_in", stealth_snapshot: {} },
    { id: "row-ai-grk", service: "Grok", account: "q3z4@outlook.com", browser: "", status: "not_logged_in", stealth_status: "not_logged_in", stealth_snapshot: {} },
    // CapCut unassigned row WITH exact capcut_user_id (should bind by UID even when email is masked)
    { id: "row-ai-cc-uid", service: "CapCut", account: "a1g23@outlook.com", browser: "", status: "not_logged_in", stealth_status: "not_logged_in", stealth_snapshot: { capcut_user_id: "7519063146671195144" } },
    // CapCut unassigned row WITHOUT capcut_user_id (must NOT bind by masked email a***3@outlook.com)
    { id: "row-ai-cc-masked", service: "CapCut", account: "a9993@outlook.com", browser: "", status: "not_logged_in", stealth_status: "not_logged_in", stealth_snapshot: {} },
    // Already-assigned Outlook row on #0465 (dylanatallon515@outlook.com) — MUST NEVER be overwritten to #0140!
    { id: "row-ms-assigned", service: "Outlook", account: "dylanatallon515@outlook.com", browser: "0465", status: "active", stealth_status: "logged_in", stealth_snapshot: { status: "logged_in" } },
    // Already-assigned Twitter (X) row on #1733 — MUST NEVER be overwritten to #0140!
    { id: "row-tw-assigned", service: "Twitter (X)", account: "roabravun1984An", browser: "1732", status: "active", stealth_status: "logged_in", stealth_snapshot: { status: "logged_in" } },
  ];

  const patchesById = new Map();

  try {
    global.fetch = async (url, init = {}) => {
      const u = String(url);
      const method = String(init.method || "GET").toUpperCase();

      if (u.includes("facebook.com/me")) {
        return {
          status: 302,
          headers: {
            get: (h) =>
              String(h || "").toLowerCase() === "location"
                ? "https://www.facebook.com/profile.php?id=100002878124288"
                : "",
          },
          text: async () => "",
        };
      }
      if (u.includes("accounts.google.com/ListAccounts")) {
        return {
          status: 200,
          headers: { get: () => "" },
          text: async () =>
            `)]}'\n["gaia.l.a.r",[["gaia.l.a",1,"Alkesz","alkeszjeno@gmail.com","https://lh3.googleusercontent.com/a/default",1,null,null,null,1,"111",null,null,null,1,1,"Alkesz"]]]`,
        };
      }
      if (u.includes("login.live.com/login.srf")) {
        return {
          status: 200,
          headers: { get: () => "" },
          text: async () => '<title>Continue</title><form id="fmHF" action="https://outlook.live.com/owa/?nlp=1"></form>',
        };
      }
      if (u.includes("tiktok.com/passport/web/account/info")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            message: "success",
            data: { user_id_str: "7132863329202521093", username: "vitaminvuive01" },
          }),
        };
      }
      if (u.includes("api.x.com/1.1/account/settings.json")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ screen_name: "racklorev1983St" }),
        };
      }
      if (u.includes("instagram.com/accounts/edit/")) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => "" },
          text: async () => '{"username":"qzz0220_ig","email":"qzz0220@outlook.com"}',
        };
      }
      if (u.includes("chatgpt.com/api/auth/session")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            user: { id: "user-ypXXcq2t8lhnaxKL1vnChof5", email: "lovelinhhien@gmail.com" },
            accessToken: "eyJ_mock_access_token",
          }),
        };
      }
      if (u.includes("cursor.com/api/auth/me")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            sub: "user_01JXRDXYC24H0RS2T08R215ZN4",
            email: "a2g06@outlook.com",
            email_verified: true,
          }),
        };
      }
      if (u.includes("claude.ai/api/organizations")) {
        return {
          status: 200,
          ok: true,
          json: async () => [{ uuid: "c7103e46-9973-4476-bccc-49b415378c7c", name: "tonycontacto2017@gmail.com's Organization" }],
        };
      }
      if (u.includes("grok.com/rest/auth/get-user")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ userId: "xai-uid-999", email: "q3z4@outlook.com" }),
        };
      }
      if (u.includes("capcut.com/passport/web/account/info")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            message: "success",
            data: { user_id_str: "7519063146671195144", email: "a***3@outlook.com", connects: [] },
          }),
        };
      }
      if (u.includes("/auth/v1/admin/users")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ users: [{ id: "00000000-0000-0000-0000-000000000001", email: "czpgo@outlook.com" }] }),
        };
      }
      if (u.includes("/rest/v1/twofa_accounts")) {
        if (method === "PATCH") {
          const idMatch = u.match(/[?&]id=eq\.([^&]+)/);
          const id = idMatch ? decodeURIComponent(idMatch[1]) : "";
          const body = JSON.parse(String(init.body || "{}"));
          patchesById.set(id, body);
          return { status: 200, ok: true, json: async () => [] };
        }
        const decoded = decodeURIComponent(u);
        if (decoded.includes("browser=in.")) {
          return { status: 200, ok: true, json: async () => [] };
        }
        let filtered = [...mockDbRows];
        const svcMatch = decoded.match(/service=ilike\.([^&]+)/i);
        if (svcMatch) {
          const targetSvc = svcMatch[1].toLowerCase();
          filtered = filtered.filter((r) => r.service.toLowerCase() === targetSvc);
        }
        const eqAccMatch = decoded.match(/account=eq\.([^&]+)/i);
        if (eqAccMatch) {
          const targetAcc = eqAccMatch[1].toLowerCase();
          filtered = filtered.filter((r) => r.account.toLowerCase() === targetAcc);
        }
        const inAccMatch = decoded.match(/account=in\.\(([^)]+)\)/i);
        if (inAccMatch) {
          const items = inAccMatch[1]
            .split(",")
            .map((s) => s.replace(/^"|"$/g, "").toLowerCase());
          filtered = filtered.filter((r) => items.includes(r.account.toLowerCase()));
        }
        if (decoded.includes("or=(browser.is.null,browser.eq.)")) {
          filtered = filtered.filter((r) => !r.browser);
        }
        return { status: 200, ok: true, json: async () => filtered };
      }
      return { status: 404, ok: false, json: async () => ({}) };
    };

    const testCookies = [
      // Facebook
      { name: "c_user", value: "100002878124288", domain: ".facebook.com", path: "/" },
      { name: "xs", value: "44%3Avalid_fb_xs_token%3A2%3A1700000000", domain: ".facebook.com", path: "/" },
      // Gmail
      { name: "SID", value: "g.a000_VALID_GOOGLE_SID_TOKEN_123456", domain: ".google.com", path: "/" },
      { name: "__Secure-1PSID", value: "g.a000_VALID_GOOGLE_SID_TOKEN_123456", domain: ".google.com", path: "/" },
      { name: "SAPISID", value: "VALID_GOOGLE_SAPISID_TOKEN_123456", domain: ".google.com", path: "/" },
      // Outlook (contains BOTH unassigned ranklzedeenhm@hotmail.com AND already-assigned dylanatallon515@outlook.com)
      { name: "RPSSecAuth", value: "VALID_RPS_SEC_AUTH_TOKEN_123456", domain: "login.live.com", path: "/" },
      { name: "MSPAuth", value: "VALID_MSP_AUTH_TOKEN_123456", domain: ".live.com", path: "/" },
      { name: "MSPPre", value: "ranklzedeenhm%40hotmail.com%7c12345", domain: ".live.com", path: "/" },
      { name: "JSHP", value: "3$dylanatallon515%40outlook.com$dylan$tallon", domain: ".live.com", path: "/" },
      // TikTok (24-64 hex chars required by verifyTikTokCookiesLiveViaHttp)
      { name: "sessionid", value: "a1b2c3d4e5f60123456789abcdef0123", domain: ".tiktok.com", path: "/" },
      { name: "sid_tt", value: "a1b2c3d4e5f60123456789abcdef0123", domain: ".tiktok.com", path: "/" },
      // ChatGPT
      { name: "__Secure-next-auth.session-token", value: "eyJ".padEnd(520, "a"), domain: ".chatgpt.com", path: "/" },
      // Cursor
      { name: "WorkosCursorSessionToken", value: "user_01JXRDXYC24H0RS2T08R215ZN4%3A%3AeyJ_valid_cursor_jwt_token_123456", domain: ".cursor.com", path: "/" },
      // Claude
      { name: "sessionKey", value: "sk-ant-sid01-VALID_SESSION_KEY_123456", domain: ".claude.ai", path: "/" },
      // Grok
      { name: "sso", value: "eyJ_valid_grok_sso_token_".padEnd(90, "b"), domain: ".grok.com", path: "/" },
      //CapCut
      { name: "sessionid", value: "valid_capcut_session_id_123456", domain: ".capcut.com", path: "/" },
      // Twitter (X)
      { name: "auth_token", value: "a1b2c3d4e5f60123456789abcdef0123456789ab", domain: ".x.com", path: "/" },
      { name: "ct0", value: "csrf_token_123456", domain: ".x.com", path: "/" },
      // Instagram
      { name: "sessionid", value: "68291048291%3Avalid_ig_session%3A12", domain: ".instagram.com", path: "/" },
      { name: "ds_user_id", value: "68291048291", domain: ".instagram.com", path: "/" },
    ];

    const syncRes = await syncProfilePlatformsToP0020IfChanged({
      userDataDir: "",
      profileCode: "0140",
      profileId: "prof-0140",
      cookiePairs: testCookies,
      source: "p0003_live_nav",
      liveCdp: false,
      debugPort: 0,
    });

    assert.equal(syncRes.ok, true);

    // Every unassigned verified account MUST be auto-bound to "0140" and promoted to status="active", stealth="logged_in"
    for (const expectedId of [
      "row-fb-1",
      "row-gm-1",
      "row-ms-1",
      "row-tt-1",
      "row-tw-1",
      "row-ig-1",
      "row-ai-oai",
      "row-ai-cur",
      "row-ai-cld",
      "row-ai-grk",
      "row-ai-cc-uid",
    ]) {
      const patch = patchesById.get(expectedId);
      assert.ok(patch, `Expected PATCH for ${expectedId}`);
      assert.equal(patch.browser, "0140", `Expected browser="0140" for ${expectedId}`);
      assert.equal(patch.status, "active", `Expected status="active" for ${expectedId}`);
      assert.equal(patch.stealth_snapshot?.status, "logged_in", `Expected logged_in for ${expectedId}`);
    }

    // CRITICAL ANTI-OVERWRITE GUARD: already-assigned row on #0465 MUST NOT be patched or stolen onto #0140
    assert.equal(patchesById.has("row-ms-assigned"), false, "Must NEVER overwrite already-assigned profile #0465");
    assert.equal(patchesById.has("row-tw-assigned"), false, "Must NEVER overwrite already-assigned Twitter profile #1732");

    // CRITICAL ANTI-FALSE-POSITIVE GUARD: CapCut row without matching capcut_user_id MUST NOT bind on masked email
    assert.equal(patchesById.has("row-ai-cc-masked"), false, "Must NEVER bind CapCut row on masked email without UID match");
  } finally {
    global.fetch = origFetch;
    if (origUrl === undefined) delete process.env.DATABOX_SUPABASE_URL;
    else process.env.DATABOX_SUPABASE_URL = origUrl;
    if (origKey === undefined) delete process.env.DATABOX_SUPABASE_SERVICE_ROLE;
    else process.env.DATABOX_SUPABASE_SERVICE_ROLE = origKey;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. AI Services (`Cursor`, `ChatGPT`, `Claude`, `Grok`) `account_mismatch`
//     Detection + Anti-False-Positive Guards (`mail_recover` / Bound UID) (`ok 2`)
// ─────────────────────────────────────────────────────────────────────────────
test("syncProfilePlatformsToP0020IfChanged flags account_mismatch when AI API email differs from row.account, while allowing mail_recover and already-bound UID", async () => {
  const { syncProfilePlatformsToP0020IfChanged } = require("./stealth-multiplatform-sync.cjs");

  const origFetch = global.fetch;
  const origUrl = process.env.DATABOX_SUPABASE_URL;
  const origKey = process.env.DATABOX_SUPABASE_SERVICE_ROLE;
  process.env.DATABOX_SUPABASE_URL = "http://127.0.0.1:59999";
  process.env.DATABOX_SUPABASE_SERVICE_ROLE = "test-service-role-key";

  const mockRowsForProfile = [
    // 4 rows where the user logged into a DIFFERENT email on the profile -> MUST flag `account_mismatch`
    { id: "mm-cur", service: "Cursor", account: "expected.cursor@outlook.com", browser: "0250", status: "active", stealth_status: "not_logged_in", stealth_snapshot: { status: "not_logged_in" } },
    { id: "mm-oai", service: "ChatGPT", account: "expected.chatgpt@gmail.com", browser: "0250", status: "active", stealth_status: "not_logged_in", stealth_snapshot: { status: "not_logged_in" } },
    { id: "mm-cld", service: "Claude", account: "expected.claude@gmail.com", browser: "0250", status: "active", stealth_status: "not_logged_in", stealth_snapshot: { status: "not_logged_in" } },
    { id: "mm-grk", service: "Grok", account: "expected.grok@outlook.com", browser: "0250", status: "active", stealth_status: "not_logged_in", stealth_snapshot: { status: "not_logged_in" } },
    // Anti-false-positive #1: row where API email matches `mail_recover` -> MUST succeed (`logged_in`)
    { id: "ok-cur-rec", service: "Cursor", account: "alias.cursor@outlook.com", mail_recover: "actual.logged.in@outlook.com", browser: "0250", status: "active", stealth_status: "not_logged_in", stealth_snapshot: { status: "not_logged_in" } },
    // Anti-false-positive #2: Claude row already bound to the exact `claude_org_uuid` -> MUST succeed (`logged_in`)
    { id: "ok-cld-uid", service: "Claude", account: "team.member@gmail.com", browser: "0250", status: "active", stealth_status: "not_logged_in", stealth_snapshot: { status: "not_logged_in", claude_org_uuid: "c7103e46-9973-4476-bccc-49b415378c7c" } },
  ];

  const patchesById = new Map();

  try {
    global.fetch = async (url, init = {}) => {
      const u = String(url);
      const method = String(init.method || "GET").toUpperCase();
      if (u.includes("/auth/v1/admin/users")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ users: [{ id: "00000000-0000-0000-0000-000000000001", email: "czpgo@outlook.com" }] }),
        };
      }
      if (u.includes("cursor.com/api/auth/me")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            sub: "user_01JXRDXYC24H0RS2T08R215ZN4",
            email: "actual.logged.in@outlook.com",
            email_verified: true,
          }),
        };
      }
      if (u.includes("chatgpt.com/api/auth/session")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            user: { id: "user-wrongChatGptUid123456", email: "wrong.chatgpt@gmail.com" },
            accessToken: "eyJ_mock_access_token",
          }),
        };
      }
      if (u.includes("claude.ai/api/organizations")) {
        return {
          status: 200,
          ok: true,
          json: async () => [{ uuid: "c7103e46-9973-4476-bccc-49b415378c7c", name: "admin.owner@gmail.com's Organization" }],
        };
      }
      if (u.includes("grok.com/rest/auth/get-user")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ userId: "xai-wrong-uid-999", email: "wrong.grok@outlook.com" }),
        };
      }
      if (u.includes("/rest/v1/twofa_accounts")) {
        if (method === "PATCH") {
          const idMatch = u.match(/[?&]id=eq\.([^&]+)/);
          const id = idMatch ? decodeURIComponent(idMatch[1]) : "";
          const body = JSON.parse(String(init.body || "{}"));
          patchesById.set(id, body);
          return { status: 200, ok: true, json: async () => [] };
        }
        const decoded = decodeURIComponent(u);
        if (decoded.includes("browser=in.")) {
          return { status: 200, ok: true, json: async () => mockRowsForProfile };
        }
        return { status: 200, ok: true, json: async () => [] };
      }
      return { status: 404, ok: false, json: async () => ({}) };
    };

    const testCookies = [
      { name: "__Secure-next-auth.session-token", value: "eyJ".padEnd(520, "a"), domain: ".chatgpt.com", path: "/" },
      { name: "WorkosCursorSessionToken", value: "user_01JXRDXYC24H0RS2T08R215ZN4%3A%3AeyJ_valid_cursor_jwt_token_123456", domain: ".cursor.com", path: "/" },
      { name: "sessionKey", value: "sk-ant-sid01-VALID_SESSION_KEY_123456", domain: ".claude.ai", path: "/" },
      { name: "sso", value: "eyJ_valid_grok_sso_token_".padEnd(90, "b"), domain: ".grok.com", path: "/" },
    ];

    const syncRes = await syncProfilePlatformsToP0020IfChanged({
      userDataDir: "",
      profileCode: "0250",
      profileId: "prof-0250",
      cookiePairs: testCookies,
      source: "p0003_live_nav",
      liveCdp: true,
      debugPort: 0,
    });

    assert.equal(syncRes.ok, true);

    // Mismatched rows MUST be flagged as `not_logged_in` + `result_code: "account_mismatch"` + `actual_session_account`
    for (const [id, expectedActual] of [
      ["mm-cur", "actual.logged.in@outlook.com"],
      ["mm-oai", "wrong.chatgpt@gmail.com"],
      ["mm-cld", "admin.owner@gmail.com"],
      ["mm-grk", "wrong.grok@outlook.com"],
    ]) {
      const p = patchesById.get(id);
      assert.ok(p, `Expected PATCH for mismatched row ${id}`);
      assert.equal(p.stealth_snapshot?.status, "not_logged_in", `Expected not_logged_in for ${id}`);
      assert.equal(p.stealth_snapshot?.result_code, "account_mismatch", `Expected account_mismatch for ${id}`);
      assert.equal(p.stealth_snapshot?.actual_session_account, expectedActual, `Expected actual_session_account for ${id}`);
      assert.equal(p.stealth_snapshot?.mismatch, true, `Expected mismatch=true for ${id}`);
    }

    // Anti-false-positive rows MUST succeed (`logged_in`)
    for (const okId of ["ok-cur-rec", "ok-cld-uid"]) {
      const p = patchesById.get(okId);
      assert.ok(p, `Expected PATCH for valid row ${okId}`);
      assert.equal(p.stealth_snapshot?.status, "logged_in", `Expected logged_in for ${okId}`);
      assert.equal(p.stealth_snapshot?.mismatch, false, `Expected mismatch=false for ${okId}`);
    }
  } finally {
    global.fetch = origFetch;
    if (origUrl === undefined) delete process.env.DATABOX_SUPABASE_URL;
    else process.env.DATABOX_SUPABASE_URL = origUrl;
    if (origKey === undefined) delete process.env.DATABOX_SUPABASE_SERVICE_ROLE;
    else process.env.DATABOX_SUPABASE_SERVICE_ROLE = origKey;
  }
});

test("areComparableEmailsEqual and matchServiceCookiePairs treat dotted/undotted Gmail addresses as identical", () => {
  const {
    areComparableEmailsEqual,
    matchServiceCookiePairs,
  } = require("./stealth-multiplatform-sync.cjs");

  assert.equal(areComparableEmailsEqual("krispy155@gmail.com", "krispy.155@gmail.com"), true);
  assert.equal(areComparableEmailsEqual("lucia.gavi@googlemail.com", "luciagavi@gmail.com"), true);
  assert.equal(areComparableEmailsEqual("s1.z82@outlook.com", "s1z82@outlook.com"), false);
  assert.equal(areComparableEmailsEqual("user1@gmail.com", "user2@gmail.com"), false);

  const googlePairs = [
    { domain: ".google.com", name: "SID", value: "g.a0001_valid_sid_cookie_value_12345" },
    { domain: ".google.com", name: "SAPISID", value: "sapisid_valid_cookie_value_123456" },
  ];
  const dotMatch = matchServiceCookiePairs("Gmail", googlePairs, null, {
    expectedAccount: "krispy155@gmail.com",
    verifiedGoogleEmails: ["krispy.155@gmail.com"],
  });
  assert.equal(dotMatch.loggedIn, true);
  assert.notEqual(dotMatch.resultCode, "account_mismatch");

  const diffMatch = matchServiceCookiePairs("Gmail", googlePairs, null, {
    expectedAccount: "krispy155@gmail.com",
    verifiedGoogleEmails: ["other.user@gmail.com"],
  });
  assert.equal(diffMatch.loggedIn, false);
  assert.equal(diffMatch.resultCode, "account_mismatch");
  assert.equal(diffMatch.actualAccount, "other.user@gmail.com");
});

test("classifyGoogleLiveCdpTargets scopes /restrictions/47 (GCP) vs /restrictions/54 (Gmail) so Gmail/Google One/YouTube do not flip to Appeal on GCP restrictions", () => {
  const {
    classifyGoogleLiveCdpTargets,
    doesGoogleTargetRestrictionApplyToService,
    shouldPreserveChallengedState,
  } = require("./stealth-multiplatform-sync.cjs");

  const gcpAppealTarget = classifyGoogleLiveCdpTargets([
    {
      url: "https://myaccount.google.com/restrictions/47/appeal?ai=47&hl=en&authuser=0&utm_source=OGB&utm_medium=act&gar=WzJd",
      title: "0392 — Appeal submitted",
    },
  ]);
  assert.equal(gcpAppealTarget?.rowStatus, "appeal");
  assert.equal(gcpAppealTarget?.resultCode, "disabled_appeal_submitted");
  assert.equal(gcpAppealTarget?.restrictedServiceLabel, "Google Cloud Platform");
  assert.match(String(gcpAppealTarget?.note || ""), /Google Cloud Platform appeal submitted/);
  assert.equal(doesGoogleTargetRestrictionApplyToService(gcpAppealTarget, "gmail"), false);
  assert.equal(doesGoogleTargetRestrictionApplyToService(gcpAppealTarget, "google one"), false);
  assert.equal(doesGoogleTargetRestrictionApplyToService(gcpAppealTarget, "youtube"), false);
  assert.equal(doesGoogleTargetRestrictionApplyToService(gcpAppealTarget, "google cloud"), true);

  const gmailAppealTarget = classifyGoogleLiveCdpTargets([
    {
      url: "https://myaccount.google.com/restrictions/54/appeal?ai=54&hl=en",
      title: "0320 — Appeal submitted",
    },
  ]);
  assert.equal(gmailAppealTarget?.rowStatus, "appeal");
  assert.equal(gmailAppealTarget?.restrictedServiceLabel, "Gmail");
  assert.match(String(gmailAppealTarget?.note || ""), /Gmail appeal submitted/);
  assert.equal(doesGoogleTargetRestrictionApplyToService(gmailAppealTarget, "gmail"), true);
  assert.equal(doesGoogleTargetRestrictionApplyToService(gmailAppealTarget, "gmail edu"), true);
  assert.equal(doesGoogleTargetRestrictionApplyToService(gmailAppealTarget, "google one"), false);
  assert.equal(doesGoogleTargetRestrictionApplyToService(gmailAppealTarget, "youtube"), false);

  const uplevelingGmailTarget = classifyGoogleLiveCdpTargets([
    {
      url: "https://accounts.google.com/uplevelingstep/selection?continue=https%3A%2F%2Fmyaccount.google.com%2Frestrictions%2F54%2Fappeal%3Fhl%3Den&flowName=GlifWebSignIn",
      title: "Verify your info to continue",
    },
  ]);
  assert.equal(uplevelingGmailTarget?.rowStatus, "checkpoint_qr");
  assert.equal(uplevelingGmailTarget?.resultCode, "checkpoint_qr");
  assert.equal(uplevelingGmailTarget?.restrictedServiceLabel, "Gmail");
  assert.equal(doesGoogleTargetRestrictionApplyToService(uplevelingGmailTarget, "gmail"), true);
  assert.equal(doesGoogleTargetRestrictionApplyToService(uplevelingGmailTarget, "google one"), false);
  assert.equal(doesGoogleTargetRestrictionApplyToService(uplevelingGmailTarget, "youtube"), false);

  const workspaceAdminDisabledTarget = classifyGoogleLiveCdpTargets([
    {
      url: "https://accounts.google.com/v3/signin/speedbump/disabled/explanation?flowName=GlifWebSignIn",
      title: "Your account has been disabled",
      bodyText: "Your Google Account was disabled by your Google Workspace administrator. Contact your administrator for help.",
    },
  ]);
  assert.equal(workspaceAdminDisabledTarget?.rowStatus, "disable");
  assert.equal(workspaceAdminDisabledTarget?.resultCode, "account_disabled");
  assert.equal(workspaceAdminDisabledTarget?.disabledReason, "workspace_admin_disabled");

  const falseGcpAppealOnGmailRow = {
    service: "Gmail",
    status: "appeal",
    stealth_snapshot: {
      status: "challenged",
      result_code: "disabled_appeal_submitted",
      evidence:
        "Google:disabled_appeal_submitted url=https://myaccount.google.com/restrictions/47/appeal?ai=47&hl=en",
    },
  };
  assert.equal(
    shouldPreserveChallengedState(falseGcpAppealOnGmailRow, true, {
      isLiveWindow: false,
      hasVerifiedGoogleLiveTab: false,
      hasVerifiedGoogleAuth: true,
    }),
    false,
  );
});

test("isAuthenticatedGoogleAppUrl and classifyGoogleLiveCdpTargets ignore post-login myaccount.google.com step-up re-auth challenges (#0168 farid.khatereh@gmail.com)", () => {
  const {
    isAuthenticatedGoogleAppUrl,
    classifyGoogleLiveCdpTargets,
  } = require("./stealth-multiplatform-sync.cjs");

  assert.equal(
    isAuthenticatedGoogleAppUrl(
      "https://myaccount.google.com/signinoptions/password?continue=https%3A%2F%2Fmyaccount.google.com%2F%3Fhl%3Dvi",
    ),
    true,
  );
  assert.equal(
    isAuthenticatedGoogleAppUrl(
      "https://myaccount.google.com/security-checkup/2?continue=https%3A%2F%2Faccounts.google.com%2FServiceLogin",
    ),
    true,
  );
  assert.equal(
    isAuthenticatedGoogleAppUrl(
      "https://accounts.google.com/v3/signin/speedbump/changepassword/changepasswordnudge?TL=abc",
    ),
    true,
  );

  // Step-Up Re-Auth challenge with live Google auth cookies should NOT demote to check_phone / checkpoint_qr
  const stepUpDpWithCookies = classifyGoogleLiveCdpTargets(
    [
      {
        url: "https://accounts.google.com/v3/signin/challenge/dp?TL=AAxq8nvXG&authuser=0&cid=3&continue=https%3A%2F%2Fmyaccount.google.com%2Fsigninoptions%2Fpassword%3Fcontinue%3Dhttps%3A%2F%2Fmyaccount.google.com%2F%3Fhl%253Dvi",
        title: "0168 — Đăng nhập - Tài khoản Google",
      },
    ],
    { hasGoogleAuthCookies: true },
  );
  assert.equal(stepUpDpWithCookies, null);

  // Without Google auth cookies, /challenge/dp is classified with challengeType="device_prompt"
  const unauthedDp = classifyGoogleLiveCdpTargets(
    [
      {
        url: "https://accounts.google.com/v3/signin/challenge/dp/presend?TL=AAxq8nvoTZw&checkConnection=youtube",
        title: "Khôi phục tài khoản",
      },
    ],
    { hasGoogleAuthCookies: false },
  );
  assert.equal(unauthedDp?.rowStatus, "check_phone");
  assert.equal(unauthedDp?.resultCode, "phone_sms_required");
  assert.equal(unauthedDp?.challengeType, "device_prompt");
});

test("isAuthenticatedMicrosoftAppUrl, classifyMicrosoftLiveCdpTargets, and verifyMicrosoftCookiesLiveViaHttp protect Microsoft Step-Up Re-Auth and /proofs/remind (ok 2)", async () => {
  const {
    isAuthenticatedMicrosoftAppUrl,
    classifyMicrosoftLiveCdpTargets,
    verifyMicrosoftCookiesLiveViaHttp,
  } = require("./stealth-multiplatform-sync.cjs");

  assert.equal(
    isAuthenticatedMicrosoftAppUrl("https://account.live.com/names/manage?mkt=en-US"),
    true,
  );
  assert.equal(
    isAuthenticatedMicrosoftAppUrl(
      "https://account.live.com/proofs/remind?mkt=EN-US&uiflavor=web&id=292841&mpcxt=CATB&sn=1&ru=https://login.live.com/login.srf",
    ),
    true,
  );
  assert.equal(
    isAuthenticatedMicrosoftAppUrl("https://outlook.live.com/mail/0/?ru=https://login.live.com/login.srf"),
    true,
  );

  // Step-Up Re-Auth on account.live.com/proofs/Verify with Microsoft auth cookies or uiflavor=host / ru=account.live.com must NOT demote to check_phone
  assert.equal(
    classifyMicrosoftLiveCdpTargets(
      [
        {
          url: "https://account.live.com/proofs/Verify?mkt=EN-US&uiflavor=host&client_id=0000000048170EF2&ru=https%3A%2F%2Faccount.live.com%2Fnames%2Fmanage",
          title: "Verify your identity",
        },
      ],
      { hasMicrosoftAuthCookies: false },
    ),
    null,
  );
  assert.equal(
    classifyMicrosoftLiveCdpTargets(
      [{ url: "https://account.live.com/proofs/Verify", title: "Verify your identity" }],
      { hasMicrosoftAuthCookies: true },
    ),
    null,
  );
  // Hard Abuse lockout still returns error/account_disabled even when cookies exist
  const abuseWithCookies = classifyMicrosoftLiveCdpTargets(
    [{ url: "https://account.live.com/Abuse?mkt=en-US", title: "Your account has been locked" }],
    { hasMicrosoftAuthCookies: true },
  );
  assert.equal(abuseWithCookies?.rowStatus, "error");
  assert.equal(abuseWithCookies?.resultCode, "account_disabled");

  // verifyMicrosoftCookiesLiveViaHttp treats /proofs/remind as loggedIn: true
  const remindVerify = await verifyMicrosoftCookiesLiveViaHttp(
    [
      { name: "WLSSC", value: "valid_wlssc_cookie_token_1234567890", domain: ".live.com" },
      { name: "MSPPre", value: "lykamekerisiri%40hotmail.com|123", domain: ".live.com" },
    ],
    2000,
    async () => ({
      status: 200,
      headers: { get: () => null },
      text: async () =>
        '<form id="fmHF" action="https://account.live.com/proofs/remind?mkt=EN-US&uiflavor=web&id=292841&mpcxt=CATB&sn=1&ru=https://login.live.com"></form>',
    }),
  );
  assert.equal(remindVerify.ok, true);
  assert.equal(remindVerify.loggedIn, true);
  assert.equal(remindVerify.resultCode, "outlook_cookies");
});






