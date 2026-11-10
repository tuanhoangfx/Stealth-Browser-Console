"use strict";

/**
 * Multi-Platform Cookie & Session Status Synchronizer (`P0003` <-> `P0020` & Ecosystem Vaults).
 *
 * Implements:
 *   1. Change-Only Ecosystem Vault Sync (`ok 3`):
 *      Inspects live `context.cookies()` (in-memory plaintext) when a user or agent logs in on P0003,
 *      compares the primary session token (`c_user`, `SID`, `RPSSecAuth`, `sessionid`, `sessionKey`, etc.)
 *      against `Tool/P0002-Social-Hub/data/*-cookie-vault.json`, and writes to disk ONLY when a new login
 *      or changed session token is detected (0 redundant disk writes).
 *   2. Automatic Multi-Platform Login Status Sync (`P0003` -> `P0020` `twofa_accounts.stealth_snapshot` — `ok 1`):
 *      Detects authenticated cookies across Mail (`Gmail`, `Outlook`), Social (`Facebook`, `TikTok`, `YouTube`),
 *      and 45+ Web Services (`ChatGPT`, `Claude`, `Cursor`, `CapCut`, `ElevenLabs`, `Grok`, `Google One`, etc.)
 *      both live on navigation settle and on profile close, patching `twofa_accounts` ONLY when `stealth_snapshot.status`
 *      differs from actual cookie state (while preserving `challenged` / checkpoint states when signed out).
 *   3. Full Disk -> P0020 Reconciler (`ok 2`):
 *      Scans all profile SQLite `Default/Network/Cookies` databases on disk and reconciles all `twofa_accounts`
 *      rows in P0020 (including healing stale `running` or `unknown` rows).
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  resolveVaultConfig,
  resolveScopedVaultUserId,
} = require("./twofa-vault-bridge.cjs");

// Hot-reload propagation: when api-routes.cjs evicts stealth-multiplatform-sync.cjs from require.cache,
// also evict ./multiplatform-sync/*.cjs sub-modules so fresh code loads coherently.
if (globalThis._p0003MultiplatformSyncLoadedOnce) {
  const subPrefix = path.join(__dirname, "multiplatform-sync") + path.sep;
  for (const ck of Object.keys(require.cache)) {
    if (ck.startsWith(subPrefix)) {
      delete require.cache[ck];
    }
  }
}
globalThis._p0003MultiplatformSyncLoadedOnce = true;

const {
  onStealthLiveSyncEvent,
  emitStealthLiveSyncEvent,
  SERVICE_COOKIE_MATCHERS,
  resolveServiceMatcher,
  readProfileSpaStorageSummary,
  matchServiceSpaStorage,
  isProfileStorageModifiedWithinHours,
  normalizeComparableEmail,
  areComparableEmailsEqual,
  buildMailCookieTelemetryMetadata,
  resolveServicePasswordEcosystem,
  canPropagatePasswordBetweenServices,
} = require("./multiplatform-sync/service-cookie-matchers.cjs");

const {
  fetchLiveCdpCookiesByPort,
  setLiveCdpCookiesByPort,
  fetchLiveCdpPageTargetsByPort,
  autoSkipGoogleSpeedbumpTargets,
  autoHealCompletedGoogleChallengeTabs,
  isAuthenticatedFacebookAppUrl,
  isAuthenticatedTikTokAppUrl,
  autoHealCompletedSocialChallengeTabs,
  classifyFacebookLiveCdpTargets,
  isGoogleFamilyService,
  GOOGLE_RESTRICTION_ID_MAP,
  resolveGoogleRestrictionInfo,
  resolveGoogleRestrictionTargetServices,
  doesGoogleTargetRestrictionApplyToService,
  isAuthenticatedGoogleAppUrl,
  classifyGoogleLiveCdpTargets,
  REVOKED_GOOGLE_AUTH_COOKIE_NAMES,
  purgeRevokedGoogleAuthCookiesForProfile,
  isMicrosoftFamilyService,
  isAuthenticatedMicrosoftAppUrl,
  classifyMicrosoftLiveCdpTargets,
  autoHealCompletedMicrosoftChallengeTabs,
  REVOKED_MICROSOFT_AUTH_COOKIE_NAMES,
  purgeRevokedMicrosoftAuthCookiesForProfile,
  classifyClaudeLiveCdpTargets,
} = require("./multiplatform-sync/live-cdp-targets.cjs");

const {
  verifyFacebookCookiesLiveViaHttp,
  verifyTikTokCookiesLiveViaHttp,
  verifyGoogleCookiesLiveViaHttp,
  verifyMicrosoftCookiesLiveViaHttp,
  verifyTwitterCookiesLiveViaHttp,
  verifyInstagramCookiesLiveViaHttp,
  verifyClaudeCookiesLiveViaHttp,
} = require("./multiplatform-sync/http-cookie-verifiers.cjs");

const {
  resolveProfileDpapiMasterKey,
  decryptChromiumCookieValue,
  matchServiceCookiePairs,
  readProfileDiskCookiePairs,
} = require("./multiplatform-sync/disk-sqlite-cookies.cjs");

const {
  syncLiveCdpCookiesToVaultIfChanged,
  syncLiveContextCookiesToVaultIfChanged,
} = require("./multiplatform-sync/cookie-vault-sync.cjs");

const {
  isTwitterFamilyService,
  discoverAndAutoBindUnassignedP0020Rows,
  verifyRowPlatformAndAiSession,
} = require("./multiplatform-sync/p0020-row-verifier.cjs");

const {
  STALE_NON_LOGGED_IN_SPECIFIC_LABELS,
  NON_OVERRIDABLE_RESTRICTED_RESULT_CODES,
  isFacebookRowInCheckpointOrDisabled,
  shouldPreserveChallengedState,
  buildP0020RowSnapshotAndPatch,
} = require("./multiplatform-sync/p0020-snapshot-builder.cjs");

const {
  markStealthProfileLaunchWindowState,
  resolveStealthRowLaunchLogDecision,
  formatStealthSessionLogMessage,
  filterActivityTargetRowsOnProfile,
  appendStealthSessionLogToP0020Row,
  syncProfileActivityLogToP0020Rows,
  syncProfileWindowLiveCdpStateToP0020,
} = require("./multiplatform-sync/session-activity-logs.cjs");

const {
  healStaleRunningP0020Rows,
  reconcileAllProfilesDiskCookiesToP0020,
  healStaleChallengedAndErrorP0020Rows,
  startStaleRunningP0020Healer,
  hydrateProfileCookiesFromP0020Vault,
} = require("./multiplatform-sync/p0020-fleet-healers.cjs");

let _diskInspectWorker = null;
let _diskInspectReqSeq = 0;
const _diskInspectPending = new Map();
if (globalThis._p0003DiskInspectWorker) {
  try {
    void globalThis._p0003DiskInspectWorker.terminate();
  } catch {
    /* ignore */
  }
  globalThis._p0003DiskInspectWorker = null;
}

/**
 * Offloads synchronous SQLite `DatabaseSync` (`Default/Network/Cookies`) and LevelDB (`Default/Local Storage/leveldb`)
 * disk inspection out of the Electron Main Thread (`ok 1`) so closing 40 headless browsers never blocks UI or `:3999`.
 */
function runDiskInspectInElectronWorker({ userDataDir, profileCode, needCookies = false, needSpa = true }) {
  const { Worker, isMainThread } = require("node:worker_threads");
  if (!process.versions?.electron || !isMainThread || __dirname.includes(".asar")) {
    return null;
  }
  try {
    if (!_diskInspectWorker) {
      const workerCode = `
        const { parentPort } = require("node:worker_threads");
        const path = require("node:path");
        const guardMod = require(${JSON.stringify(path.join(__dirname, "profile-cookie-guard.cjs"))});
        const syncMod = require(${JSON.stringify(path.join(__dirname, "stealth-multiplatform-sync.cjs"))});
        parentPort.on("message", (msg) => {
          const { id, userDataDir, profileCode, needCookies, needSpa } = msg || {};
          try {
            let decrypted = null;
            let disk = null;
            if (needCookies && userDataDir) {
              decrypted = guardMod.extractDecryptedCookiesFromProfileSqlite(userDataDir);
              if (!decrypted?.ok || !decrypted?.cookies?.length) {
                disk = syncMod.readProfileDiskCookiePairs(userDataDir, { profileCode });
              }
            }
            const spaSummary = needSpa && userDataDir ? syncMod.readProfileSpaStorageSummary(userDataDir) : null;
            parentPort.postMessage({ id, ok: true, decrypted, disk, spaSummary });
          } catch (err) {
            parentPort.postMessage({ id, ok: false, error: err?.message || String(err) });
          }
        });
      `;
      _diskInspectWorker = new Worker(workerCode, { eval: true });
      globalThis._p0003DiskInspectWorker = _diskInspectWorker;
      if (typeof _diskInspectWorker.unref === "function") _diskInspectWorker.unref();
      _diskInspectWorker.on("message", (res) => {
        const cb = _diskInspectPending.get(res?.id);
        if (cb) {
          _diskInspectPending.delete(res.id);
          cb(res);
        }
      });
      _diskInspectWorker.on("error", () => {
        _diskInspectWorker = null;
        for (const [, cb] of _diskInspectPending.entries()) cb({ ok: false });
        _diskInspectPending.clear();
      });
      _diskInspectWorker.on("exit", () => {
        _diskInspectWorker = null;
        for (const [, cb] of _diskInspectPending.entries()) cb({ ok: false });
        _diskInspectPending.clear();
      });
    }
    const id = (_diskInspectReqSeq = (_diskInspectReqSeq + 1) >>> 0);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (_diskInspectPending.has(id)) {
          _diskInspectPending.delete(id);
          resolve(null);
        }
      }, 6000);
      if (typeof timer.unref === "function") timer.unref();
      _diskInspectPending.set(id, (res) => {
        clearTimeout(timer);
        resolve(res?.ok ? res : null);
      });
      _diskInspectWorker.postMessage({ id, userDataDir, profileCode, needCookies, needSpa });
    });
  } catch {
    return null;
  }
}

/**
 * Proposal 1 (`ok 1`):
 * Synchronizes a single profile's actual cookie auth status across all platforms (`Mail`, `Facebook`,
 * `TikTok`, `Services`) to P0020 `twofa_accounts` (`browser = profileCode`), patching ONLY rows whose
 * `stealth_snapshot.status` differs from reality.
 */
async function syncProfilePlatformsToP0020IfChanged({
  userDataDir = "",
  profileCode = "",
  profileId = "",
  cookiePairs = null,
  source = "p0003_session_sync",
  liveCdp = false,
  debugPort = 0,
} = {}) {
  if (!liveCdp && userDataDir && /[\\/]p0003-agent-shadow[\\/]/i.test(String(userDataDir))) {
    const primaryCandidate = String(userDataDir).replace(/[\\/]p0003-agent-shadow(?=[\\/])/i, "");
    if (fs.existsSync(path.join(primaryCandidate, "Default"))) {
      userDataDir = primaryCandidate;
    }
  }
  const isCloseSource = !liveCdp && Boolean(userDataDir) && /(_close|_close_sync|_post_close)$/.test(String(source || ""));
  if (isCloseSource) {
    const t = setTimeout(() => {
      try {
        const { trimClosedProfileDisposableCache } = require("./profile-chrome-cleanup.cjs");
        trimClosedProfileDisposableCache(userDataDir);
      } catch {
        /* ignore */
      }
      // Manual Backup/Restore Only policy:
      // Only create an initial read-only backup if Cookies.last-good.bak does NOT exist yet.
      // Never continuously overwrite an existing healthy backup on every close.
      try {
        const bakFile = path.join(userDataDir, "Default", "Network", "Cookies.last-good.bak");
        if (!fs.existsSync(bakFile)) {
          const { snapshotProfileCookiesIfHealthy } = require("./profile-cookie-guard.cjs");
          snapshotProfileCookiesIfHealthy(userDataDir);
        }
      } catch {
        /* ignore */
      }
    }, 1500);
    if (typeof t.unref === "function") t.unref();
  }
  const code = String(profileCode || "").trim().padStart(4, "0");
  if (!/^\d{4}$/.test(code)) {
    return { ok: false, reason: "invalid_profile_code", patchedCount: 0, rows: [] };
  }
  // Ephemeral Agent Pool (`9000`–`9999` / `9xxx`): User stores zero persistent data in 9xxx; skip P0020 sync
  if (/^9\d{3}$/.test(code)) {
    return { ok: true, skipped: "ephemeral_agent_pool_9xxx", patchedCount: 0, checkedRows: 0, rows: [] };
  }

  let pairs = Array.isArray(cookiePairs) ? cookiePairs : null;
  let precomputedSpaSummary = undefined;
  if (!(Number(debugPort) > 0) && userDataDir) {
    try {
      const scPath = path.join(userDataDir, "stealth-pid.json");
      if (fs.existsSync(scPath)) {
        const sc = JSON.parse(fs.readFileSync(scPath, "utf8")) || {};
        const scPid = Number(sc.pid || 0);
        const scPort = Number(sc.debugPort || 0);
        if (scPort > 0) {
          let pidAlive = true;
          if (scPid > 0) {
            try {
              process.kill(scPid, 0);
            } catch {
              pidAlive = false;
            }
          }
          if (pidAlive) {
            debugPort = scPort;
          }
        }
      }
    } catch {
      /* ignore sidecar parse error */
    }
  }
  if (Number(debugPort) > 0 && (!pairs || !pairs.some((p) => p && p.value))) {
    try {
      const liveCdpRes = await fetchLiveCdpCookiesByPort(Number(debugPort));
      if (liveCdpRes?.ok && Array.isArray(liveCdpRes.cookies) && liveCdpRes.cookies.length > 0) {
        pairs = liveCdpRes.cookies;
        liveCdp = true;
        await syncLiveCdpCookiesToVaultIfChanged(liveCdpRes.cookies, {
          profileCode: code,
          debugPort: Number(debugPort),
          userDataDir,
        });
      }
    } catch {
      /* fall back to SQLite below */
    }
  }
  const needDiskCookies = !liveCdp && Boolean(userDataDir) && (!pairs || !pairs.some((p) => p && p.value));
  if (needDiskCookies && process.versions?.electron) {
    const workerRes = await runDiskInspectInElectronWorker({
      userDataDir,
      profileCode: code,
      needCookies: true,
      needSpa: false,
    });
    if (workerRes) {
      precomputedSpaSummary = workerRes.spaSummary;
      if (workerRes.decrypted?.ok && Array.isArray(workerRes.decrypted.cookies) && workerRes.decrypted.cookies.length > 0) {
        pairs = workerRes.decrypted.cookies;
        await syncLiveCdpCookiesToVaultIfChanged(workerRes.decrypted.cookies, {
          profileCode: code,
          userDataDir,
        });
      } else if (workerRes.disk) {
        if (!workerRes.disk.ok) return { ok: false, reason: "sqlite_locked", patchedCount: 0, rows: [] };
        pairs = workerRes.disk.pairs;
      }
    }
  }
  if (!liveCdp && Boolean(userDataDir) && (!pairs || !pairs.some((p) => p && p.value))) {
    try {
      const { extractDecryptedCookiesFromProfileSqlite } = require("./profile-cookie-guard.cjs");
      const decrypted = extractDecryptedCookiesFromProfileSqlite(userDataDir);
      if (decrypted.ok && decrypted.cookies.length > 0) {
        pairs = decrypted.cookies;
        await syncLiveCdpCookiesToVaultIfChanged(decrypted.cookies, {
          profileCode: code,
          userDataDir,
          fromStaticDisk: true,
        });
      }
    } catch {
      /* fall back to readProfileDiskCookiePairs below */
    }
  }
  if (!pairs) {
    const disk = readProfileDiskCookiePairs(userDataDir, { profileCode: code });
    if (!disk.ok) return { ok: false, reason: "sqlite_locked", patchedCount: 0, rows: [] };
    pairs = disk.pairs;
  }

  let cfg;
  let userId;
  try {
    cfg = resolveVaultConfig();
    const scoped = await resolveScopedVaultUserId();
    userId = scoped.userId;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), patchedCount: 0, rows: [] };
  }
  if (!cfg?.url || !cfg?.key || !userId) {
    return { ok: false, reason: "missing_vault_config", patchedCount: 0, rows: [] };
  }

  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
  };

  const variants = [...new Set([code, String(Number(code))])];
  const inClause = variants.map((v) => `"${v}"`).join(",");
  const selectCols =
    "id,service,account,browser,status,stealth_status,password,mail_youtube_api_v3,mail_cloud,note,log_tip_message,plan_package,quota_status,quota_enrolled_at,quota_snapshot,stealth_snapshot,stealth_cookies";
  const queryUrl = `${cfg.url}/rest/v1/twofa_accounts?select=${selectCols}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&browser=in.(${encodeURIComponent(inClause)})&limit=100`;

  let rows = [];
  try {
    const res = await fetch(queryUrl, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, patchedCount: 0, rows: [] };
    rows = await res.json();
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), patchedCount: 0, rows: [] };
  }
  if (!Array.isArray(rows)) rows = [];

  // Auto-match Facebook UID (`c_user`) logged in on this profile even if its `browser` column in P0020 was empty or assigned elsewhere
  const liveFbCUser = Array.isArray(pairs)
    ? String(
        pairs.find(
          (c) =>
            c &&
            String(c.domain || c.host_key || "").toLowerCase().includes("facebook.com") &&
            c.name === "c_user" &&
            /^\d{6,20}$/.test(String(c.value || "").trim()) &&
            String(c.value || "").trim() !== "disk_verified_sqlite",
        )?.value || "",
      ).trim()
    : "";
  const liveFbHasPlaintextXs =
    Boolean(liveFbCUser) &&
    Array.isArray(pairs) &&
    pairs.some(
      (c) =>
        c &&
        String(c.domain || c.host_key || "").toLowerCase().includes("facebook.com") &&
        c.name === "xs" &&
        String(c.value || "").trim().length > 5 &&
        String(c.value || "").trim() !== "disk_verified_sqlite",
    );
  if (
    liveFbHasPlaintextXs &&
    !rows.some(
      (r) =>
        String(r?.service || "").trim().toLowerCase() === "facebook" &&
        String(r?.account || "").trim() === liveFbCUser,
    )
  ) {
    try {
      const fbUidUrl = `${cfg.url}/rest/v1/twofa_accounts?select=${selectCols}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&service=ilike.facebook&account=eq.${encodeURIComponent(liveFbCUser)}&limit=5`;
      const fbRes = await fetch(fbUidUrl, { headers, signal: AbortSignal.timeout(6000) });
      if (fbRes.ok) {
        const fbRows = await fbRes.json();
        if (Array.isArray(fbRows) && fbRows.length > 0) {
          const existingIds = new Set(rows.map((r) => r.id));
          for (const fr of fbRows) {
            if (fr && fr.id && !existingIds.has(fr.id)) {
              rows.push(fr);
              existingIds.add(fr.id);
            }
          }
        }
      }
    } catch {
      /* ignore transient fetch error */
    }
  }

  const hasAnyPlaintextPrimaryPlatformCookie =
    Array.isArray(pairs) &&
    pairs.some(
      (c) =>
        c &&
        c.value &&
        String(c.value).trim() !== "disk_verified_sqlite" &&
        (c.name === "SID" ||
          c.name === "__Secure-1PSID" ||
          c.name === "SAPISID" ||
          c.name === "RPSSecAuth" ||
          c.name === "MSPAuth" ||
          c.name === "__Host-MSAAUTH" ||
          c.name === "__Host-MSAAUTHP" ||
          c.name === "ESTSAUTH" ||
          c.name === "WLSSC" ||
          c.name === "sessionid" ||
          c.name === "sessionid_ss" ||
          c.name === "sid_tt" ||
          c.name === "auth_token" ||
          c.name === "__Secure-next-auth.session-token" ||
          c.name === "next-auth.session-token" ||
          c.name === "sessionKey" ||
          c.name === "WorkosCursorSessionToken" ||
          c.name === "sso"),
    );
  if (rows.length === 0 && !hasAnyPlaintextPrimaryPlatformCookie && !userDataDir) {
    return { ok: true, patchedCount: 0, checkedRows: 0, loggedInServices: [], patchedServices: [], rows: [] };
  }

  const nowIso = new Date().toISOString();
  let patchedCount = 0;
  let newlyLoggedInMail = false;
  let activeMailLoggedIn = false;
  const loggedInServicesSet = new Set();
  const patchedServicesSet = new Set();
  const pendingSsoServiceRows = [];
  let spaSummary = precomputedSpaSummary;
  const hasSpaCandidateRow = rows.some((r) =>
    /^(elevenlabs|adobe|higgsfield|discord|leonardo ai|runway|topview|vidiq|telegram)$/i.test(
      String(r?.service || "").trim(),
    ),
  );
  if (spaSummary === undefined) {
    if (!hasSpaCandidateRow || !userDataDir) {
      spaSummary = null;
    } else if (process.versions?.electron) {
      const workerSpa = await runDiskInspectInElectronWorker({
        userDataDir,
        profileCode: code,
        needCookies: false,
        needSpa: true,
      });
      spaSummary = workerSpa ? workerSpa.spaSummary : readProfileSpaStorageSummary(userDataDir);
    } else {
      spaSummary = readProfileSpaStorageSummary(userDataDir);
    }
  }
  const resolvedRows = [];
  const cleanDebugPort = Number.isFinite(Number(debugPort)) && Number(debugPort) > 0 ? Number(debugPort) : 0;
  const isLiveWindow = Boolean(liveCdp && cleanDebugPort > 0);
  if (isLiveWindow) markStealthProfileLaunchWindowState(code, true);
  const isPassiveUserLiveSync =
    source === "p0003_live_nav" || source === "p0003_focus_live_cdp";
  const liveCdpTargets = isLiveWindow ? await fetchLiveCdpPageTargetsByPort(cleanDebugPort) : [];
  if (isLiveWindow && !isPassiveUserLiveSync && liveCdpTargets.length > 0) {
    await autoSkipGoogleSpeedbumpTargets(liveCdpTargets).catch(() => undefined);
  }
  const liveHasGoogleAuth =
    Array.isArray(pairs) &&
    pairs.some(
      (c) =>
        c &&
        (c.name === "SID" || c.name === "__Secure-1PSID" || c.name === "__Secure-3PSID") &&
        String(c.value || "").trim().length >= 20 &&
        String(c.value || "").trim() !== "disk_verified_sqlite",
    ) &&
    pairs.some(
      (c) =>
        c &&
        (c.name === "SAPISID" || c.name === "__Secure-1PAPISID" || c.name === "__Secure-3PAPISID") &&
        String(c.value || "").trim().length >= 20 &&
        String(c.value || "").trim() !== "disk_verified_sqlite",
    );
  const fbLiveTargetState = isLiveWindow ? classifyFacebookLiveCdpTargets(liveCdpTargets) : null;
  let closedHistoryGoogleTargets = null;
  let gmailRestriction54Lifted = false;
  if (!isLiveWindow && userDataDir) {
    const histPath = path.join(userDataDir, "Default", "History");
    if (fs.existsSync(histPath)) {
      const tmpHist = path.join(os.tmpdir(), `p0003-hist-sync-${code}-${Date.now()}.sqlite`);
      try {
        fs.copyFileSync(histPath, tmpHist);
        const hdb = new DatabaseSync(tmpHist, { open: true, readOnly: true });
        const hRows = hdb
          .prepare(
            "SELECT u.url, u.title, CAST(v.visit_time / 1000000 AS INTEGER) AS visit_sec FROM visits v JOIN urls u ON v.url = u.id WHERE (u.url LIKE '%/signin/challenge/iap%' AND u.url NOT LIKE '%/signin/challenge/iap/verify%') OR u.url LIKE '%/signin/challenge/ipp%' OR u.url LIKE '%/devicephoneverification/%' OR u.url LIKE '%/signin/v2/disabled%' OR u.url LIKE '%/speedbump/disabled/%' OR u.url LIKE '%myaccount.google.com/restrictions/54%' OR u.url LIKE '%myaccount.google.com/restrictions/47%' OR (u.url LIKE 'https://mail.google.com/mail/u/%' AND u.url NOT LIKE '%/ServiceLogin%') OR (u.url LIKE 'https://myaccount.google.com/%' AND u.url NOT LIKE '%/restrictions/%' AND u.url NOT LIKE '%/verification/selfie%') OR u.url LIKE 'https://one.google.com/%' OR u.url LIKE 'https://studio.youtube.com/%' OR u.url LIKE 'https://drive.google.com/%' ORDER BY v.visit_time DESC LIMIT 5",
          )
          .all();
        hdb.close();
        if (Array.isArray(hRows) && hRows.length > 0) {
          const topVisit = hRows[0];
          const topUrl = String(topVisit?.url || "");
          const webkitNowSec = Math.floor(Date.now() / 1000) + 11644473600;
          const ageSec = webkitNowSec - Number(topVisit?.visit_sec || 0);
          if (
            /\/signin\/challenge\/(?:iap(?!\/verify)|ipp)\b|\/devicephoneverification\/|\/signin\/v2\/disabled\b|\/speedbump\/disabled\/|myaccount\.google\.com\/restrictions\/(?:54|47)\b/i.test(
              topUrl,
            ) &&
            ageSec < 14 * 86400
          ) {
            closedHistoryGoogleTargets = [{ url: topUrl, title: String(topVisit?.title || "") }];
          }
        }
      } catch {
        /* ignore SQLite history read error */
      } finally {
        try {
          fs.unlinkSync(tmpHist);
        } catch {
          /* ignore */
        }
      }
    }
    if (
      closedHistoryGoogleTargets &&
      liveHasGoogleAuth &&
      /myaccount\.google\.com\/restrictions\/54\b/i.test(String(closedHistoryGoogleTargets[0]?.url || ""))
    ) {
      try {
        const seenAccCookies = new Map();
        for (const c of Array.isArray(pairs) ? pairs : []) {
          const dom = String(c?.domain || c?.host_key || "").replace(/^\./, "").toLowerCase();
          if (dom && ("accounts.google.com" === dom || "accounts.google.com".endsWith("." + dom))) {
            seenAccCookies.set(c.name, `${c.name}=${c.value}`);
          }
        }
        const slRes = await fetch(
          "https://accounts.google.com/ServiceLogin?service=mail&passive=1209600&osid=1&continue=https://mail.google.com/mail/u/0/&followup=https://mail.google.com/mail/u/0/&hl=en&emr=1&authuser=0",
          {
            headers: {
              Cookie: Array.from(seenAccCookies.values()).join("; "),
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
            },
            redirect: "manual",
            signal: AbortSignal.timeout(3500),
          },
        );
        const slLoc = String(slRes.headers.get("location") || "");
        if (/^https:\/\/mail\.google\.com\/(?:accounts\/SetOSID|mail\/u\/)/i.test(slLoc)) {
          closedHistoryGoogleTargets = null;
          gmailRestriction54Lifted = true;
        }
      } catch {
        /* ignore network probe timeout */
      }
    }
  }
  const liveHasMicrosoftAuth =
    Array.isArray(pairs) &&
    pairs.some(
      (c) =>
        c &&
        (c.name === "RPSSecAuth" ||
          c.name === "MSPAuth" ||
          c.name === "__Host-MSAAUTH" ||
          c.name === "__Host-MSAAUTHP" ||
          c.name === "ESTSAUTH" ||
          c.name === "ESTSAUTHPERSISTENT" ||
          c.name === "OwaUserState" ||
          c.name === "WLSSC") &&
        String(c.value || "").trim().length >= 6 &&
        String(c.value || "").trim() !== "disk_verified_sqlite" &&
        String(c.value).toLowerCase() !== "disabled" &&
        String(c.value) !== "0",
    );
  const googleLiveTargetState = isLiveWindow
    ? classifyGoogleLiveCdpTargets(liveCdpTargets, { hasGoogleAuthCookies: liveHasGoogleAuth })
    : closedHistoryGoogleTargets
      ? classifyGoogleLiveCdpTargets(closedHistoryGoogleTargets, { hasGoogleAuthCookies: false })
      : null;
  const msLiveTargetState = isLiveWindow
    ? classifyMicrosoftLiveCdpTargets(liveCdpTargets, { hasMicrosoftAuthCookies: liveHasMicrosoftAuth })
    : null;
  const claudeLiveTargetState = isLiveWindow ? classifyClaudeLiveCdpTargets(liveCdpTargets) : null;
  const hasVerifiedGoogleLiveTab =
    isLiveWindow && liveCdpTargets.some((t) => isAuthenticatedGoogleAppUrl(t?.url));
  const hasVerifiedMicrosoftLiveTab =
    isLiveWindow && liveCdpTargets.some((t) => isAuthenticatedMicrosoftAppUrl(t?.url));

  // Native CloakBrowser Cookie Purity (`ok 1`): JSON cookie vault files (`service-cookie-vault.json`,
  // `mail-cookie-vault.json`, `fb-cookie-vault.json`, `tiktok-cookie-vault.json`) are permanently disabled;
  // only live browser cookies / native CloakBrowser SQLite profile storage (`Default/Network/Cookies`) are evaluated.
  const serviceVaultMap = null;
  const mailVaultMap = null;
  const fbVaultMap = null;
  const ttVaultMap = null;

  const hasPlaintextGoogleAuth = (list) =>
    Array.isArray(list) &&
    list.some(
      (c) =>
        c &&
        (c.name === "SID" ||
          c.name === "__Secure-1PSID" ||
          c.name === "__Secure-3PSID" ||
          c.name === "SAPISID" ||
          c.name === "__Secure-1PAPISID" ||
          c.name === "__Secure-3PAPISID" ||
          c.name === "LSID" ||
          c.name === "__Host-1PLSID") &&
        String(c.value || "").trim().length >= 16 &&
        String(c.value || "").trim() !== "disk_verified_sqlite",
    );
  const hasPlaintextMsAuth = (list) =>
    Array.isArray(list) &&
    list.some(
      (c) =>
        c &&
        (c.name === "RPSSecAuth" ||
          c.name === "MSPAuth" ||
          c.name === "__Host-MSAAUTH" ||
          c.name === "__Host-MSAAUTHP" ||
          c.name === "ESTSAUTH" ||
          c.name === "ESTSAUTHPERSISTENT" ||
          c.name === "WLSSC") &&
        String(c.value || "").trim().length >= 10 &&
        String(c.value || "").trim() !== "disk_verified_sqlite" &&
        String(c.value).toLowerCase() !== "disabled" &&
        String(c.value) !== "0",
    );

  // Cookie vault fallback (`mail-cookie-vault.json`) is permanently disabled per User SSOT:
  // only live browser cookies / native CloakBrowser profile storage may be evaluated.
  const profileGmailVaultCookies = null;
  const profileOutlookVaultCookies = null;

  let cachedGoogleHttpVerify = null;
  const hasCoherentGoogleLsidAndSid = (list) =>
    Array.isArray(list) &&
    list.some((c) => {
      if (!c) return false;
      const dom = String(c.domain || c.host_key || "").trim().toLowerCase();
      if (dom && dom !== ".google.com" && dom !== "google.com") return false;
      return (
        (c.name === "SID" ||
          c.name === "__Secure-1PSID" ||
          c.name === "__Secure-3PSID") &&
        String(c.value || "").startsWith("g.") &&
        String(c.value || "").trim().length >= 20
      );
    }) &&
    list.some((c) => {
      if (!c) return false;
      const dom = String(c.domain || c.host_key || "").trim().toLowerCase();
      if (dom && dom !== ".google.com" && dom !== "google.com" && dom !== "accounts.google.com") return false;
      return (
        (c.name === "SAPISID" ||
          c.name === "__Secure-1PAPISID" ||
          c.name === "__Secure-3PAPISID" ||
          c.name === "LSID" ||
          c.name === "__Host-1PLSID" ||
          c.name === "__Host-3PLSID") &&
        String(c.value || "").trim().length >= 16
      );
    });
  const hasChallengedOrBlockedGoogleRow = rows.some((r) => {
    if (!isGoogleFamilyService(r?.service)) return false;
    const rs = String(r?.status || "").trim().toLowerCase();
    const ss = String(r?.stealth_snapshot?.status || "").trim().toLowerCase();
    const rc = String(r?.stealth_snapshot?.result_code || "").trim().toLowerCase();
    const ev = String(r?.stealth_snapshot?.evidence || "");
    const restrictedSvcId = String(r?.stealth_snapshot?.restricted_service_id || "").trim();
    const isSubServiceOnlyRestriction =
      (rs === "appeal" || rs === "disable") &&
      (restrictedSvcId === "54" ||
        restrictedSvcId === "47" ||
        Boolean(resolveGoogleRestrictionInfo(ev)));
    if (isSubServiceOnlyRestriction) return false;
    const hasExplicitChallengeNote =
      /(?:\[TẠM BỎ QUA|\[CHỜ SIM OTP|\[CHỜ QUÉT QR|Sai\/Lệch mã 2FA|LỆCH 2FA SECRET|Tài khoản bị Google vô hiệu hóa|Tài khoản đã bị xóa)/i.test(
        String(r?.note || ""),
      );
    return (
      hasExplicitChallengeNote ||
      ss === "quarantined_sms" ||
      ss === "not_logged_in" ||
      r?.stealth_snapshot?.sms_quarantined === true ||
      rc === "login_page" ||
      rc === "google_one_logged_out" ||
      rc === "wrong_password" ||
      rc === "account_locked_rejected" ||
      rc === "totp_secret_mismatch" ||
      rc === "phone_sms_required" ||
      rc === "checkpoint_qr" ||
      ["error", "check_phone", "check_mail", "checkpoint_qr", "incorrect_info", "wrong_2fa", "appeal", "disable", "banned"].includes(rs)
    );
  });
  let hasVerifiedGoogleAuth = Boolean(isLiveWindow && hasVerifiedGoogleLiveTab);
  let candidateGoogleCookies = hasPlaintextGoogleAuth(pairs)
    ? pairs
    : !hasChallengedOrBlockedGoogleRow && hasPlaintextGoogleAuth(profileGmailVaultCookies)
      ? profileGmailVaultCookies
      : null;
  if (
    candidateGoogleCookies &&
    (hasPlaintextGoogleAuth(pairs) ||
      rows.some(
        (r) =>
          isGoogleFamilyService(r?.service) ||
          /@gmail\.com$/i.test(String(r?.account || "").trim()),
      ))
  ) {
    cachedGoogleHttpVerify = await verifyGoogleCookiesLiveViaHttp(candidateGoogleCookies, 4500, fetch, {
      resolveIdentity: true,
      userDataDir,
      profileCode: code,
      hasChallengedOrBlockedRow: hasChallengedOrBlockedGoogleRow,
    });
    if (!cachedGoogleHttpVerify.ok && hasCoherentGoogleLsidAndSid(candidateGoogleCookies)) {
      cachedGoogleHttpVerify = await verifyGoogleCookiesLiveViaHttp(candidateGoogleCookies, 6000, fetch, {
        resolveIdentity: true,
        userDataDir,
        profileCode: code,
        hasChallengedOrBlockedRow: hasChallengedOrBlockedGoogleRow,
      });
    }
    if (
      cachedGoogleHttpVerify.ok &&
      cachedGoogleHttpVerify.loggedIn &&
      (cachedGoogleHttpVerify.mode !== "offline_proxy_safe" ||
        (!hasChallengedOrBlockedGoogleRow && hasCoherentGoogleLsidAndSid(candidateGoogleCookies)))
    ) {
      hasVerifiedGoogleAuth = true;
    } else if (!cachedGoogleHttpVerify.ok && !hasChallengedOrBlockedGoogleRow && hasCoherentGoogleLsidAndSid(candidateGoogleCookies)) {
      hasVerifiedGoogleAuth = true;
    } else if (cachedGoogleHttpVerify.ok && !cachedGoogleHttpVerify.loggedIn) {
      hasVerifiedGoogleAuth = false;
    } else if (
      !hasChallengedOrBlockedGoogleRow &&
      candidateGoogleCookies === pairs &&
      hasPlaintextGoogleAuth(profileGmailVaultCookies)
    ) {
      const vaultGoogleVerify = await verifyGoogleCookiesLiveViaHttp(profileGmailVaultCookies, 4500, fetch, {
        resolveIdentity: true,
        userDataDir,
        profileCode: code,
      });
      if (vaultGoogleVerify.ok && vaultGoogleVerify.loggedIn) {
        cachedGoogleHttpVerify = vaultGoogleVerify;
        candidateGoogleCookies = profileGmailVaultCookies;
        if (vaultGoogleVerify.mode !== "offline_proxy_safe" || hasCoherentGoogleLsidAndSid(profileGmailVaultCookies)) {
          hasVerifiedGoogleAuth = true;
        }
        for (const vc of profileGmailVaultCookies) {
          if (vc && vc.name && vc.value) {
            pairs.push({
              name: String(vc.name),
              value: String(vc.value),
              domain: String(vc.domain || ".google.com"),
              path: String(vc.path || "/"),
            });
          }
        }
        // Native CloakBrowser Cookie Purity: status sync is strictly read-only on disk;
        // never inject vault cookies into closed Default/Network/Cookies during status probing.
      }
    }
  }
  if (
    isLiveWindow &&
    Array.isArray(liveCdpTargets) &&
    liveCdpTargets.length > 0 &&
    cachedGoogleHttpVerify?.ok &&
    cachedGoogleHttpVerify?.loggedIn &&
    (!Array.isArray(cachedGoogleHttpVerify.verifiedEmails) || cachedGoogleHttpVerify.verifiedEmails.length === 0)
  ) {
    const liveTabGmails = new Set();
    for (const t of liveCdpTargets) {
      const u = String(t?.url || "");
      const title = String(t?.title || "");
      if (isAuthenticatedGoogleAppUrl(u) || /mail\.google\.com|myaccount\.google\.com|one\.google\.com/i.test(u)) {
        const m = title.match(/\b([a-z0-9._%+-]+@(?:gmail|googlemail)\.com)\b/i);
        if (m) {
          const norm = normalizeComparableEmail(m[1]);
          if (norm) liveTabGmails.add(norm);
        }
      }
    }
    if (liveTabGmails.size > 0) {
      cachedGoogleHttpVerify.verifiedEmails = Array.from(liveTabGmails);
    }
  }
  // Auto-match unassigned (`browser` empty/null) Gmail / Google rows by verified email (`ok 2`).
  // Never hijack or move a Gmail row that already has a non-empty `browser` assigned to another profile.
  if (
    hasVerifiedGoogleAuth &&
    Array.isArray(cachedGoogleHttpVerify?.verifiedEmails) &&
    cachedGoogleHttpVerify.verifiedEmails.length > 0
  ) {
    const unmatchedGoogleEmails = cachedGoogleHttpVerify.verifiedEmails.filter(
      (em) =>
        em &&
        !rows.some(
          (r) =>
            /^(gmail|google mail)$/i.test(String(r?.service || "").trim()) &&
            normalizeComparableEmail(r?.account) === em,
        ),
    );
    if (unmatchedGoogleEmails.length > 0) {
      try {
        const gInClause = unmatchedGoogleEmails.map((e) => `"${e}"`).join(",");
        const gMatchUrl = `${cfg.url}/rest/v1/twofa_accounts?select=${selectCols}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&account=in.(${encodeURIComponent(gInClause)})&limit=10`;
        const gRes = await fetch(gMatchUrl, { headers, signal: AbortSignal.timeout(6000) });
        if (gRes.ok) {
          const gRows = await gRes.json();
          if (Array.isArray(gRows) && gRows.length > 0) {
            const existingIds = new Set(rows.map((r) => r.id));
            for (const gr of gRows) {
              if (!gr || !gr.id || existingIds.has(gr.id)) continue;
              if (!isGoogleFamilyService(gr.service)) continue;
              const curBrowser = String(gr.browser || "").trim();
              if (!curBrowser || curBrowser.padStart(4, "0") === code) {
                rows.push(gr);
                existingIds.add(gr.id);
              }
            }
          }
        }
      } catch {
        /* ignore transient fetch error */
      }
    }
  }
  if (isLiveWindow && !isPassiveUserLiveSync && hasVerifiedGoogleAuth && liveCdpTargets.length > 0) {
    const hasGmailRow = rows.some((r) =>
      /^(gmail|google mail)$/i.test(String(r?.service || "").trim()),
    );
    await autoHealCompletedGoogleChallengeTabs(liveCdpTargets, { hasGmailRow }).catch(
      () => undefined,
    );
  }
  const patchedRows = [];
  let cachedMicrosoftHttpVerify = null;
  let hasVerifiedMicrosoftAuth = Boolean(isLiveWindow && hasVerifiedMicrosoftLiveTab);
  const rowMsVaultCookies = !userDataDir
    ? rows
        .filter((r) => isMicrosoftFamilyService(r?.service) && hasPlaintextMsAuth(r?.stealth_cookies))
        .flatMap((r) => r.stealth_cookies)
    : [];
  const fallbackMsCookies = !userDataDir && hasPlaintextMsAuth(profileOutlookVaultCookies)
    ? profileOutlookVaultCookies
    : !userDataDir && hasPlaintextMsAuth(rowMsVaultCookies)
      ? rowMsVaultCookies
      : null;
  let candidateMsCookies = hasPlaintextMsAuth(pairs) ? pairs : fallbackMsCookies;
  if (candidateMsCookies && (hasPlaintextMsAuth(pairs) || rows.some((r) => isMicrosoftFamilyService(r?.service)))) {
    cachedMicrosoftHttpVerify = await verifyMicrosoftCookiesLiveViaHttp(candidateMsCookies, 4500, fetch, {
      allowDirectHostHttp: true,
    });
    if (
      cachedMicrosoftHttpVerify.ok &&
      cachedMicrosoftHttpVerify.loggedIn &&
      cachedMicrosoftHttpVerify.resultCode !== "offline_proxy_safe"
    ) {
      hasVerifiedMicrosoftAuth = true;
    } else if (!userDataDir && candidateMsCookies === pairs && fallbackMsCookies) {
      const vaultMsVerify = await verifyMicrosoftCookiesLiveViaHttp(fallbackMsCookies, 4500, fetch, {
        allowDirectHostHttp: true,
      });
      if (vaultMsVerify.ok && vaultMsVerify.loggedIn) {
        cachedMicrosoftHttpVerify = vaultMsVerify;
        candidateMsCookies = fallbackMsCookies;
        if (vaultMsVerify.resultCode !== "offline_proxy_safe") {
          hasVerifiedMicrosoftAuth = true;
        }
      }
    }
    if (
      !userDataDir &&
      (hasVerifiedMicrosoftAuth || cachedMicrosoftHttpVerify?.loggedIn) &&
      candidateMsCookies === fallbackMsCookies &&
      Array.isArray(fallbackMsCookies)
    ) {
      for (const vc of fallbackMsCookies) {
        if (vc && vc.name && vc.value) {
          pairs.push({
            name: String(vc.name),
            value: String(vc.value),
            domain: String(vc.domain || ".live.com"),
            path: String(vc.path || "/"),
          });
        }
      }
    }
  }
  // Auto-match unassigned (`browser` empty/null) Outlook / Hotmail rows by verified email (`ok 2`).
  // Never hijack or move an Outlook/Hotmail row that already has a non-empty `browser` assigned to another profile.
  if (
    hasVerifiedMicrosoftAuth &&
    Array.isArray(cachedMicrosoftHttpVerify?.verifiedEmails) &&
    cachedMicrosoftHttpVerify.verifiedEmails.length > 0
  ) {
    const unmatchedMsEmails = cachedMicrosoftHttpVerify.verifiedEmails.filter(
      (em) =>
        em &&
        !rows.some(
          (r) =>
            isMicrosoftFamilyService(r?.service) &&
            normalizeComparableEmail(r?.account) === em,
        ),
    );
    if (unmatchedMsEmails.length > 0) {
      try {
        const msInClause = unmatchedMsEmails.map((e) => `"${e}"`).join(",");
        const msMatchUrl = `${cfg.url}/rest/v1/twofa_accounts?select=${selectCols}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&account=in.(${encodeURIComponent(msInClause)})&limit=10`;
        const msRes = await fetch(msMatchUrl, { headers, signal: AbortSignal.timeout(6000) });
        if (msRes.ok) {
          const msRows = await msRes.json();
          if (Array.isArray(msRows) && msRows.length > 0) {
            const existingIds = new Set(rows.map((r) => r.id));
            for (const mr of msRows) {
              if (!mr || !mr.id || existingIds.has(mr.id)) continue;
              if (!isMicrosoftFamilyService(mr.service)) continue;
              const curBrowser = String(mr.browser || "").trim();
              if (!curBrowser || curBrowser.padStart(4, "0") === code) {
                rows.push(mr);
                existingIds.add(mr.id);
              }
            }
          }
        }
      } catch {
        /* ignore transient fetch error */
      }
    }
  }
  if (isLiveWindow && !isPassiveUserLiveSync && hasVerifiedMicrosoftAuth && liveCdpTargets.length > 0) {
    const hasOutlookRow = rows.some((r) =>
      /^(outlook|hotmail)$/i.test(String(r?.service || "").trim()),
    );
    await autoHealCompletedMicrosoftChallengeTabs(liveCdpTargets, { hasOutlookRow }).catch(
      () => undefined,
    );
  }


  const probeState = await discoverAndAutoBindUnassignedP0020Rows({
    pairs,
    rows,
    isLiveWindow,
    cfg,
    userId,
    selectCols,
    headers,
    code,
    userDataDir,
    spaSummary,
    hasVerifiedGoogleAuth,
  });
  spaSummary = probeState.spaSummary;
  let {
    cachedTikTokHttpVerify,
    hasVerifiedTikTokAuth,
    cachedTwitterHttpVerify,
    hasVerifiedTwitterAuth,
    cachedInstagramHttpVerify,
    hasVerifiedInstagramAuth,
  } = probeState;

  if (rows.length === 0) {
    return { ok: true, patchedCount: 0, checkedRows: 0, loggedInServices: [], patchedServices: [], rows: [] };
  }

  const profileHasBlockedGoogleSession =
    !hasVerifiedGoogleAuth &&
    rows.some(
      (r) =>
        isGoogleFamilyService(r?.service) &&
        shouldPreserveChallengedState(r, true, {
          isLiveWindow,
          hasVerifiedGoogleLiveTab,
          hasVerifiedGoogleAuth,
          hasVerifiedMicrosoftLiveTab,
          hasVerifiedMicrosoftAuth,
        }),
    );
  const profileHasBlockedMicrosoftSession =
    !hasVerifiedMicrosoftAuth &&
    rows.some(
      (r) =>
        isMicrosoftFamilyService(r?.service) &&
        shouldPreserveChallengedState(r, true, {
          isLiveWindow,
          hasVerifiedGoogleLiveTab,
          hasVerifiedGoogleAuth,
          hasVerifiedMicrosoftLiveTab,
          hasVerifiedMicrosoftAuth,
        }),
    );

  const msFamilyRows = rows.filter((r) => isMicrosoftFamilyService(r?.service));
  const profileMicrosoftAliasEmails = new Set();
  if (msFamilyRows.length > 1) {
    const passCounts = new Map();
    const recCounts = new Map();
    for (const mr of msFamilyRows) {
      const p = String(mr?.password || "").trim();
      if (p) passCounts.set(p, (passCounts.get(p) || 0) + 1);
      const rec = normalizeComparableEmail(mr?.mail_recover);
      if (rec) recCounts.set(rec, (recCounts.get(rec) || 0) + 1);
    }
    const hasAnyExplicitAlias = msFamilyRows.some((mr) => {
      const snap = mr?.stealth_snapshot && typeof mr.stealth_snapshot === "object" ? mr.stealth_snapshot : {};
      return Boolean(snap.independent_service_alias) || Boolean(snap.shared_microsoft_credential_primary);
    });
    for (const mr of msFamilyRows) {
      const em = normalizeComparableEmail(mr?.account);
      if (!em) continue;
      const p = String(mr?.password || "").trim();
      const rec = normalizeComparableEmail(mr?.mail_recover);
      const sharesBothCreds = Boolean(p && (passCounts.get(p) || 0) > 1 && rec && (recCounts.get(rec) || 0) > 1);
      const sharesAnyCredWithExplicitAlias =
        hasAnyExplicitAlias && Boolean((p && (passCounts.get(p) || 0) > 1) || (rec && (recCounts.get(rec) || 0) > 1));
      const snap = mr?.stealth_snapshot && typeof mr.stealth_snapshot === "object" ? mr.stealth_snapshot : {};
      const isExplicitAliasRow =
        Boolean(snap.independent_service_alias) ||
        Boolean(snap.shared_microsoft_credential_primary) ||
        String(mr?.service || "").trim().toLowerCase() === "microsoft office";
      if (sharesBothCreds || sharesAnyCredWithExplicitAlias || isExplicitAliasRow) {
        profileMicrosoftAliasEmails.add(em);
      }
    }
  }

  for (const row of rows) {
    const svc = String(row.service || "").trim();
    const svcLower = svc.toLowerCase();
    const isMailSvc = /^(gmail|google mail|outlook|hotmail)$/i.test(svc);
    const match = matchServiceCookiePairs(svc, pairs, spaSummary, {
      expectedAccount: row.account,
      allowedOutlookAliasEmails: profileMicrosoftAliasEmails,
      verifiedGoogleEmails: cachedGoogleHttpVerify?.verifiedEmails,
    });
    let vaultEntryCookies = null;
    if (serviceVaultMap && typeof serviceVaultMap === "object") {
      const entry = serviceVaultMap[`${code}:${svcLower}`];
      if (Array.isArray(entry?.cookies) && entry.cookies.length > 0) {
        vaultEntryCookies = entry.cookies;
      }
    }
    if (!vaultEntryCookies && (isMailSvc || isGoogleFamilyService(svcLower)) && mailVaultMap && typeof mailVaultMap === "object") {
      const candidate =
        isGoogleFamilyService(svcLower)
          ? profileGmailVaultCookies
          : isMicrosoftFamilyService(svcLower)
            ? profileOutlookVaultCookies
            : mailVaultMap[code]?.cookies;
      if (Array.isArray(candidate) && candidate.length > 0) {
        vaultEntryCookies = candidate;
      }
    }
    if (!vaultEntryCookies && svcLower === "facebook" && fbVaultMap && typeof fbVaultMap === "object") {
      const entry = fbVaultMap[code];
      if (Array.isArray(entry?.cookies) && entry.cookies.length > 0) {
        vaultEntryCookies = entry.cookies;
      }
    }
    if (!vaultEntryCookies && svcLower === "tiktok" && ttVaultMap && typeof ttVaultMap === "object") {
      const entry = ttVaultMap[code];
      if (Array.isArray(entry?.cookies) && entry.cookies.length > 0) {
        vaultEntryCookies = entry.cookies;
      }
    }
    if (!vaultEntryCookies && Array.isArray(row?.stealth_snapshot?.service_cookies) && row.stealth_snapshot.service_cookies.length > 0) {
      vaultEntryCookies = row.stealth_snapshot.service_cookies;
    }
    if (!vaultEntryCookies && Array.isArray(row?.stealth_snapshot?.cookies) && row.stealth_snapshot.cookies.length > 0) {
      vaultEntryCookies = row.stealth_snapshot.cookies;
    }
    if (!vaultEntryCookies && Array.isArray(row?.stealth_cookies) && row.stealth_cookies.length > 0) {
      vaultEntryCookies = row.stealth_cookies;
    }
    const rowStatusLower = String(row.status || "").trim().toLowerCase();
    const rowSnapStatusLower = String(row?.stealth_snapshot?.status || "").trim().toLowerCase();
    const rowResCodeLower = String(row?.stealth_snapshot?.result_code || "").trim().toLowerCase();
    const rowRestrictionServices = resolveGoogleRestrictionTargetServices(
      String(row?.stealth_snapshot?.evidence || ""),
    );
    const rowRestrictionAppliesToService =
      !(gmailRestriction54Lifted && /restrictions\/54\b/i.test(String(row?.stealth_snapshot?.evidence || ""))) &&
      doesGoogleTargetRestrictionApplyToService(
        rowRestrictionServices ? { restrictedServices: rowRestrictionServices } : null,
        svcLower,
      );
    const isRestrictedOrDisabledRow =
      (rowStatusLower === "disable" && (!isGoogleFamilyService(svcLower) || rowRestrictionAppliesToService)) ||
      rowStatusLower === "banned" ||
      ((rowStatusLower === "check_phone" || rowStatusLower === "check_mail" || rowStatusLower === "checkpoint_qr" || rowSnapStatusLower === "challenged") &&
        !(isGoogleFamilyService(svcLower) && hasVerifiedGoogleAuth) &&
        !(isMicrosoftFamilyService(svcLower) && hasVerifiedMicrosoftAuth)) ||
      (rowStatusLower === "appeal" &&
        (svcLower === "claude" ||
          svcLower === "facebook" ||
          (isGoogleFamilyService(svcLower) && rowRestrictionAppliesToService && !hasVerifiedGoogleLiveTab))) ||
      (NON_OVERRIDABLE_RESTRICTED_RESULT_CODES.has(rowResCodeLower) &&
        !(isGoogleFamilyService(svcLower) && hasVerifiedGoogleAuth) &&
        !(isMicrosoftFamilyService(svcLower) && hasVerifiedMicrosoftAuth)) ||
      isFacebookRowInCheckpointOrDisabled(row);

    if (
      !isRestrictedOrDisabledRow &&
      !isLiveWindow &&
      !userDataDir &&
      !match.loggedIn &&
      match.resultCode !== "account_mismatch" &&
      vaultEntryCookies
    ) {
      const vaultMatch = matchServiceCookiePairs(svc, vaultEntryCookies, null, {
        expectedAccount: row.account,
        allowedOutlookAliasEmails: profileMicrosoftAliasEmails,
        verifiedGoogleEmails: cachedGoogleHttpVerify?.verifiedEmails,
      });
      if (vaultMatch.loggedIn) {
        match.loggedIn = true;
        match.resultCode = vaultMatch.resultCode;
        match.matchedNames = vaultMatch.matchedNames;
      }
    }
    if (!match.supported) {
      resolvedRows.push(row);
      continue;
    }

    const {
      fbForcedOverride,
      hasVerifiedFacebookAuth,
      aiUidSpec,
      verifiedAiServerUid,
      verifiedAiMethod,
      verifiedElevenLabsOnboarding,
      verifiedCapcutConnectsCount,
    } = await verifyRowPlatformAndAiSession({
      row,
      svcLower,
      rowStatusLower,
      rowResCodeLower,
      match,
      pairs,
      vaultEntryCookies,
      rows,
      code,
      userDataDir,
      isLiveWindow,
      isPassiveUserLiveSync,
      liveCdpTargets,
      fbLiveTargetState,
      googleLiveTargetState,
      msLiveTargetState,
      claudeLiveTargetState,
      hasVerifiedGoogleLiveTab,
      hasVerifiedMicrosoftLiveTab,
      hasPlaintextGoogleAuth,
      hasPlaintextMsAuth,
      candidateGoogleCookies,
      cachedGoogleHttpVerify,
      hasChallengedOrBlockedGoogleRow,
      cachedMicrosoftHttpVerify,
      hasVerifiedMicrosoftAuth,
      profileMicrosoftAliasEmails,
      probeState,
    });
    ({
      hasVerifiedGoogleAuth,
      cachedTikTokHttpVerify,
      hasVerifiedTikTokAuth,
      cachedTwitterHttpVerify,
      hasVerifiedTwitterAuth,
      cachedInstagramHttpVerify,
      hasVerifiedInstagramAuth,
    } = probeState);

    if (
      (!fbForcedOverride || fbForcedOverride.status === "not_logged_in") &&
      (shouldPreserveChallengedState(row, match.loggedIn, {
        isLiveWindow,
        hasVerifiedGoogleLiveTab,
        hasVerifiedGoogleAuth,
        gmailRestriction54Lifted,
        hasVerifiedMicrosoftLiveTab,
        hasVerifiedMicrosoftAuth,
        hasVerifiedFacebookAuth,
        hasExplicitServiceLogout: Boolean(
          fbForcedOverride?.expired || fbForcedOverride?.banned || fbForcedOverride?.evidence,
        ),
      }) ||
        (isGoogleFamilyService(svcLower) && !hasVerifiedGoogleAuth && profileHasBlockedGoogleSession && match.loggedIn) ||
        (isMicrosoftFamilyService(svcLower) && !hasVerifiedMicrosoftAuth && profileHasBlockedMicrosoftSession && match.loggedIn))
    ) {
      resolvedRows.push(row);
      continue;
    }

    if (match.loggedIn) {
      loggedInServicesSet.add(svc);
      if (isMailSvc) activeMailLoggedIn = true;
    } else if (!isMailSvc && svcLower !== "facebook" && svcLower !== "tiktok") {
      pendingSsoServiceRows.push(row);
    }

    const targetStatus = fbForcedOverride?.status || (match.loggedIn ? "logged_in" : "not_logged_in");
    const curSnap = row.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : null;
    const curStatus = String(curSnap?.status || "unknown");
    const curSpecific = String(curSnap?.specific_label || "").trim().toLowerCase();
    const curResCode = String(curSnap?.result_code || "").trim().toLowerCase();
    const hasPoisonedLoggedInMeta =
      targetStatus === "logged_in" &&
      (STALE_NON_LOGGED_IN_SPECIFIC_LABELS.has(curSpecific) ||
        curResCode === "login_page" ||
        curResCode === "false_positive_nid_reset" ||
        curResCode === "static_credential_record" ||
        String(curSnap?.auth_state || "").toLowerCase() === "session_expired" ||
        (isMicrosoftFamilyService(svcLower) && curResCode === "service_cookies"));
    const isExplicitClose =
      !isLiveWindow &&
      (String(source || "").endsWith("_close") || String(source || "").endsWith("_close_sync"));
    const liveCdpChanged = isLiveWindow
      ? !curSnap?.live_cdp || Number(curSnap?.debug_port || 0) !== cleanDebugPort
      : Boolean(curSnap?.live_cdp);

    if (isMailSvc && targetStatus === "logged_in" && (curStatus !== "logged_in" || hasPoisonedLoggedInMeta)) {
      newlyLoggedInMail = true;
    }

    const hasFreshDecryptedPairs =
      (isLiveWindow || isExplicitClose) && Array.isArray(pairs) && pairs.some((c) => c && c.value);

    const rowStatus = String(row.status || "").trim().toLowerCase();
    const curRowBrowser = String(row.browser || "").trim();
    const needsBrowserAssignmentUpdate =
      match.loggedIn &&
      ((svcLower === "facebook" &&
        hasVerifiedFacebookAuth &&
        curRowBrowser.padStart(4, "0") !== code) ||
        (!curRowBrowser &&
          ((isGoogleFamilyService(svcLower) && hasVerifiedGoogleAuth) ||
            (isMicrosoftFamilyService(svcLower) && hasVerifiedMicrosoftAuth) ||
            (svcLower === "tiktok" && hasVerifiedTikTokAuth) ||
            (isTwitterFamilyService(svcLower) && hasVerifiedTwitterAuth) ||
            (svcLower === "instagram" && hasVerifiedInstagramAuth) ||
            (Boolean(aiUidSpec) &&
              Boolean(verifiedAiServerUid) &&
              verifiedAiServerUid !== "nextauth_jwe_verified"))));
    const needsRowStatusPromotion =
      match.loggedIn &&
      !fbForcedOverride &&
      (!isRestrictedOrDisabledRow || (svcLower === "facebook" && hasVerifiedFacebookAuth)) &&
      (!isGoogleFamilyService(svcLower) || (isLiveWindow && hasVerifiedGoogleLiveTab) || hasVerifiedGoogleAuth) &&
      (!isMicrosoftFamilyService(svcLower) || (isLiveWindow && hasVerifiedMicrosoftLiveTab) || hasVerifiedMicrosoftAuth) &&
      ["check_phone", "check_mail", "checkpoint_qr", "appeal", "disable", "error", "wrong_2fa", "incorrect_info", "not_logged_in", "logged_in", ""].includes(rowStatus) &&
      (!(svcLower === "facebook" && rowStatus === "appeal") || hasVerifiedFacebookAuth);

    const existingRowNote = String(row.note || "").trim();
    const hasStaleChallengeNoteWhenLoggedIn =
      match.loggedIn &&
      !fbForcedOverride &&
      (!isGoogleFamilyService(svcLower) || (isLiveWindow && hasVerifiedGoogleLiveTab) || hasVerifiedGoogleAuth) &&
      (!isMicrosoftFamilyService(svcLower) || (isLiveWindow && hasVerifiedMicrosoftLiveTab) || hasVerifiedMicrosoftAuth) &&
      /(?:\[CHỜ QUÉT QR\]|\/challenge\/iap|Checkpoint Phone|Lệch mã 2FA Secret|Sai\/Lệch mã 2FA Secret|\[TẠM BỎ QUA|\[CHỜ SIM OTP|Wrong password on #|Mật khẩu của bạn đã thay đổi|Your password was changed|Mật khẩu không chính xác|Lệch tài khoản Outlook trên #|Microsoft identity \/ recovery verification required)/i.test(
        existingRowNote,
      );

    const needsLoggedInSessionKeyQuotaBackfill =
      targetStatus === "logged_in" &&
      Boolean(aiUidSpec && !curSnap?.login_verified_at);

    const needsForcedRowStatusDemotion =
      Boolean(fbForcedOverride?.rowStatus) &&
      rowStatus !== fbForcedOverride.rowStatus &&
      rowStatus !== "disable" &&
      rowStatus !== "banned" &&
      rowStatus !== "appeal";

    const needsAccountMismatchSnapshotUpdate =
      match.resultCode === "account_mismatch" &&
      (curResCode !== "account_mismatch" ||
        (match.actualAccount && String(curSnap?.actual_session_account || "") !== match.actualAccount));

    const isGmailRow = svcLower === "gmail" || svcLower === "google mail";
    const gcpLiveRestriction =
      isGmailRow && googleLiveTargetState?.restrictedServiceId === "47"
        ? googleLiveTargetState
        : null;
    const targetMailCloud = gcpLiveRestriction
      ? gcpLiveRestriction.rowStatus === "appeal"
        ? "🚨 Appeal"
        : String(row.mail_cloud || "") === "🚨 Appeal"
          ? "🚨 Appeal"
          : "🚫 Disable"
      : null;
    const targetGcpStatus = gcpLiveRestriction
      ? targetMailCloud === "🚨 Appeal"
        ? "appeal"
        : "disable"
      : null;
    const needsMailCloudUpdate = Boolean(
      targetMailCloud &&
        (String(row.mail_cloud || "") !== targetMailCloud ||
          String(curSnap?.restricted_service_id || "") !== "47" ||
          String(curSnap?.gcp_restriction_status || "") !== targetGcpStatus),
    );

    // Change-only check: skip PATCH if P0020 already has the exact clean status & liveCdp state (unless closing with fresh decrypted cookies)!
    if (
      curStatus === targetStatus &&
      (!row.stealth_status || String(row.stealth_status) === targetStatus) &&
      !hasPoisonedLoggedInMeta &&
      !liveCdpChanged &&
      !needsBrowserAssignmentUpdate &&
      !needsRowStatusPromotion &&
      !hasStaleChallengeNoteWhenLoggedIn &&
      !needsForcedRowStatusDemotion &&
      !needsLoggedInSessionKeyQuotaBackfill &&
      !needsAccountMismatchSnapshotUpdate &&
      !needsMailCloudUpdate &&
      !(isExplicitClose && match.loggedIn && hasFreshDecryptedPairs)
    ) {
      resolvedRows.push(row);
      continue;
    }

    const { nextSnap, patchBody } = buildP0020RowSnapshotAndPatch({
      row,
      svc,
      svcLower,
      code,
      profileId,
      source,
      nowIso,
      match,
      curSnap,
      targetStatus,
      fbForcedOverride,
      gcpLiveRestriction,
      targetGcpStatus,
      targetMailCloud,
      isLiveWindow,
      cleanDebugPort,
      rowStatusLower,
      gmailRestriction54Lifted,
      rowRestrictionAppliesToService,
      pairs,
      vaultEntryCookies,
      aiUidSpec,
      verifiedAiServerUid,
      verifiedAiMethod,
      verifiedElevenLabsOnboarding,
      verifiedCapcutConnectsCount,
      cachedGoogleHttpVerify,
      cachedMicrosoftHttpVerify,
      hasVerifiedFacebookAuth,
      hasVerifiedTikTokAuth,
      cachedTikTokHttpVerify,
      hasVerifiedTwitterAuth,
      cachedTwitterHttpVerify,
      hasVerifiedInstagramAuth,
      cachedInstagramHttpVerify,
      needsRowStatusPromotion,
      hasStaleChallengeNoteWhenLoggedIn,
      existingRowNote,
      hasFreshDecryptedPairs,
      needsBrowserAssignmentUpdate,
    });

    const nextResCode = String(nextSnap.result_code || "").trim().toLowerCase();
    const isPassiveBackgroundSweep =
      !isLiveWindow &&
      /reconcile|heal_sweep|startup/i.test(String(source || ""));
    const isRealAccountSessionTransition =
      (curStatus !== targetStatus &&
        !(curStatus === "unknown" && targetStatus === "not_logged_in" && nextResCode === "login_page") &&
        !(isPassiveBackgroundSweep && targetStatus === "not_logged_in")) ||
      (targetStatus === "challenged" && curResCode !== nextResCode) ||
      (needsRowStatusPromotion && row.status !== "active") ||
      (needsForcedRowStatusDemotion && patchBody.status && patchBody.status !== row.status) ||
      needsAccountMismatchSnapshotUpdate ||
      (needsBrowserAssignmentUpdate && curRowBrowser.padStart(4, "0") !== code);
    const shouldLogForLiveProfileOpen =
      isLiveWindow && (targetStatus === "logged_in" || targetStatus === "challenged");

    const sessionLogMsg =
      isRealAccountSessionTransition || shouldLogForLiveProfileOpen
        ? formatStealthSessionLogMessage({
            code,
            service: svc,
            account: row.account,
            status: nextSnap.status,
            resultCode: nextSnap.result_code,
            specificLabelText: nextSnap.specific_label_text,
          })
        : "";
    const launchLogDecision = sessionLogMsg
      ? resolveStealthRowLaunchLogDecision(row.id, code, sessionLogMsg, {
          isLiveWindow,
          nowIso,
        })
      : { shouldEmit: false, replaceAt: null };
    const shouldWriteSessionLog = Boolean(sessionLogMsg) && launchLogDecision.shouldEmit;
    if (shouldWriteSessionLog) {
      patchBody.log_tip_at = nowIso;
      patchBody.log_tip_message = sessionLogMsg;
    }

    try {
      const patchRes = await fetch(
        `${cfg.url}/rest/v1/twofa_accounts?id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(patchBody),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (patchRes.ok) {
        if (shouldWriteSessionLog) {
          void appendStealthSessionLogToP0020Row({
            cfg,
            headers,
            accountId: row.id,
            at: nowIso,
            message: sessionLogMsg,
            origin: "p0003:stealth",
            replaceAt: launchLogDecision.replaceAt,
          });
        }
        const dbRows = await patchRes.json().catch(() => null);
        const dbRow = Array.isArray(dbRows) && dbRows[0] ? dbRows[0] : null;
        const effectiveSnapFromDb =
          dbRow?.stealth_snapshot && typeof dbRow.stealth_snapshot === "object"
            ? dbRow.stealth_snapshot
            : nextSnap;
        const effectiveStatusFromDb = dbRow?.status || patchBody.status || row.status;
        const effectiveBrowserFromDb = dbRow?.browser || patchBody.browser || row.browser;
        patchedCount += 1;
        patchedServicesSet.add(svc);
        const updatedRow = {
          ...row,
          browser: effectiveBrowserFromDb,
          status: effectiveStatusFromDb,
          stealth_snapshot: effectiveSnapFromDb,
          stealth_checked_at: dbRow?.stealth_checked_at || nowIso,
          // Note travels to P0020 only when THIS patch wrote it. `row.note` is the pre-patch read:
          // echoing it reverted a Note the user saved in P0020 between our read and this emit.
          ...(Object.prototype.hasOwnProperty.call(patchBody, "note")
            ? { note: typeof dbRow?.note === "string" ? dbRow.note : patchBody.note, _noteChanged: true }
            : {}),
          ...(shouldWriteSessionLog
            ? {
                log_tip_at: nowIso,
                log_tip_message: sessionLogMsg,
                _sessionLogEntry: {
                  at: nowIso,
                  message: sessionLogMsg,
                  origin: "p0003:stealth",
                },
              }
            : {}),
        };
        patchedRows.push(updatedRow);
        resolvedRows.push(updatedRow);
        continue;
      }
    } catch {
      /* ignore transient network error */
    }
    resolvedRows.push(row);
  }

  if (patchedRows.length > 0) {
    emitStealthLiveSyncEvent({
      profileCode: code,
      profileId: profileId || null,
      source,
      timestamp: nowIso,
      patchedCount,
      rows: patchedRows.map((r) => ({
        rowId: r.id,
        code,
        service: r.service,
        account: r.account,
        accountStatus: r.status,
        ...(r._noteChanged ? { note: String(r.note ?? ""), noteChanged: true } : {}),
        stealthSnapshot: r.stealth_snapshot,
        ...(r._sessionLogEntry ? { logEntry: r._sessionLogEntry } : {}),
      })),
    });
  }

  return {
    ok: true,
    checkedRows: rows.length,
    patchedCount,
    newlyLoggedInMail,
    activeMailLoggedIn,
    pendingSsoServiceRows: activeMailLoggedIn ? pendingSsoServiceRows : [],
    loggedInServices: Array.from(loggedInServicesSet),
    patchedServices: Array.from(patchedServicesSet),
    rows: resolvedRows,
  };
}

module.exports = {
  buildMailCookieTelemetryMetadata,
  normalizeComparableEmail,
  areComparableEmailsEqual,
  resolveServicePasswordEcosystem,
  canPropagatePasswordBetweenServices,
  SERVICE_COOKIE_MATCHERS,
  resolveServiceMatcher,
  matchServiceCookiePairs,
  readProfileDiskCookiePairs,
  resolveProfileDpapiMasterKey,
  decryptChromiumCookieValue,
  readProfileSpaStorageSummary,
  matchServiceSpaStorage,
  isProfileStorageModifiedWithinHours,
  reconcileAllProfilesDiskCookiesToP0020,
  fetchLiveCdpCookiesByPort,
  fetchLiveCdpPageTargetsByPort,
  autoSkipGoogleSpeedbumpTargets,
  autoHealCompletedGoogleChallengeTabs,
  autoHealCompletedSocialChallengeTabs,
  isAuthenticatedFacebookAppUrl,
  isAuthenticatedTikTokAppUrl,
  classifyFacebookLiveCdpTargets,
  classifyGoogleLiveCdpTargets,
  GOOGLE_RESTRICTION_ID_MAP,
  resolveGoogleRestrictionInfo,
  resolveGoogleRestrictionTargetServices,
  doesGoogleTargetRestrictionApplyToService,
  isAuthenticatedGoogleAppUrl,
  isGoogleFamilyService,
  REVOKED_GOOGLE_AUTH_COOKIE_NAMES,
  purgeRevokedGoogleAuthCookiesForProfile,
  classifyMicrosoftLiveCdpTargets,
  autoHealCompletedMicrosoftChallengeTabs,
  isAuthenticatedMicrosoftAppUrl,
  isMicrosoftFamilyService,
  REVOKED_MICROSOFT_AUTH_COOKIE_NAMES,
  purgeRevokedMicrosoftAuthCookiesForProfile,
  verifyFacebookCookiesLiveViaHttp,
  verifyTikTokCookiesLiveViaHttp,
  verifyGoogleCookiesLiveViaHttp,
  verifyMicrosoftCookiesLiveViaHttp,
  verifyTwitterCookiesLiveViaHttp,
  verifyInstagramCookiesLiveViaHttp,
  classifyClaudeLiveCdpTargets,
  verifyClaudeCookiesLiveViaHttp,
  setLiveCdpCookiesByPort,
  syncLiveCdpCookiesToVaultIfChanged,
  syncLiveContextCookiesToVaultIfChanged,
  syncProfilePlatformsToP0020IfChanged,
  syncProfileWindowLiveCdpStateToP0020,
  syncProfileActivityLogToP0020Rows,
  filterActivityTargetRowsOnProfile,
  formatStealthSessionLogMessage,
  markStealthProfileLaunchWindowState,
  resolveStealthRowLaunchLogDecision,
  appendStealthSessionLogToP0020Row,
  shouldPreserveChallengedState,
  isFacebookRowInCheckpointOrDisabled,
  healStaleRunningP0020Rows,
  healStaleChallengedAndErrorP0020Rows,
  startStaleRunningP0020Healer,
  hydrateProfileCookiesFromP0020Vault,
  onStealthLiveSyncEvent,
  emitStealthLiveSyncEvent,
};
