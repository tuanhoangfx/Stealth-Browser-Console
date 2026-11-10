"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const COOKIES_REL_PATH = path.join("Default", "Network", "Cookies");
const COOKIES_BAK_REL_PATH = path.join("Default", "Network", "Cookies.last-good.bak");
const COOKIES_META_REL_PATH = path.join("Default", "Network", "Cookies.guard-meta.json");
const COOKIES_VAULT_HYDRATED_REL_PATH = path.join("Default", "Network", "Cookies.vault-hydrated.json");
const LOCAL_STATE_REL_PATH = "Local State";
const LOCAL_STATE_BAK_REL_PATH = "Local State.last-good.bak";
const LOCAL_STORAGE_REL_PATH = path.join("Default", "Local Storage", "leveldb");
const LOCAL_STORAGE_BAK_REL_PATH = path.join("Default", "Local Storage", "leveldb.last-good.bak");
const WEBKIT_EPOCH_DIFF_MS = 11644473600000n;

function inspectLevelDbDirBytes(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return { exists: false, dataBytes: 0, fileCount: 0 };
  try {
    const entries = fs.readdirSync(dirPath);
    let dataBytes = 0;
    let fileCount = 0;
    for (const name of entries) {
      if (name === "LOCK" || name.endsWith(".tmp")) continue;
      if (/\.(ldb|log)$/i.test(name) || name === "CURRENT" || name.startsWith("MANIFEST-")) {
        const st = fs.statSync(path.join(dirPath, name));
        if (st.isFile()) {
          dataBytes += st.size;
          fileCount += 1;
        }
      }
    }
    return { exists: true, dataBytes, fileCount };
  } catch {
    return { exists: false, dataBytes: 0, fileCount: 0 };
  }
}

function snapshotLocalStorageIfHealthy(userDataDir, { force = false } = {}) {
  if (!userDataDir) return { snapshotted: false };
  const srcDir = path.join(userDataDir, LOCAL_STORAGE_REL_PATH);
  const bakDir = path.join(userDataDir, LOCAL_STORAGE_BAK_REL_PATH);
  const cur = inspectLevelDbDirBytes(srcDir);
  if (!cur.exists || cur.dataBytes < 64) return { snapshotted: false };

  const prev = inspectLevelDbDirBytes(bakDir);
  if (!force && prev.exists && cur.dataBytes < Math.floor(prev.dataBytes * 0.5)) {
    return { snapshotted: false, reason: "degraded_local_storage" };
  }

  try {
    fs.mkdirSync(bakDir, { recursive: true });
    for (const oldFile of fs.readdirSync(bakDir)) {
      try {
        fs.unlinkSync(path.join(bakDir, oldFile));
      } catch {
        /* ignore */
      }
    }
    for (const name of fs.readdirSync(srcDir)) {
      if (name === "LOCK" || name.endsWith(".tmp")) continue;
      const srcFile = path.join(srcDir, name);
      try {
        if (fs.statSync(srcFile).isFile()) {
          fs.copyFileSync(srcFile, path.join(bakDir, name));
        }
      } catch {
        /* ignore locked file */
      }
    }
    return { snapshotted: true, dataBytes: cur.dataBytes };
  } catch {
    return { snapshotted: false };
  }
}

function restoreLocalStorageBackup(userDataDir, { force = false } = {}) {
  if (!userDataDir) return { restored: false };
  const srcDir = path.join(userDataDir, LOCAL_STORAGE_REL_PATH);
  const bakDir = path.join(userDataDir, LOCAL_STORAGE_BAK_REL_PATH);
  const bak = inspectLevelDbDirBytes(bakDir);
  if (!bak.exists || bak.dataBytes < 64) return { restored: false };

  const cur = inspectLevelDbDirBytes(srcDir);
  if (!force && cur.exists && cur.dataBytes >= Math.floor(bak.dataBytes * 0.5)) {
    return { restored: false };
  }

  try {
    fs.mkdirSync(srcDir, { recursive: true });
    for (const oldFile of fs.readdirSync(srcDir)) {
      if (oldFile === "LOCK") continue;
      try {
        fs.unlinkSync(path.join(srcDir, oldFile));
      } catch {
        /* ignore */
      }
    }
    for (const name of fs.readdirSync(bakDir)) {
      if (name === "LOCK") continue;
      const bakFile = path.join(bakDir, name);
      if (fs.statSync(bakFile).isFile()) {
        fs.copyFileSync(bakFile, path.join(srcDir, name));
      }
    }
    return { restored: true, dataBytes: bak.dataBytes };
  } catch {
    return { restored: false };
  }
}

/**
 * Inspects a profile's SQLite `Default/Network/Cookies` table in read-only mode (via temp copy)
 * and returns row counts plus presence of core authentication cookies (Google, Outlook, Facebook, TikTok).
 */
function inspectProfileSqliteCookiesSummary(userDataDir) {
  const empty = {
    exists: false,
    readable: false,
    totalRows: 0,
    authDomainsCount: 0,
    hasGoogleAuth: false,
    hasOutlookAuth: false,
    hasFacebookAuth: false,
    hasTikTokAuth: false,
    byteSize: 0,
  };
  if (!userDataDir) return empty;
  const ckPath = path.join(userDataDir, COOKIES_REL_PATH);
  if (!fs.existsSync(ckPath)) return empty;

  let byteSize = 0;
  try {
    byteSize = fs.statSync(ckPath).size;
  } catch {
    return empty;
  }

  return inspectSqliteCookiesFile(ckPath, byteSize);
}

function openSqliteTempSync(tmpFile) {
  try {
    const BetterSqlite3 = require("better-sqlite3");
    return new BetterSqlite3(tmpFile);
  } catch {
    const { DatabaseSync } = require("node:sqlite");
    return new DatabaseSync(tmpFile, { open: true });
  }
}

function inspectSqliteCookiesFile(ckPath, byteSize = 0) {
  const empty = {
    exists: true,
    readable: false,
    totalRows: 0,
    domainsCount: 0,
    authDomainsCount: 0,
    hasGoogleAuth: false,
    hasOutlookAuth: false,
    hasFacebookAuth: false,
    hasTikTokAuth: false,
    byteSize,
  };
  if (!fs.existsSync(ckPath)) return { ...empty, exists: false };

  const tmpFile = path.join(
    os.tmpdir(),
    `p0003-ck-guard-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
  );
  let db = null;
  try {
    try {
      fs.copyFileSync(ckPath, tmpFile);
    } catch {
      const buf = fs.readFileSync(ckPath);
      fs.writeFileSync(tmpFile, buf);
    }
    for (const suffix of ["-wal", "-journal"]) {
      const sideSrc = `${ckPath}${suffix}`;
      if (fs.existsSync(sideSrc)) {
        try {
          fs.copyFileSync(sideSrc, `${tmpFile}${suffix}`);
        } catch {
          /* ignore */
        }
      }
    }
    db = openSqliteTempSync(tmpFile);
    const totalRow = db
      .prepare("SELECT COUNT(*) AS cnt, COUNT(DISTINCT host_key) AS dcnt FROM cookies")
      .get();
    const totalRows = Number(totalRow?.cnt || 0);
    const domainsCount = Number(totalRow?.dcnt || 0);
    if (totalRows === 0) {
      return {
        ...empty,
        readable: true,
        totalRows: 0,
        domainsCount: 0,
      };
    }

    const authRows = db
      .prepare(
        `SELECT host_key, name FROM cookies
         WHERE (host_key LIKE '%google.%' AND name IN ('SID', '__Secure-1PSID', '__Secure-3PSID', 'HSID', 'SAPISID', '__Secure-1PAPISID', '__Secure-3PAPISID', 'APISID'))
            OR ((host_key LIKE '%live.com%' OR host_key LIKE '%outlook.com%' OR host_key LIKE '%office.com%')
                AND name IN ('RPSSecAuth', 'MSPAuth', 'WLSSC', 'OwaUserState', 'DefaultAnchorMailbox'))
            OR (host_key LIKE '%facebook.com%' AND name = 'c_user')
            OR (host_key LIKE '%tiktok.com%' AND name IN ('sessionid', 'sessionid_ss', 'sid_tt'))`,
      )
      .all();

    let hasDotGoogleSid = false;
    let hasDotGoogleSapisid = false;
    let hasRegionalGoogleAuth = false;
    let hasOutlookAuth = false;
    let hasFacebookAuth = false;
    let hasTikTokAuth = false;

    for (const r of Array.isArray(authRows) ? authRows : []) {
      const h = String(r?.host_key || "").toLowerCase();
      const n = String(r?.name || "");
      if (h === ".google.com" || h === "google.com") {
        if (n === "SID" || n === "__Secure-1PSID" || n === "__Secure-3PSID") {
          hasDotGoogleSid = true;
        }
        if (n === "SAPISID" || n === "__Secure-1PAPISID" || n === "__Secure-3PAPISID") {
          hasDotGoogleSapisid = true;
        }
      } else if (h.includes("google.") && (n === "SID" || n === "__Secure-1PSID" || n === "__Secure-3PSID")) {
        hasRegionalGoogleAuth = true;
      }
      if (
        (h.includes("live.com") || h.includes("outlook.com") || h.includes("office.com")) &&
        (n === "RPSSecAuth" || n === "MSPAuth" || n === "WLSSC" || n === "OwaUserState" || n === "DefaultAnchorMailbox")
      ) {
        hasOutlookAuth = true;
      }
      if (h.includes("facebook.com") && n === "c_user") {
        hasFacebookAuth = true;
      }
      if (h.includes("tiktok.com") && (n === "sessionid" || n === "sessionid_ss" || n === "sid_tt")) {
        hasTikTokAuth = true;
      }
    }

    const hasGoogleAuth = hasDotGoogleSid || hasDotGoogleSapisid;

    const authDomainsCount =
      (hasGoogleAuth ? 1 : 0) +
      (hasOutlookAuth ? 1 : 0) +
      (hasFacebookAuth ? 1 : 0) +
      (hasTikTokAuth ? 1 : 0);

    return {
      exists: true,
      readable: true,
      totalRows,
      domainsCount,
      authDomainsCount,
      hasGoogleAuth,
      hasRegionalGoogleAuth,
      hasOutlookAuth,
      hasFacebookAuth,
      hasTikTokAuth,
      byteSize,
    };
  } catch {
    return empty;
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      try {
        const p = `${tmpFile}${suffix}`;
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

function hasValidEncryptedKey(localStatePath) {
  if (!fs.existsSync(localStatePath)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
    return Boolean(raw?.os_crypt?.encrypted_key && String(raw.os_crypt.encrypted_key).length > 16);
  } catch {
    return false;
  }
}

function readGuardMeta(userDataDir) {
  const metaPath = path.join(userDataDir, COOKIES_META_REL_PATH);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

function writeGuardMeta(userDataDir, summary) {
  const metaPath = path.join(userDataDir, COOKIES_META_REL_PATH);
  try {
    fs.mkdirSync(path.dirname(metaPath), { recursive: true });
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          totalRows: summary.totalRows,
          domainsCount: Number(summary.domainsCount || 0),
          authDomainsCount: summary.authDomainsCount,
          hasGoogleAuth: summary.hasGoogleAuth,
          hasOutlookAuth: summary.hasOutlookAuth,
          hasFacebookAuth: summary.hasFacebookAuth,
          hasTikTokAuth: summary.hasTikTokAuth,
          byteSize: summary.byteSize,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Snapshots `Default/Network/Cookies` -> `Cookies.last-good.bak` and `Local State` -> `Local State.last-good.bak`
 * ONLY when the current Cookies DB is non-empty and has not lost auth domains compared to the existing backup.
 */
function snapshotProfileCookiesIfHealthy(userDataDir, { profileCode = "", force = false } = {}) {
  if (!userDataDir) return { snapshotted: false, reason: "no_dir" };
  const ckPath = path.join(userDataDir, COOKIES_REL_PATH);
  const bakPath = path.join(userDataDir, COOKIES_BAK_REL_PATH);
  const lsPath = path.join(userDataDir, LOCAL_STATE_REL_PATH);
  const lsBakPath = path.join(userDataDir, LOCAL_STATE_BAK_REL_PATH);

  if (!force && fs.existsSync(bakPath) && fs.existsSync(ckPath)) {
    try {
      const ckStat = fs.statSync(ckPath);
      const bakStat = fs.statSync(bakPath);
      const { resolveProfileBackupRoot } = require("./native-session-backup.cjs");
      const slotManifestPath = path.join(resolveProfileBackupRoot(userDataDir), "slot-latest", "manifest.json");
      let hasV2Slot = false;
      if (fs.existsSync(slotManifestPath)) {
        try {
          const m = JSON.parse(fs.readFileSync(slotManifestPath, "utf8"));
          hasV2Slot = Number(m?.version || 1) >= 2;
        } catch {
          hasV2Slot = false;
        }
      }
      // Only skip when Cookies has NOT been modified since the last backup, matches size, AND v2 slot-latest exists.
      if (
        hasV2Slot &&
        bakStat.size > 20480 &&
        ckStat.size === bakStat.size &&
        ckStat.mtimeMs <= bakStat.mtimeMs + 500
      ) {
        return { snapshotted: false, reason: "recent_backup_fresh" };
      }
    } catch {
      /* continue */
    }
  }

  if (hasValidEncryptedKey(lsPath)) {
    try {
      if (!fs.existsSync(lsBakPath) || force) {
        fs.copyFileSync(lsPath, lsBakPath);
      }
    } catch {
      /* best-effort */
    }
  }

  // Zero-External-SQLite-Write invariant: never call sanitizeProfileSqliteCookiesInPlace(userDataDir)
  // on Default/Network/Cookies during automatic background/post-close snapshots. Only Chromium may write to Cookies.

  const current = inspectProfileSqliteCookiesSummary(userDataDir);
  if (!current.exists || !current.readable || current.totalRows <= 0) {
    if (force && fs.existsSync(bakPath)) {
      try {
        const { snapshotProfileNativeSession } = require("./native-session-backup.cjs");
        const seeded = snapshotProfileNativeSession(userDataDir, {
          profileCode,
          force,
          inspectSqliteCookiesFile,
          unprotectDpapiKey,
        });
        if (seeded.ok) {
          return { snapshotted: true, seededFromBakWhileLocked: true, current: seeded.current };
        }
      } catch {
        /* ignore */
      }
    }
    return { snapshotted: false, reason: "empty_or_unreadable", current };
  }

  let prevMeta = readGuardMeta(userDataDir);
  if (!prevMeta && fs.existsSync(bakPath)) {
    try {
      prevMeta = inspectSqliteCookiesFile(bakPath, fs.statSync(bakPath).size);
    } catch {
      prevMeta = null;
    }
  }
  if (!force && fs.existsSync(bakPath) && prevMeta) {
    const wipedAllAuthDomains =
      Number(prevMeta.authDomainsCount || 0) > 0 && Number(current.authDomainsCount || 0) === 0;
    const severeRowDrop =
      Number(prevMeta.totalRows || 0) > 0 &&
      current.totalRows < Math.floor(Number(prevMeta.totalRows || 0) * 0.4);
    if (wipedAllAuthDomains || severeRowDrop) {
      return {
        snapshotted: false,
        reason: wipedAllAuthDomains ? "lost_core_auth_domain_compared_to_backup" : "degraded_compared_to_backup",
        current,
        prevMeta,
      };
    }
  }

  try {
    fs.copyFileSync(ckPath, bakPath);
    if (hasValidEncryptedKey(lsPath)) {
      fs.copyFileSync(lsPath, lsBakPath);
    }
    writeGuardMeta(userDataDir, current);
    const lsSnap = snapshotLocalStorageIfHealthy(userDataDir, { force });
    if (force) {
      try {
        const { snapshotProfileNativeSession } = require("./native-session-backup.cjs");
        snapshotProfileNativeSession(userDataDir, {
          profileCode,
          force,
          inspectSqliteCookiesFile,
          unprotectDpapiKey,
        });
      } catch {
        /* best-effort */
      }
    }
    return { snapshotted: true, localStorageSnapshotted: lsSnap.snapshotted, current };
  } catch (err) {
    return { snapshotted: false, reason: err?.message || "copy_failed" };
  }
}

/**
 * Checks whether `Default/Network/Cookies` or `Local State` was wiped/corrupted and automatically restores
 * from `Cookies.last-good.bak` / `Local State.last-good.bak` when a wipe is detected.
 */
function normalizeUnpartitionedCrossSiteAncestorRows(sqlitePath) {
  if (!sqlitePath || !fs.existsSync(sqlitePath)) return 0;
  let db = null;
  try {
    const { DatabaseSync } = require("node:sqlite");
    db = new DatabaseSync(sqlitePath);
    const bad = db
      .prepare("SELECT COUNT(*) AS c FROM cookies WHERE top_frame_site_key = '' AND (has_cross_site_ancestor != 1 OR source_type = 0)")
      .get()?.c;
    if (!bad) {
      db.close();
      return 0;
    }
    const upd = db
      .prepare("UPDATE OR REPLACE cookies SET has_cross_site_ancestor = 1, source_type = CASE WHEN source_type = 0 THEN 1 ELSE source_type END WHERE top_frame_site_key = '' AND (has_cross_site_ancestor != 1 OR source_type = 0)")
      .run();
    db.close();
    return Number(upd.changes) || 0;
  } catch {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    return 0;
  }
}

function isHealthyProfileCookiesFileFast(ckPath, lsPath) {
  try {
    if (!ckPath || !fs.existsSync(ckPath)) return false;
    const st = fs.statSync(ckPath);
    if (st.size <= 20480) return false;
    if (lsPath && !fs.existsSync(lsPath)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Proposal 2 (`ok 2`) + Proposal 3 (`ok 3`):
 * - Removes legacy `Cookies.vault-hydrated.json` sidecar files left in profile directories.
 * - Cleans abandoned 0-byte `Cookies-journal` / `Cookies-wal` (and orphaned `Cookies-shm`)
 *   when a profile is unlocked before launch so Chromium opens SQLite `Cookies` with 0ms WAL recovery stall.
 */
function cleanPreLaunchCookieSidecars(userDataDir, ckPath) {
  let cleanedSidecars = 0;
  try {
    const journalPath = `${ckPath}-journal`;
    if (fs.existsSync(journalPath) && fs.statSync(journalPath).size === 0) {
      fs.unlinkSync(journalPath);
      cleanedSidecars += 1;
    }
  } catch {
    /* ignore */
  }
  try {
    const walPath = `${ckPath}-wal`;
    const shmPath = `${ckPath}-shm`;
    const walExists = fs.existsSync(walPath);
    const shmExists = fs.existsSync(shmPath);
    if (walExists && fs.statSync(walPath).size === 0) {
      try {
        fs.unlinkSync(walPath);
        cleanedSidecars += 1;
      } catch {
        /* ignore */
      }
      if (shmExists) {
        try {
          fs.unlinkSync(shmPath);
          cleanedSidecars += 1;
        } catch {
          /* ignore */
        }
      }
    } else if (!walExists && shmExists) {
      try {
        fs.unlinkSync(shmPath);
        cleanedSidecars += 1;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return cleanedSidecars;
}

function autoHealWipedProfileCookies(userDataDir, { forceCheck = false } = {}) {
  if (!userDataDir) return { healed: false, reason: "no_dir" };
  const ckPath = path.join(userDataDir, COOKIES_REL_PATH);
  const bakPath = path.join(userDataDir, COOKIES_BAK_REL_PATH);
  const lsPath = path.join(userDataDir, LOCAL_STATE_REL_PATH);
  const lsBakPath = path.join(userDataDir, LOCAL_STATE_BAK_REL_PATH);

  const cleanedSidecars = cleanPreLaunchCookieSidecars(userDataDir, ckPath);

  const current = inspectProfileSqliteCookiesSummary(userDataDir);
  const bakSummary = fs.existsSync(bakPath) ? inspectSqliteCookiesFile(bakPath, fs.statSync(bakPath).size) : null;
  const prevMeta = readGuardMeta(userDataDir) || bakSummary;

  const lostCoreAuthInCurrent =
    Boolean(bakSummary?.readable) &&
    ((bakSummary.hasFacebookAuth && !current.hasFacebookAuth) ||
      (bakSummary.hasGoogleAuth && !current.hasGoogleAuth) ||
      (bakSummary.hasOutlookAuth && !current.hasOutlookAuth) ||
      (bakSummary.hasTikTokAuth && !current.hasTikTokAuth));

  // Fast-path (<0.5ms, Strict Zero-Write): When the profile's native Chromium Default/Network/Cookies
  // and Local State already exist, are non-empty (>20KB), and have not lost core .google.com / Outlook / FB / TikTok auth,
  // let CloakBrowser open its native SQLite database untouched.
  if (!forceCheck && !lostCoreAuthInCurrent && isHealthyProfileCookiesFileFast(ckPath, lsPath)) {
    return {
      healed: false,
      localStateRestored: false,
      localStorageRestored: false,
      cookiesRestored: false,
      cleanedSidecars,
      fastPath: true,
    };
  }

  let localStateRestored = false;
  if (!hasValidEncryptedKey(lsPath) && hasValidEncryptedKey(lsBakPath)) {
    try {
      fs.copyFileSync(lsBakPath, lsPath);
      localStateRestored = true;
    } catch {
      /* ignore */
    }
  }
  const lsLevelDbHeal = restoreLocalStorageBackup(userDataDir, { force: false });
  const localStorageRestored = Boolean(lsLevelDbHeal.restored);

  if (!fs.existsSync(bakPath) && !lostCoreAuthInCurrent) {
    const currentNoBak = current;
    if (!currentNoBak.exists || (currentNoBak.readable && currentNoBak.totalRows === 0)) {
      const code = String(path.basename(String(userDataDir || "")).match(/^(\d{4})\b/)?.[1] || "").trim().padStart(4, "0");
      if (/^\d{4}$/.test(code)) {
        const vault = collectVaultCookiesForProfileCode(code, { userDataDir });
        if (vault.allCookies.length > 0) {
          const inj = injectVaultCookiesIntoClosedSqlite(userDataDir, vault.allCookies);
          if (inj.injectedCount > 0) {
            const snap = snapshotProfileCookiesIfHealthy(userDataDir, { force: true });
            return {
              healed: true,
              localStateRestored,
              localStorageRestored,
              cookiesRestored: true,
              restoredFromVault: true,
              restoredRows: inj.injectedCount,
              initialSnapshot: snap.snapshotted,
            };
          }
        }
      }
    }
    const snap = snapshotProfileCookiesIfHealthy(userDataDir);
    return {
      healed: localStateRestored || localStorageRestored,
      localStateRestored,
      localStorageRestored,
      initialSnapshot: snap.snapshotted,
    };
  }

  const wipedToZero = (!current.exists || (current.readable && current.totalRows === 0)) && (prevMeta?.totalRows || 0) > 0;

  if (!wipedToZero && lostCoreAuthInCurrent) {
    try {
      const reconciled = extractDecryptedCookiesFromProfileSqlite(userDataDir);
      if (reconciled.ok && reconciled.cookies.length > 0) {
        const missingDomainCookies = reconciled.cookies.filter((c) => {
          const d = String(c?.domain || "").toLowerCase();
          if (
            !current.hasGoogleAuth &&
            (bakSummary?.hasGoogleAuth || current.hasRegionalGoogleAuth) &&
            (d.includes("google.") || d.includes("youtube.com"))
          ) {
            return true;
          }
          if (
            !current.hasOutlookAuth &&
            bakSummary.hasOutlookAuth &&
            (d.includes("live.com") || d.includes("outlook.com") || d.includes("office.com") || d.includes("microsoft"))
          ) {
            return true;
          }
          if (!current.hasFacebookAuth && bakSummary.hasFacebookAuth && (d.includes("facebook.com") || d.includes("fb.com"))) {
            return true;
          }
          if (!current.hasTikTokAuth && bakSummary.hasTikTokAuth && d.includes("tiktok.com")) {
            return true;
          }
          return false;
        });
        if (missingDomainCookies.length > 0) {
          const inj = injectVaultCookiesIntoClosedSqlite(userDataDir, missingDomainCookies);
          if (inj.injectedCount > 0) {
            return {
              healed: true,
              localStateRestored,
              localStorageRestored,
              cookiesRestored: true,
              reconciledAuthFromBak: true,
              restoredRows: inj.injectedCount,
            };
          }
        }
      }
    } catch {
      /* fallback below */
    }
  }

  if (!wipedToZero) {
    // Zero-Interference Native Cookie Persistence:
    // Never mutate, overwrite, or inject into Default/Network/Cookies when the profile's SQLite DB is non-empty
    // and has not lost any core authenticated domain present in Cookies.last-good.bak.
    return {
      healed: localStateRestored || localStorageRestored,
      localStateRestored,
      localStorageRestored,
      cookiesRestored: false,
    };
  }

  try {
    fs.mkdirSync(path.dirname(ckPath), { recursive: true });
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      const sideFile = `${ckPath}${suffix}`;
      if (fs.existsSync(sideFile)) {
        try {
          fs.unlinkSync(sideFile);
        } catch {
          /* ignore */
        }
      }
    }
    fs.copyFileSync(bakPath, ckPath);
    console.warn(
      `[cookie-guard] Auto-healed wiped Cookies DB in ${path.basename(userDataDir)} (restored ${prevMeta?.totalRows || "?"} cookies, authDomains=${prevMeta?.authDomainsCount || 0})`,
    );
    return {
      healed: true,
      localStateRestored,
      localStorageRestored,
      cookiesRestored: true,
      restoredRows: prevMeta?.totalRows || 0,
      restoredAuthDomains: prevMeta?.authDomainsCount || 0,
    };
  } catch (err) {
    return {
      healed: localStateRestored || localStorageRestored,
      localStateRestored,
      localStorageRestored,
      cookiesRestored: false,
      error: err?.message || "restore_failed",
    };
  }
}

/**
 * Engine-level guard on Playwright `BrowserContext.clearCookies`:
 * Prevents any accidental un-scoped `context.clearCookies()` call (missing `domain` and `name`)
 * from wiping the entire multi-service profile cookie database unless `allowGlobalWipe: true` is passed.
 */
function matchPlaywrightCookieFilter(cookie, filter = {}) {
  if (!cookie || !filter) return false;
  if (filter.name) {
    const matchedName =
      typeof filter.name === "string"
        ? cookie.name === filter.name
        : filter.name instanceof RegExp
          ? filter.name.test(String(cookie.name || ""))
          : false;
    if (!matchedName) return false;
  }
  if (filter.domain) {
    const rawDomain = String(cookie.domain || "");
    const cleanDomain = rawDomain.replace(/^\./, "");
    const matchedDomain =
      typeof filter.domain === "string"
        ? rawDomain === filter.domain || cleanDomain === String(filter.domain).replace(/^\./, "")
        : filter.domain instanceof RegExp
          ? filter.domain.test(rawDomain) || filter.domain.test(cleanDomain)
          : false;
    if (!matchedDomain) return false;
  }
  if (filter.path) {
    const matchedPath =
      typeof filter.path === "string"
        ? cookie.path === filter.path
        : filter.path instanceof RegExp
          ? filter.path.test(String(cookie.path || "/"))
          : false;
    if (!matchedPath) return false;
  }
  return true;
}

async function deleteMatchingCookiesFromContextSurgically(context, options, origClearCookies) {
  if (typeof context.cookies !== "function") {
    return origClearCookies(options);
  }
  let allCookies = [];
  try {
    allCookies = await context.cookies();
  } catch {
    return;
  }
  const toDelete = (Array.isArray(allCookies) ? allCookies : []).filter((c) =>
    matchPlaywrightCookieFilter(c, options),
  );
  if (toDelete.length === 0) return;

  const pages = typeof context.pages === "function" ? context.pages().filter((p) => !p.isClosed?.()) : [];
  if (pages.length > 0 && typeof context.newCDPSession === "function") {
    let cdp = null;
    try {
      cdp = await context.newCDPSession(pages[0]);
      for (const c of toDelete) {
        await cdp
          .send("Network.deleteCookies", {
            name: c.name,
            domain: c.domain,
            path: c.path || "/",
          })
          .catch(() => undefined);
      }
      await cdp.detach().catch(() => undefined);
      return;
    } catch {
      if (cdp) await cdp.detach().catch(() => undefined);
    }
  }

  if (typeof context.addCookies === "function") {
    await context
      .addCookies(
        toDelete.map((c) => ({
          name: c.name,
          value: "",
          domain: c.domain,
          path: c.path || "/",
          expires: 1,
          secure: Boolean(c.secure),
          httpOnly: Boolean(c.httpOnly),
          ...(c.sameSite ? { sameSite: c.sameSite } : {}),
        })),
      )
      .catch(() => undefined);
  }
}

function installPlaywrightContextCookieGuard(context, { userDataDir = "", profileCode = "" } = {}) {
  if (!context || typeof context.clearCookies !== "function" || context._p0003CookieGuardInstalled) {
    return context;
  }
  const origClearCookies = context.clearCookies.bind(context);
  Object.defineProperty(context, "_p0003CookieGuardInstalled", {
    value: true,
    enumerable: false,
    configurable: true,
  });

  context.clearCookies = async function p0003GuardedClearCookies(options = {}) {
    if (userDataDir) {
      snapshotProfileCookiesIfHealthy(userDataDir);
    }
    const hasFilter = Boolean(options && (options.domain || options.name || options.path));
    if (!hasFilter && !options?.allowGlobalWipe) {
      console.warn(
        `[cookie-guard] Blocked un-scoped context.clearCookies() on profile #${profileCode || path.basename(userDataDir || "unknown")}. Pass { domain } or { name } (or { allowGlobalWipe: true }).`,
      );
      return;
    }
    if (options?.allowGlobalWipe) {
      const { allowGlobalWipe, ...rest } = options;
      return origClearCookies(Object.keys(rest).length > 0 ? rest : undefined);
    }
    return deleteMatchingCookiesFromContextSurgically(context, options, origClearCookies);
  };

  return context;
}

function resolveP0002VaultDir() {
  const candidates = [
    process.env.P0002_DATA_DIR,
    "D:\\StealthBrowser\\data\\cookie-vaults",
    "E:\\Dev\\Tool\\P0002-Social-Hub\\data",
    path.resolve(__dirname, "..", "..", "..", "P0002-Social-Hub", "data"),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return "";
}

let _guardVaultCache = null;
let _guardVaultCacheAt = 0;
let _guardVaultMtimes = { fb: 0, mail: 0, tt: 0, svc: 0 };

function getSafeMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs || 0;
  } catch {
    return 0;
  }
}

function isCorePlatformCookieDomain(domain = "") {
  const d = String(domain || "").toLowerCase();
  if (!d) return false;
  return (
    d.includes("google.") ||
    d.includes("youtube.com") ||
    d.includes("gstatic.com") ||
    d.includes("googleapis.com") ||
    d.includes("live.com") ||
    d.includes("outlook.com") ||
    d.includes("microsoft.com") ||
    d.includes("office.com") ||
    d.includes("microsoftonline.com") ||
    d.includes("facebook.com") ||
    d.includes("fb.com") ||
    d.includes("tiktok.com")
  );
}

function dedupeCookieList(cookies = []) {
  if (!Array.isArray(cookies) || cookies.length === 0) return [];
  const map = new Map();
  for (const c of cookies) {
    if (!c || !c.name || !c.value) continue;
    const key = `${String(c.domain || "").toLowerCase()}|${c.path || "/"}|${c.name}`;
    map.set(key, c);
  }
  return [...map.values()];
}

function sanitizeCoherentGoogleCookieSet(cookies = []) {
  const deduped = dedupeCookieList(cookies);
  if (deduped.length === 0) return [];
  const sec1p =
    deduped.find(
      (c) =>
        String(c.domain || "").toLowerCase() === ".google.com" &&
        c.name === "__Secure-1PSID" &&
        /^g\.a000[A-Za-z0-9_-]{6,}/.test(String(c.value || "")),
    ) ||
    deduped.find(
      (c) =>
        String(c.domain || "").toLowerCase() === ".google.com" &&
        c.name === "SID" &&
        /^g\.a000[A-Za-z0-9_-]{6,}/.test(String(c.value || "")),
    );
  const canonicalPrefix = sec1p ? String(sec1p.value).slice(0, 22) : "";
  const canonicalExpSec = Number(sec1p?.expires || 0);
  const canonicalUpdatedUs = typeof sec1p?._updatedUs === "bigint" ? sec1p._updatedUs : 0n;
  return deduped
    .filter((c) => {
      const val = String(c.value || "");
      if (
        canonicalPrefix &&
        (c.name === "SID" || c.name === "__Secure-1PSID" || c.name === "__Secure-3PSID") &&
        /^g\.a000[A-Za-z0-9_-]{6,}/.test(val) &&
        !val.startsWith(canonicalPrefix)
      ) {
        return false;
      }
      if (c.name === "OSID" || c.name === "__Secure-OSID" || c.name === "COMPASS" || c.name === "GMAIL_AT") {
        const cUs = typeof c._updatedUs === "bigint" ? c._updatedUs : 0n;
        const cExp = Number(c.expires || 0);
        if (canonicalUpdatedUs > 0n && cUs > 0n && canonicalUpdatedUs - cUs > 300_000_000n) {
          return false;
        }
        if (canonicalExpSec > 0 && cExp > 0 && Math.abs(canonicalExpSec - cExp) > 3600) {
          return false;
        }
        if (
          canonicalPrefix.length >= 11 &&
          val.startsWith("g.a000") &&
          val.slice(0, 11) !== canonicalPrefix.slice(0, 11)
        ) {
          return false;
        }
      }
      return true;
    })
    .map((c) => {
      if (String(c.name || "").startsWith("__Secure-3P")) {
        return { ...c, sameSite: "None", secure: true };
      }
      return c;
    });
}

function loadCachedEcosystemVaults() {
  const now = Date.now();
  if (_guardVaultCache && now - _guardVaultCacheAt < 60_000) {
    return _guardVaultCache;
  }
  const vaultDir = resolveP0002VaultDir();
  const prev = _guardVaultCache || { fb: {}, mail: {}, tt: {}, svcByCode: {} };
  const data = { fb: prev.fb, mail: prev.mail, tt: prev.tt, svcByCode: prev.svcByCode };
  if (!vaultDir) return data;

  const fbFile = path.join(vaultDir, "fb-cookie-vault.json");
  const fbMtime = getSafeMtimeMs(fbFile);
  if (fbMtime > 0 && (fbMtime !== _guardVaultMtimes.fb || !_guardVaultCache)) {
    try {
      data.fb = JSON.parse(fs.readFileSync(fbFile, "utf8")) || data.fb;
      _guardVaultMtimes.fb = fbMtime;
    } catch {
      /* keep previous cache on transient concurrent write */
    }
  }
  const mailFile = path.join(vaultDir, "mail-cookie-vault.json");
  const mailMtime = getSafeMtimeMs(mailFile);
  if (mailMtime > 0 && (mailMtime !== _guardVaultMtimes.mail || !_guardVaultCache)) {
    try {
      const raw = JSON.parse(fs.readFileSync(mailFile, "utf8")) || {};
      data.mail = raw?.profiles || raw;
      _guardVaultMtimes.mail = mailMtime;
    } catch {
      /* keep previous cache on transient concurrent write */
    }
  }
  const ttFile = path.join(vaultDir, "tiktok-cookie-vault.json");
  const ttMtime = getSafeMtimeMs(ttFile);
  if (ttMtime > 0 && (ttMtime !== _guardVaultMtimes.tt || !_guardVaultCache)) {
    try {
      const raw = JSON.parse(fs.readFileSync(ttFile, "utf8")) || {};
      data.tt = raw?.profiles || raw;
      _guardVaultMtimes.tt = ttMtime;
    } catch {
      /* keep previous cache on transient concurrent write */
    }
  }
  const svcFile = path.join(vaultDir, "service-cookie-vault.json");
  const svcMtime = getSafeMtimeMs(svcFile);
  if (svcMtime > 0 && (svcMtime !== _guardVaultMtimes.svc || !_guardVaultCache)) {
    try {
      const raw = JSON.parse(fs.readFileSync(svcFile, "utf8")) || {};
      const services = raw?.services || raw;
      const nextSvc = {};
      const seenByCode = {};
      for (const [k, entry] of Object.entries(services || {})) {
        const idx = k.indexOf(":");
        if (idx <= 0 || !Array.isArray(entry?.cookies) || entry.cookies.length === 0) continue;
        const c = k.slice(0, idx).padStart(4, "0");
        if (!nextSvc[c]) {
          nextSvc[c] = [];
          seenByCode[c] = new Set();
        }
        const seen = seenByCode[c];
        for (const ck of entry.cookies) {
          if (!ck || !ck.name || !ck.value) continue;
          if (!ck.syntheticSpa && isCorePlatformCookieDomain(ck.domain)) continue;
          const sig = `${String(ck.domain || "").toLowerCase()}|${ck.name}|${ck.path || "/"}`;
          if (seen.has(sig)) continue;
          seen.add(sig);
          nextSvc[c].push(ck);
        }
      }
      data.svcByCode = nextSvc;
      _guardVaultMtimes.svc = svcMtime;
    } catch {
      /* keep previous cache on transient concurrent write */
    }
  }
  _guardVaultCache = data;
  _guardVaultCacheAt = now;
  return data;
}

/**
 * Collects all backed-up cookies for `profileCode` (`0001`–`9999`) from the shared ecosystem vaults
 * (`fb-cookie-vault.json`, `mail-cookie-vault.json`, `tiktok-cookie-vault.json`, `service-cookie-vault.json`).
 */
function collectVaultCookiesForProfileCode(profileCode, { userDataDir = "" } = {}) {
  const code = String(profileCode || "").trim().padStart(4, "0");
  const result = {
    code,
    sources: [],
    facebook: [],
    gmail: [],
    outlook: [],
    tiktok: [],
    services: [],
    allCookies: [],
  };
  if (!/^\d{4}$/.test(code)) return result;
  const vaults = loadCachedEcosystemVaults();

  // 1. Facebook
  const fbEntry = vaults.fb?.[code];
  if (Array.isArray(fbEntry?.cookies) && fbEntry.cookies.some((c) => c.name === "c_user")) {
    result.facebook = fbEntry.cookies;
    result.sources.push("facebook");
    result.allCookies.push(...fbEntry.cookies);
  }

  // 2. Mail (Gmail + Outlook) — supports both nested (`mail[code].gmail`) and flat (`mail["1207:gmail"]`) vault schemas
  const mailEntry = vaults.mail?.[code];
  const gmailKeyEntry = vaults.mail?.[`${code}:gmail`];
  const outlookKeyEntry = vaults.mail?.[`${code}:outlook`];
  const hasGmailAuthToken = (arr) =>
    Array.isArray(arr) && arr.some((c) => c && (c.name === "SID" || c.name === "__Secure-1PSID") && c.value);
  const gmailCandidates = [
    gmailKeyEntry?.cookies,
    mailEntry?.gmail?.cookies,
    mailEntry?.provider === "gmail" ? mailEntry?.cookies : null,
  ].filter((arr) => Array.isArray(arr) && arr.length > 0);
  const gmailCookies = sanitizeCoherentGoogleCookieSet(gmailCandidates.find(hasGmailAuthToken) || gmailCandidates[0] || []);
  if (gmailCookies.length > 0) {
    result.gmail = gmailCookies;
    result.sources.push("gmail");
    result.allCookies.push(...gmailCookies);
  }
  const rawOutlookCookies =
    (Array.isArray(mailEntry?.outlook?.cookies) && mailEntry.outlook.cookies.length > 0 && mailEntry.outlook.cookies) ||
    (Array.isArray(outlookKeyEntry?.cookies) && outlookKeyEntry.cookies.length > 0 && outlookKeyEntry.cookies) ||
    (mailEntry?.provider === "outlook" && Array.isArray(mailEntry?.cookies) && mailEntry.cookies.length > 0 && mailEntry.cookies) ||
    [];
  const outlookCookies = dedupeCookieList(rawOutlookCookies);
  if (outlookCookies.length > 0) {
    result.outlook = outlookCookies;
    result.sources.push("outlook");
    result.allCookies.push(...outlookCookies);
  }

  // 3. TikTok — require genuine 24-64 char hex sessionid/sessionid_ss/sid_tt (reject synthetic dGlrdG9rX base64 stubs)
  const ttEntry = vaults.tt?.[code];
  const validTtCookies = Array.isArray(ttEntry?.cookies)
    ? ttEntry.cookies.filter((c) => c && !String(c.value || "").startsWith("dGlrdG9rX"))
    : [];
  if (
    validTtCookies.some(
      (c) =>
        (c.name === "sessionid" || c.name === "sessionid_ss" || c.name === "sid_tt") &&
        /^[0-9a-f]{24,64}$/i.test(String(c.value || "").trim()),
    )
  ) {
    result.tiktok = dedupeCookieList(validTtCookies);
    result.sources.push("tiktok");
    result.allCookies.push(...result.tiktok);
  }

  // 4. Services
  const svcCookies = vaults.svcByCode?.[code];
  if (Array.isArray(svcCookies) && svcCookies.length > 0) {
    const cleanSvc = dedupeCookieList(svcCookies.filter((c) => c && (c.syntheticSpa || !isCorePlatformCookieDomain(c.domain))));
    if (cleanSvc.length > 0) {
      result.services.push(...cleanSvc);
      result.allCookies.push(...cleanSvc);
      result.sources.push("services");
    }
  }

  // 5. Fallback / upgrade from per-profile on-disk `Default/Network/Cookies.vault-hydrated.json`
  // when a platform is missing from global vaults OR when on-disk hydrated JSON has newer rotating Google tokens (__Secure-1PSIDTS / SIDCC).
  if (userDataDir) {
    const hydratedPath = path.join(userDataDir, COOKIES_VAULT_HYDRATED_REL_PATH);
    if (fs.existsSync(hydratedPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(hydratedPath, "utf8"));
        const diskCookies = Array.isArray(raw?.cookies) ? raw.cookies : [];
        const gDisk = sanitizeCoherentGoogleCookieSet(
          diskCookies.filter((c) => c && String(c.domain || "").toLowerCase().includes("google.com")),
        );
        if (gDisk.some((c) => (c.name === "SID" || c.name === "__Secure-1PSID") && c.value)) {
          if (result.gmail.length === 0) {
            result.gmail = gDisk;
            if (!result.sources.includes("gmail")) result.sources.push("gmail");
            result.allCookies.push(...gDisk);
          } else {
            const getSidExp = (arr) =>
              Number(arr.find((c) => c && (c.name === "SID" || c.name === "__Secure-1PSID") && String(c.value || "").startsWith("g."))?.expires || 0);
            const getSidtsExp = (arr) =>
              Number(arr.find((c) => c && c.name === "__Secure-1PSIDTS")?.expires || 0);
            if (getSidExp(gDisk) > getSidExp(result.gmail) + 3600) {
              result.gmail = gDisk;
              result.allCookies.push(...gDisk);
            } else if (getSidtsExp(gDisk) > getSidtsExp(result.gmail) + 2) {
              result.gmail = sanitizeCoherentGoogleCookieSet([...result.gmail, ...gDisk]);
              result.allCookies.push(...gDisk);
            }
          }
        }
        if (result.outlook.length === 0) {
          const oDisk = dedupeCookieList(
            diskCookies.filter((c) => {
              const d = String(c?.domain || "").toLowerCase();
              return d.includes("live.com") || d.includes("outlook.com") || d.includes("office.com") || d.includes("microsoft");
            }),
          );
          if (oDisk.some((c) => ["RPSSecAuth", "MSPAuth", "__Host-MSAAUTH", "ESTSAUTH", "WLSSC"].includes(c.name) && c.value)) {
            result.outlook = oDisk;
            if (!result.sources.includes("outlook")) result.sources.push("outlook");
            result.allCookies.push(...oDisk);
          }
        }
        if (result.facebook.length === 0) {
          const fbDisk = dedupeCookieList(
            diskCookies.filter((c) => c && String(c.domain || "").toLowerCase().includes("facebook.com")),
          );
          if (fbDisk.some((c) => c.name === "c_user" && c.value)) {
            result.facebook = fbDisk;
            if (!result.sources.includes("facebook")) result.sources.push("facebook");
            result.allCookies.push(...fbDisk);
          }
        }
      } catch {
        /* ignore corrupt hydrated JSON */
      }
    }
  }

  result.allCookies = dedupeCookieList(result.allCookies);
  return result;
}

/**
 * Reads any backed-up cookies for `profileCode` (`0001`–`9999`) from the shared ecosystem vaults
 * (`fb-cookie-vault.json`, `mail-cookie-vault.json`, `tiktok-cookie-vault.json`, `service-cookie-vault.json`)
 * and injects missing session cookies into the live Playwright `context` on launch.
 */
async function hydrateContextFromEcosystemVaults(context, { profileCode = "", userDataDir = "", forceAll = false } = {}) {
  const code = String(profileCode || "").trim().padStart(4, "0");
  if (!/^\d{4}$/.test(code) || !context || typeof context.cookies !== "function" || typeof context.addCookies !== "function") {
    return { restoredCount: 0, sources: [] };
  }
  const vault = collectVaultCookiesForProfileCode(code, { userDataDir });
  if (vault.allCookies.length === 0) return { restoredCount: 0, sources: [] };

  let liveCookies = [];
  try {
    liveCookies = await context.cookies();
  } catch {
    return { restoredCount: 0, sources: [] };
  }

  const hasLiveFb = liveCookies.some((c) => String(c.domain || "").includes("facebook.com") && c.name === "c_user");
  const hasOpenGoogleSignInTab =
    !forceAll &&
    typeof context.pages === "function" &&
    context.pages().some((p) => {
      try {
        return /accounts\.google\.com/i.test(String(p.url() || ""));
      } catch {
        return false;
      }
    });
  const liveDotGoogleSid = liveCookies.find(
    (c) => String(c.domain || "").toLowerCase() === ".google.com" && c.name === "SID" && String(c.value || "").startsWith("g."),
  );
  const liveDotGoogle1Psid = liveCookies.find(
    (c) => String(c.domain || "").toLowerCase() === ".google.com" && c.name === "__Secure-1PSID" && String(c.value || "").startsWith("g."),
  );
  const hasCoherentLiveDotGoogle =
    Boolean(liveDotGoogleSid && liveDotGoogle1Psid) &&
    String(liveDotGoogleSid.value).slice(0, 14) === String(liveDotGoogle1Psid.value).slice(0, 14);
  const vaultDotGoogleSid = vault.gmail.find(
    (c) =>
      String(c.domain || "").toLowerCase() === ".google.com" &&
      (c.name === "SID" || c.name === "__Secure-1PSID") &&
      String(c.value || "").startsWith("g."),
  );
  const vaultGmailIsStrictlyNewer =
    Boolean(vaultDotGoogleSid && liveDotGoogleSid) &&
    Number(vaultDotGoogleSid.expires || 0) > Number(liveDotGoogleSid.expires || 0) + 3600 &&
    String(vaultDotGoogleSid.value || "").slice(0, 14) !== String(liveDotGoogleSid.value || "").slice(0, 14);
  // Note: ACCOUNT_CHOOSER is intentionally excluded because Google leaves ACCOUNT_CHOOSER even when signed out on ServiceLogin.
  // Never overwrite live Chromium SQLite Google auth cookies on launch unless vault holds a strictly newer session (> +3600s expiry).
  const hasLiveGmail =
    hasOpenGoogleSignInTab ||
    (!vaultGmailIsStrictlyNewer &&
      (hasCoherentLiveDotGoogle ||
        liveCookies.some(
          (c) =>
            String(c.domain || "").includes("google.com") &&
            Boolean(c.value) &&
            (c.name === "SID" ||
              c.name === "__Secure-1PSID" ||
              c.name === "__Secure-3PSID" ||
              c.name === "SAPISID" ||
              c.name === "__Secure-1PAPISID" ||
              c.name === "LSID" ||
              c.name === "__Host-1PLSID" ||
              c.name === "__Host-3PLSID"),
        )));
  const hasLiveOutlook = liveCookies.some(
    (c) =>
      (String(c.domain || "").includes("live.com") ||
        String(c.domain || "").includes("outlook.com") ||
        String(c.domain || "").includes("office.com")) &&
      ["RPSSecAuth", "MSPAuth", "WLSSC", "OwaUserState", "DefaultAnchorMailbox"].includes(c.name),
  );
  const hasLiveTikTok = liveCookies.some(
    (c) => String(c.domain || "").includes("tiktok.com") && ["sessionid", "sessionid_ss", "sid_tt"].includes(c.name),
  );

  const toInject = [];
  const sources = [];

  if ((forceAll || !hasLiveFb) && vault.facebook.length > 0) {
    toInject.push(...vault.facebook);
    sources.push("facebook");
  }
  if ((forceAll || !hasLiveGmail) && vault.gmail.length > 0) {
    toInject.push(...vault.gmail);
    sources.push("gmail");
  }
  if ((forceAll || !hasLiveOutlook) && vault.outlook.length > 0) {
    toInject.push(...vault.outlook);
    sources.push("outlook");
  }
  if ((forceAll || !hasLiveTikTok) && vault.tiktok.length > 0) {
    toInject.push(...vault.tiktok);
    sources.push("tiktok");
  }
  if (vault.services.length > 0) {
    const httpSvcCookies = vault.services.filter((vc) => !vc.syntheticSpa && !isCorePlatformCookieDomain(vc.domain));
    const missingSvc = httpSvcCookies.filter(
      (vc) => !liveCookies.some((lc) => lc.name === vc.name && String(lc.domain || "").includes(String(vc.domain || "").replace(/^\./, ""))),
    );
    if ((forceAll && httpSvcCookies.length > 0) || missingSvc.length > 0) {
      toInject.push(...(forceAll ? httpSvcCookies : missingSvc));
      sources.push("services");
    }
  }

  if (toInject.length === 0) return { restoredCount: 0, sources: [] };

  try {
    await context.addCookies(toInject);
    return { restoredCount: toInject.length, sources };
  } catch {
    return { restoredCount: 0, sources: [] };
  }
}

const _dpapiKeyCache = globalThis._p0003DpapiKeyCache || (globalThis._p0003DpapiKeyCache = new Map());
const DPAPI_DISK_CACHE_PATH = path.join(os.tmpdir(), "p0003-dpapi-key-cache-v1.json");
let _dpapiDiskCacheMtimeMs = 0;
let _nativeDpapi = undefined;

function _getNativeDpapi() {
  if (globalThis.__STEALTH_NATIVE_DPAPI__) {
    _nativeDpapi = globalThis.__STEALTH_NATIVE_DPAPI__;
    return _nativeDpapi;
  }
  if (_nativeDpapi !== undefined) return _nativeDpapi;
  if (process.platform !== "win32") return (_nativeDpapi = null);
  const candidates = [
    "koffi",
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "koffi") : "",
    path.resolve(__dirname, "..", "..", "node_modules", "koffi"),
    path.resolve(__dirname, "..", "..", "..", "P0001-Desk-Console", "node_modules", "koffi"),
    "E:/Dev/Tool/P0001-Desk-Console/node_modules/koffi",
    "E:/Dev/node_modules/.pnpm/koffi@3.1.6/node_modules/koffi",
  ].filter(Boolean);
  for (const cand of candidates) {
    try {
      const koffi = require(cand);
      const crypt32 = koffi.load("crypt32.dll");
      const kernel32 = koffi.load("kernel32.dll");
      const blobName = `DATA_BLOB_P0003_DPAPI_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      koffi.struct(blobName, {
        cbData: "uint32_t",
        pbData: "void*",
      });
      const CryptProtectData = crypt32.func(
        `bool __stdcall CryptProtectData(${blobName}* pDataIn, void* szDataDescr, void* pOptionalEntropy, void* pvReserved, void* pPromptStruct, uint32_t dwFlags, _Out_ ${blobName}* pDataOut)`,
      );
      const CryptUnprotectData = crypt32.func(
        `bool __stdcall CryptUnprotectData(${blobName}* pDataIn, void* ppszDataDescr, void* pOptionalEntropy, void* pvReserved, void* pPromptStruct, uint32_t dwFlags, _Out_ ${blobName}* pDataOut)`,
      );
      const LocalFree = kernel32.func("void* __stdcall LocalFree(void* hMem)");
      _nativeDpapi = { koffi, CryptProtectData, CryptUnprotectData, LocalFree };
      globalThis.__STEALTH_NATIVE_DPAPI__ = _nativeDpapi;
      return _nativeDpapi;
    } catch {
      /* try next */
    }
  }
  _nativeDpapi = null;
  return null;
}

function _loadDpapiDiskCacheIfUpdated() {
  try {
    if (!fs.existsSync(DPAPI_DISK_CACHE_PATH)) return;
    const st = fs.statSync(DPAPI_DISK_CACHE_PATH);
    if (st.mtimeMs === _dpapiDiskCacheMtimeMs && _dpapiKeyCache.size > 0) return;
    _dpapiDiskCacheMtimeMs = st.mtimeMs;
    const raw = JSON.parse(fs.readFileSync(DPAPI_DISK_CACHE_PATH, "utf8"));
    if (!raw || typeof raw !== "object") return;
    for (const [k, v] of Object.entries(raw)) {
      if (v === "ERR" || v === null) {
        // Retry with ultra-fast native koffi DPAPI if a previous PowerShell timeout poisoned the disk cache
        const healed = _unprotectSingleRawDpapiNative(k);
        if (Buffer.isBuffer(healed) && healed.length === 32) {
          _dpapiKeyCache.set(k, healed);
        } else {
          _dpapiKeyCache.set(k, null);
        }
      } else if (typeof v === "string" && v.length > 0) {
        const buf = Buffer.from(v, "base64");
        if (buf.length === 32) _dpapiKeyCache.set(k, buf);
      }
    }
  } catch {
    /* ignore */
  }
}

function _persistDpapiDiskCacheEntries(newEntries) {
  if (!newEntries || newEntries.length === 0) return;
  try {
    let existing = {};
    if (fs.existsSync(DPAPI_DISK_CACHE_PATH)) {
      try {
        existing = JSON.parse(fs.readFileSync(DPAPI_DISK_CACHE_PATH, "utf8")) || {};
      } catch {
        existing = {};
      }
    }
    let changed = false;
    for (const [k, v] of newEntries) {
      const serialized = Buffer.isBuffer(v) && v.length === 32 ? v.toString("base64") : "ERR";
      if (existing[k] !== serialized) {
        existing[k] = serialized;
        changed = true;
      }
    }
    if (!changed) return;
    const tmp = `${DPAPI_DISK_CACHE_PATH}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(existing), "utf8");
    try {
      fs.renameSync(tmp, DPAPI_DISK_CACHE_PATH);
    } catch {
      fs.copyFileSync(tmp, DPAPI_DISK_CACHE_PATH);
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
    try {
      _dpapiDiskCacheMtimeMs = fs.statSync(DPAPI_DISK_CACHE_PATH).mtimeMs;
    } catch {}
  } catch {
    /* ignore */
  }
}

_loadDpapiDiskCacheIfUpdated();

function _unprotectSingleRawDpapiNative(safeB64) {
  const nat = _getNativeDpapi();
  if (!nat) return undefined;
  try {
    const fullBuf = Buffer.from(safeB64, "base64");
    if (fullBuf.length <= 5) return null;
    const rawBuf = fullBuf.subarray(5);
    const inBlob = { cbData: rawBuf.length, pbData: rawBuf };
    const outBlob = { cbData: 0, pbData: null };
    const ok = nat.CryptUnprotectData(inBlob, null, null, null, null, 0x1, outBlob);
    if (!ok || !outBlob.pbData || outBlob.cbData <= 0) return null;
    try {
      const dec = Buffer.from(nat.koffi.decode(outBlob.pbData, "uint8_t", outBlob.cbData));
      return dec.length === 32 ? dec : null;
    } finally {
      nat.LocalFree(outBlob.pbData);
    }
  } catch {
    return null;
  }
}

function unprotectDpapiKey(encryptedKeyB64) {
  if (process.platform !== "win32" || !encryptedKeyB64) return null;
  const safeB64 = String(encryptedKeyB64).replace(/[^A-Za-z0-9+/=]/g, "");
  if (!safeB64) return null;
  if (_dpapiKeyCache.has(safeB64)) return _dpapiKeyCache.get(safeB64);
  _loadDpapiDiskCacheIfUpdated();
  if (_dpapiKeyCache.has(safeB64)) return _dpapiKeyCache.get(safeB64);

  const natResult = _unprotectSingleRawDpapiNative(safeB64);
  if (natResult !== undefined) {
    _dpapiKeyCache.set(safeB64, natResult);
    _persistDpapiDiskCacheEntries([[safeB64, natResult]]);
    return natResult;
  }

  try {
    const psCmd = `Add-Type -AssemblyName System.Security; $b = [Convert]::FromBase64String('${safeB64}'); $raw = New-Object byte[] ($b.Length - 5); [Array]::Copy($b, 5, $raw, 0, $raw.Length); $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($raw, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Convert]::ToBase64String($dec)`;
    const res = spawnSync("powershell", ["-NoProfile", "-Command", psCmd], {
      stdio: "pipe",
      windowsHide: true,
      encoding: "utf8",
      timeout: 6000,
    });
    if (res.status !== 0 || !res.stdout) {
      _dpapiKeyCache.set(safeB64, null);
      _persistDpapiDiskCacheEntries([[safeB64, null]]);
      return null;
    }
    const buf = Buffer.from(res.stdout.trim(), "base64");
    const out = buf.length === 32 ? buf : null;
    _dpapiKeyCache.set(safeB64, out);
    _persistDpapiDiskCacheEntries([[safeB64, out]]);
    return out;
  } catch {
    _dpapiKeyCache.set(safeB64, null);
    return null;
  }
}

function batchUnprotectDpapiKeys(encryptedKeyList = []) {
  if (process.platform !== "win32" || !Array.isArray(encryptedKeyList) || encryptedKeyList.length === 0) return 0;
  _loadDpapiDiskCacheIfUpdated();
  const uniqueUncached = [
    ...new Set(
      encryptedKeyList
        .map((k) => String(k || "").replace(/[^A-Za-z0-9+/=]/g, ""))
        .filter((k) => k.length > 16 && !_dpapiKeyCache.has(k)),
    ),
  ];
  if (uniqueUncached.length === 0) return 0;

  if (_getNativeDpapi()) {
    let count = 0;
    const toPersist = [];
    for (const k of uniqueUncached) {
      const dec = _unprotectSingleRawDpapiNative(k);
      const valid = Buffer.isBuffer(dec) && dec.length === 32 ? dec : null;
      _dpapiKeyCache.set(k, valid);
      toPersist.push([k, valid]);
      if (valid) count += 1;
    }
    _persistDpapiDiskCacheEntries(toPersist);
    return count;
  }

  try {
    const psScript = [
      "Add-Type -AssemblyName System.Security",
      "$inTxt = [Console]::In.ReadToEnd()",
      "foreach ($k in ($inTxt -split '\\r?\\n')) {",
      "  $k = $k.Trim()",
      "  if ($k.Length -lt 16) { continue }",
      "  try {",
      "    $b = [Convert]::FromBase64String($k)",
      "    $raw = New-Object byte[] ($b.Length - 5)",
      "    [Array]::Copy($b, 5, $raw, 0, $raw.Length)",
      "    $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($raw, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
      "    [Console]::Out.WriteLine($k + '|' + [Convert]::ToBase64String($dec))",
      "  } catch {",
      "    [Console]::Out.WriteLine($k + '|ERR')",
      "  }",
      "}",
    ].join("; ");
    const res = spawnSync("powershell", ["-NoProfile", "-Command", psScript], {
      input: uniqueUncached.join("\n"),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60000,
    });
    if (res.status !== 0 || !res.stdout) return 0;
    let count = 0;
    const toPersist = [];
    for (const line of res.stdout.split(/\r?\n/)) {
      const idx = line.indexOf("|");
      if (idx <= 0) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (v === "ERR") {
        _dpapiKeyCache.set(k, null);
        toPersist.push([k, null]);
        continue;
      }
      const buf = Buffer.from(v, "base64");
      if (buf.length === 32) {
        _dpapiKeyCache.set(k, buf);
        toPersist.push([k, buf]);
        count += 1;
      } else {
        _dpapiKeyCache.set(k, null);
        toPersist.push([k, null]);
      }
    }
    _persistDpapiDiskCacheEntries(toPersist);
    return count;
  } catch {
    return 0;
  }
}

function encryptCookieValueChromium(masterKey, hostKey, plainValue, metaVersion = 24) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);
  const valBuf = Buffer.from(String(plainValue), "utf8");
  const payload =
    metaVersion >= 24
      ? Buffer.concat([crypto.createHash("sha256").update(String(hostKey)).digest(), valBuf])
      : valBuf;
  const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from("v10", "utf8"), iv, ct, tag]);
}

function decryptCookieValueChromium(masterKey, encryptedBlob, metaVersion = 24) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32 || !encryptedBlob) return "";
  try {
    const buf = Buffer.isBuffer(encryptedBlob) ? encryptedBlob : Buffer.from(encryptedBlob);
    if (buf.length < 31 || buf.subarray(0, 3).toString("utf8") !== "v10") return "";
    const iv = buf.subarray(3, 15);
    const tag = buf.subarray(buf.length - 16);
    const ct = buf.subarray(15, buf.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    if (metaVersion >= 24 && plain.length >= 32) {
      return plain.subarray(32).toString("utf8");
    }
    return plain.toString("utf8");
  } catch {
    return "";
  }
}

let _fallbackGeneratedDpapiPair = null;

function getOrGenerateFallbackDpapiKeyPair() {
  if (_fallbackGeneratedDpapiPair) return _fallbackGeneratedDpapiPair;
  _loadDpapiDiskCacheIfUpdated();
  // First check if _dpapiKeyCache already has a valid CurrentUser key on this machine
  for (const [encB64, masterBuf] of _dpapiKeyCache.entries()) {
    if (encB64 && Buffer.isBuffer(masterBuf) && masterBuf.length === 32) {
      _fallbackGeneratedDpapiPair = { encryptedKeyB64: encB64, masterKey: masterBuf };
      return _fallbackGeneratedDpapiPair;
    }
  }
  if (process.platform !== "win32") return null;
  try {
    const rawKey = crypto.randomBytes(32);
    const nat = _getNativeDpapi();
    if (nat) {
      const inBlob = { cbData: rawKey.length, pbData: rawKey };
      const outBlob = { cbData: 0, pbData: null };
      if (nat.CryptProtectData(inBlob, null, null, null, null, 0x1, outBlob) && outBlob.pbData && outBlob.cbData > 0) {
        try {
          const encBuf = Buffer.from(nat.koffi.decode(outBlob.pbData, "uint8_t", outBlob.cbData));
          const fullBuf = Buffer.concat([Buffer.from("DPAPI", "utf8"), encBuf]);
          const encryptedKeyB64 = fullBuf.toString("base64");
          _dpapiKeyCache.set(encryptedKeyB64, rawKey);
          _persistDpapiDiskCacheEntries([[encryptedKeyB64, rawKey]]);
          _fallbackGeneratedDpapiPair = { encryptedKeyB64, masterKey: rawKey };
          return _fallbackGeneratedDpapiPair;
        } finally {
          nat.LocalFree(outBlob.pbData);
        }
      }
    }
    const rawB64 = rawKey.toString("base64");
    const psCmd = `Add-Type -AssemblyName System.Security; $raw = [Convert]::FromBase64String('${rawB64}'); $enc = [System.Security.Cryptography.ProtectedData]::Protect($raw, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); $prefix = [System.Text.Encoding]::UTF8.GetBytes('DPAPI'); $full = New-Object byte[] ($prefix.Length + $enc.Length); [Array]::Copy($prefix, 0, $full, 0, $prefix.Length); [Array]::Copy($enc, 0, $full, $prefix.Length, $enc.Length); [Convert]::ToBase64String($full)`;
    const res = spawnSync("powershell", ["-NoProfile", "-Command", psCmd], {
      stdio: "pipe",
      windowsHide: true,
      encoding: "utf8",
      timeout: 6000,
    });
    if (res.status !== 0 || !res.stdout) return null;
    const encryptedKeyB64 = res.stdout.trim();
    if (encryptedKeyB64.length > 16) {
      _dpapiKeyCache.set(encryptedKeyB64, rawKey);
      _persistDpapiDiskCacheEntries([[encryptedKeyB64, rawKey]]);
      _fallbackGeneratedDpapiPair = { encryptedKeyB64, masterKey: rawKey };
      return _fallbackGeneratedDpapiPair;
    }
    return null;
  } catch {
    return null;
  }
}

function ensureProfileLocalStateDpapiKey(userDataDir) {
  if (!userDataDir || !fs.existsSync(userDataDir)) return null;
  const lsPath = path.join(userDataDir, LOCAL_STATE_REL_PATH);
  const lsBakPath = path.join(userDataDir, LOCAL_STATE_BAK_REL_PATH);
  if (fs.existsSync(lsPath)) {
    try {
      const ls = JSON.parse(fs.readFileSync(lsPath, "utf8"));
      const mk = unprotectDpapiKey(ls?.os_crypt?.encrypted_key);
      if (mk) return mk;
    } catch {
      /* repair or initialize below */
    }
  }
  if (fs.existsSync(lsBakPath)) {
    try {
      const lsBak = JSON.parse(fs.readFileSync(lsBakPath, "utf8"));
      const mk = unprotectDpapiKey(lsBak?.os_crypt?.encrypted_key);
      if (mk) {
        fs.copyFileSync(lsBakPath, lsPath);
        return mk;
      }
    } catch {
      /* initialize below */
    }
  }
  const pair = getOrGenerateFallbackDpapiKeyPair();
  if (!pair) return null;
  try {
    let existingObj = {};
    if (fs.existsSync(lsPath)) {
      try {
        existingObj = JSON.parse(fs.readFileSync(lsPath, "utf8")) || {};
      } catch {
        existingObj = {};
      }
    }
    existingObj.os_crypt = {
      ...(existingObj.os_crypt || {}),
      encrypted_key: pair.encryptedKeyB64,
    };
    const jsonStr = JSON.stringify(existingObj);
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(lsPath, jsonStr, "utf8");
    if (!fs.existsSync(lsBakPath)) {
      fs.writeFileSync(lsBakPath, jsonStr, "utf8");
    }
    return pair.masterKey;
  } catch {
    return null;
  }
}

function injectVaultCookiesIntoClosedSqlite(userDataDir, cookies = [], { targetRelPath = COOKIES_REL_PATH } = {}) {
  if (!userDataDir || !Array.isArray(cookies) || cookies.length === 0) return { injectedCount: 0 };
  try {
    for (const lockName of ["lockfile", "SingletonLock"]) {
      const lp = path.join(userDataDir, lockName);
      if (!fs.existsSync(lp)) continue;
      try {
        const fd = fs.openSync(lp, "r+");
        fs.closeSync(fd);
      } catch (err) {
        if (err && (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES")) {
          return { injectedCount: 0, locked: true };
        }
      }
    }
  } catch {
    /* ignore */
  }
  const ckPath = path.join(userDataDir, targetRelPath);
  const masterKey = ensureProfileLocalStateDpapiKey(userDataDir);
  if (!masterKey) return { injectedCount: 0 };

  let DatabaseSync = null;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    return { injectedCount: 0 };
  }

  let db = null;
  try {
    fs.mkdirSync(path.dirname(ckPath), { recursive: true });
    db = new DatabaseSync(ckPath, { open: true });
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta(key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY, value LONGVARCHAR);
      INSERT OR IGNORE INTO meta VALUES('version', '24');
      INSERT OR IGNORE INTO meta VALUES('last_compatible_version', '24');
      CREATE TABLE IF NOT EXISTS cookies(
        creation_utc INTEGER NOT NULL,
        host_key TEXT NOT NULL,
        top_frame_site_key TEXT NOT NULL,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        encrypted_value BLOB NOT NULL,
        path TEXT NOT NULL,
        expires_utc INTEGER NOT NULL,
        is_secure INTEGER NOT NULL,
        is_httponly INTEGER NOT NULL,
        last_access_utc INTEGER NOT NULL,
        has_expires INTEGER NOT NULL,
        is_persistent INTEGER NOT NULL,
        priority INTEGER NOT NULL,
        samesite INTEGER NOT NULL,
        source_scheme INTEGER NOT NULL,
        source_port INTEGER NOT NULL,
        last_update_utc INTEGER NOT NULL,
        source_type INTEGER NOT NULL DEFAULT 1,
        has_cross_site_ancestor INTEGER NOT NULL DEFAULT 1,
        UNIQUE (host_key, top_frame_site_key, name, path, source_scheme, source_port, has_cross_site_ancestor)
      );
    `);
    const metaVer = Number(db.prepare("SELECT value FROM meta WHERE key = 'version'").get()?.value || 24);
    const usedCreationUtc = new Set();
    try {
      const existingCrRows = db
        .prepare("SELECT CAST(creation_utc AS TEXT) AS cr_str FROM cookies")
        .all();
      for (const r of existingCrRows) {
        if (r?.cr_str) usedCreationUtc.add(String(r.cr_str));
      }
    } catch {
      /* ignore */
    }
    const delStmt = db.prepare("DELETE FROM cookies WHERE host_key = ? AND name = ? AND path = ?");
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO cookies (
        creation_utc, host_key, top_frame_site_key, name, value, encrypted_value,
        path, expires_utc, is_secure, is_httponly, last_access_utc, has_expires,
        is_persistent, priority, samesite, source_scheme, source_port,
        last_update_utc, source_type, has_cross_site_ancestor
      ) VALUES (?, ?, '', ?, '', ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, 2, 443, ?, 1, 1)
    `);
    let injectedCount = 0;
    let nowUs = (BigInt(Date.now()) + WEBKIT_EPOCH_DIFF_MS) * 1000n;
    const normalizedInput = reconcileSplitGoogleAuthCookies(
      (Array.isArray(cookies) ? cookies : []).filter((c) => c && c.name && c.value && !c.syntheticSpa),
      [],
    );
    const hasGoogleAuthInInput = normalizedInput.some(
      (c) =>
        String(c.domain || "").toLowerCase().includes("google.") &&
        (c.name === "SID" || c.name === "__Secure-1PSID" || c.name === "__Secure-3PSID"),
    );
    db.exec("BEGIN IMMEDIATE");
    if (hasGoogleAuthInInput) {
      db.prepare(
        "DELETE FROM cookies WHERE host_key LIKE '%google.%' AND name IN ('OSID', '__Secure-OSID', 'COMPASS', 'GMAIL_AT')",
      ).run();
    }
    for (const c of normalizedInput) {
      if (!c || !c.name || !c.value || c.syntheticSpa) continue;
      nowUs += 10n;
      while (usedCreationUtc.has(nowUs.toString())) {
        nowUs += 10n;
      }
      usedCreationUtc.add(nowUs.toString());
      const hostKey = String(c.domain || ".facebook.com");
      const pathVal = String(c.path || "/");
      const expMs =
        Number.isFinite(c.expires) && c.expires > 0
          ? BigInt(Math.round(c.expires * 1000))
          : BigInt(Date.now() + 365 * 86400 * 1000);
      const expUs = (expMs + WEBKIT_EPOCH_DIFF_MS) * 1000n;
      const is3pCookie = String(c.name || "").startsWith("__Secure-3P");
      const isSecure = is3pCookie || c.secure !== false ? 1 : 0;
      const isHttpOnly = c.httpOnly ? 1 : 0;
      const sameSite = is3pCookie
        ? 0
        : c.sameSite === "None"
          ? 0
          : c.sameSite === "Lax"
            ? 1
            : c.sameSite === "Strict"
              ? 2
              : -1;
      const encBlob = encryptCookieValueChromium(masterKey, hostKey, c.value, metaVer);
      delStmt.run(hostKey, String(c.name), pathVal);
      insertStmt.run(nowUs, hostKey, String(c.name), encBlob, pathVal, expUs, isSecure, isHttpOnly, nowUs, sameSite, nowUs);
      injectedCount += 1;
    }
    db.exec("COMMIT");
    return { injectedCount };
  } catch {
    try {
      db?.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    return { injectedCount: 0 };
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Returns full Cookie Guard diagnostic status for a profile (live SQLite summary, `.last-good.bak` metadata, and Vault sources).
 */
function getProfileCookieGuardStatus(userDataDir, { profileCode = "" } = {}) {
  const current = inspectProfileSqliteCookiesSummary(userDataDir);
  const bakPath = userDataDir ? path.join(userDataDir, COOKIES_BAK_REL_PATH) : "";
  const vaultHydratedPath = userDataDir ? path.join(userDataDir, COOKIES_VAULT_HYDRATED_REL_PATH) : "";
  const lsBakPath = userDataDir ? path.join(userDataDir, LOCAL_STATE_BAK_REL_PATH) : "";
  const ldbBakPath = userDataDir ? path.join(userDataDir, LOCAL_STORAGE_BAK_REL_PATH) : "";
  const hasBackupFile = Boolean(bakPath && fs.existsSync(bakPath));
  const hasVaultHydratedFile = Boolean(vaultHydratedPath && fs.existsSync(vaultHydratedPath));
  const hasLocalStateBackup = Boolean(lsBakPath && fs.existsSync(lsBakPath));
  const ldbBakInfo = inspectLevelDbDirBytes(ldbBakPath);
  const hasLocalStorageBackup = Boolean(ldbBakInfo.exists && ldbBakInfo.dataBytes >= 64);
  const meta = userDataDir ? readGuardMeta(userDataDir) : null;
  let backupSummary = meta;
  if (hasBackupFile && !backupSummary) {
    try {
      backupSummary = inspectSqliteCookiesFile(bakPath, fs.statSync(bakPath).size);
    } catch {
      backupSummary = null;
    }
  }
  const vault = collectVaultCookiesForProfileCode(profileCode, { userDataDir });
  let slots = { slotLatest: null, slotPrevious: null };
  try {
    const { getProfileNativeBackupSlots } = require("./native-session-backup.cjs");
    slots = getProfileNativeBackupSlots(userDataDir, {
      inspectSqliteCookiesFile,
      unprotectDpapiKey,
    });
  } catch {
    /* ignore */
  }
  const latestManifest = slots.slotLatest;
  return {
    profileCode: vault.code,
    current,
    slots: {
      latest: slots.slotLatest,
      previous: slots.slotPrevious,
    },
    backup: {
      exists: Boolean(latestManifest || hasBackupFile || hasVaultHydratedFile),
      hasSqliteBackup: Boolean(latestManifest || hasBackupFile),
      hasVaultHydratedBackup: hasVaultHydratedFile,
      hasLocalStateBackup: Boolean(latestManifest?.hasLocalStateBackup || hasLocalStateBackup),
      hasLocalStorageBackup: Boolean(latestManifest?.hasLocalStorageBackup || hasLocalStorageBackup),
      localStorageBackupBytes: latestManifest?.localStorageBackupBytes ?? ldbBakInfo.dataBytes,
      updatedAt:
        latestManifest?.createdAt ||
        meta?.updatedAt ||
        (hasBackupFile
          ? fs.statSync(bakPath).mtime.toISOString()
          : hasVaultHydratedFile
            ? fs.statSync(vaultHydratedPath).mtime.toISOString()
            : null),
      totalRows: Math.max(latestManifest?.totalRows ?? 0, backupSummary?.totalRows ?? 0, vault.allCookies.length),
      authDomainsCount: latestManifest?.authDomainsCount ?? backupSummary?.authDomainsCount ?? vault.sources.length,
      hasGoogleAuth: Boolean(latestManifest?.hasGoogleAuth || backupSummary?.hasGoogleAuth || vault.gmail.length > 0),
      hasOutlookAuth: Boolean(latestManifest?.hasOutlookAuth || backupSummary?.hasOutlookAuth || vault.outlook.length > 0),
      hasFacebookAuth: Boolean(latestManifest?.hasFacebookAuth || backupSummary?.hasFacebookAuth || vault.facebook.length > 0),
      hasTikTokAuth: Boolean(latestManifest?.hasTikTokAuth || backupSummary?.hasTikTokAuth || vault.tiktok.length > 0),
      byteSize:
        latestManifest?.cookiesBytes ??
        backupSummary?.byteSize ??
        (hasBackupFile
          ? fs.statSync(bakPath).size
          : hasVaultHydratedFile
            ? fs.statSync(vaultHydratedPath).size
            : 0),
      slotLatest: slots.slotLatest,
      slotPrevious: slots.slotPrevious,
    },
    vault: {
      availableSources: vault.sources,
      totalVaultCookies: vault.allCookies.length,
      facebookCount: vault.facebook.length,
      gmailCount: vault.gmail.length,
      outlookCount: vault.outlook.length,
      tiktokCount: vault.tiktok.length,
      serviceCount: vault.services.length,
    },
  };
}

/**
 * 1-Click / API Manual Restore of a profile's cookies:
 * 1) If profile is closed and `Cookies.last-good.bak` exists, restores `Cookies.last-good.bak` -> `Default/Network/Cookies`
 *    (and `Local State.last-good.bak` -> `Local State` if missing).
 * 2) Injects all backed-up Vault cookies (`fb`, `gmail`, `outlook`, `tiktok`, `services`) via DPAPI SQLite (when closed)
 *    or live Playwright `context.addCookies` (when running).
 * 3) Updates `Cookies.last-good.bak` snapshot and returns the refreshed status.
 */
async function restoreProfileCookiesManual(
  userDataDir,
  { profileCode = "", slot = "latest", sourceUserDataDir = "", context = null, isRunning = false } = {},
) {
  if (!userDataDir) {
    return { ok: false, error: "Profile directory not found." };
  }
  const ckPath = path.join(userDataDir, COOKIES_REL_PATH);
  const bakPath = path.join(userDataDir, COOKIES_BAK_REL_PATH);
  const lsPath = path.join(userDataDir, LOCAL_STATE_REL_PATH);
  const lsBakPath = path.join(userDataDir, LOCAL_STATE_BAK_REL_PATH);

  // If restoring from a specific slot ("previous") or cloning from another profile's backup (`sourceUserDataDir`),
  // use the pure Native Session Bundle restore (`native-session-backup.cjs`, zero SQLite row mutation).
  if (!isRunning && (sourceUserDataDir || slot === "previous")) {
    const { restoreProfileNativeSession } = require("./native-session-backup.cjs");
    const nativeRes = restoreProfileNativeSession(userDataDir, {
      profileCode,
      slot,
      sourceUserDataDir,
      inspectSqliteCookiesFile,
      unprotectDpapiKey,
    });
    if (!nativeRes.ok) return nativeRes;
    return {
      ...nativeRes,
      vaultInjectedCount: 0,
      vaultSources: [],
      status: getProfileCookieGuardStatus(userDataDir, { profileCode }),
    };
  }

  // Also restore default-state/ (History, Bookmarks, Preferences, Login Data, Web Data, IndexedDB, Session Storage, etc.)
  // when restoring a closed profile that has a slot-latest native backup bundle.
  if (!isRunning && slot === "latest") {
    try {
      const { resolveProfileBackupRoot, restoreDefaultUserState } = require("./native-session-backup.cjs");
      const slotLatestStateDir = path.join(resolveProfileBackupRoot(userDataDir), "slot-latest", "default-state");
      if (fs.existsSync(slotLatestStateDir)) {
        restoreDefaultUserState(slotLatestStateDir, userDataDir);
      }
    } catch {
      /* ignore */
    }
  }

  const vault = collectVaultCookiesForProfileCode(profileCode, { userDataDir });
  let restoredFromBak = false;
  let vaultInjectedCount = 0;
  let vaultSources = [];

  if (isRunning && context) {
    const hydrated = await hydrateContextFromEcosystemVaults(context, { profileCode, userDataDir, forceAll: true });
    vaultInjectedCount = hydrated.restoredCount;
    vaultSources = hydrated.sources;
    return {
      ok: true,
      mode: "live-cdp",
      restoredFromBak: false,
      vaultInjectedCount,
      vaultSources,
      status: getProfileCookieGuardStatus(userDataDir, { profileCode }),
    };
  }

  // Closed profile: 1. Restore Local State & Local Storage leveldb backup if needed
  if (!hasValidEncryptedKey(lsPath) && hasValidEncryptedKey(lsBakPath)) {
    try {
      fs.copyFileSync(lsBakPath, lsPath);
    } catch {
      /* ignore */
    }
  }
  const ldbRestored = restoreLocalStorageBackup(userDataDir, { force: false });

  // 2. Restore Cookies.last-good.bak if it exists:
  //    - Full file copy ONLY when current Cookies is missing, unreadable, or 0 rows.
  //    - Reconciled domain merge when current Cookies is non-empty so newer cookies on unaffected domains are never lost.
  if (fs.existsSync(bakPath)) {
    const cur = inspectProfileSqliteCookiesSummary(userDataDir);
    const bak = inspectSqliteCookiesFile(bakPath, fs.statSync(bakPath).size);
    if (!cur.exists || !cur.readable || cur.totalRows === 0) {
      try {
        fs.mkdirSync(path.dirname(ckPath), { recursive: true });
        for (const suffix of ["-wal", "-shm", "-journal"]) {
          const sideFile = `${ckPath}${suffix}`;
          if (fs.existsSync(sideFile)) {
            try {
              fs.unlinkSync(sideFile);
            } catch {
              /* ignore */
            }
          }
        }
        fs.copyFileSync(bakPath, ckPath);
        restoredFromBak = true;
      } catch {
        /* ignore */
      }
    } else if (
      Boolean(bak?.readable) &&
      ((bak.hasFacebookAuth && !cur.hasFacebookAuth) ||
        (bak.hasGoogleAuth && !cur.hasGoogleAuth) ||
        (bak.hasOutlookAuth && !cur.hasOutlookAuth) ||
        (bak.hasTikTokAuth && !cur.hasTikTokAuth) ||
        cur.authDomainsCount < bak.authDomainsCount)
    ) {
      try {
        const reconciled = extractDecryptedCookiesFromProfileSqlite(userDataDir);
        if (reconciled.ok && reconciled.cookies.length > 0) {
          const missingBakCookies = reconciled.cookies.filter((c) => {
            const d = String(c?.domain || "").toLowerCase();
            if (!cur.hasGoogleAuth && bak.hasGoogleAuth && (d.includes("google.") || d.includes("youtube.com"))) {
              return true;
            }
            if (
              !cur.hasOutlookAuth &&
              bak.hasOutlookAuth &&
              (d.includes("live.com") || d.includes("outlook.com") || d.includes("office.com") || d.includes("microsoft"))
            ) {
              return true;
            }
            if (!cur.hasFacebookAuth && bak.hasFacebookAuth && (d.includes("facebook.com") || d.includes("fb.com"))) {
              return true;
            }
            if (!cur.hasTikTokAuth && bak.hasTikTokAuth && d.includes("tiktok.com")) {
              return true;
            }
            return false;
          });
          if (missingBakCookies.length > 0) {
            const injBak = injectVaultCookiesIntoClosedSqlite(userDataDir, missingBakCookies);
            if (injBak.injectedCount > 0) {
              restoredFromBak = true;
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  // 3. Inject Vault cookies for platforms that are missing in SQLite (or when Vault holds a strictly newer Google session)
  const preSanitize = sanitizeProfileSqliteCookiesInPlace(userDataDir);
  if (vault.allCookies.length > 0) {
    const curAfterBak = inspectProfileSqliteCookiesSummary(userDataDir);
    const missingVaultCookies = [];
    const missingSources = [];
    if (!curAfterBak.hasFacebookAuth && vault.facebook.length > 0) {
      missingVaultCookies.push(...vault.facebook);
      missingSources.push("facebook");
    }
    const vaultGoogleSidExp = Number(
      vault.gmail.find(
        (c) =>
          c &&
          (c.name === "SID" || c.name === "__Secure-1PSID") &&
          String(c.domain || "").toLowerCase().includes("google.") &&
          String(c.value || "").startsWith("g."),
      )?.expires || 0,
    );
    const sqlGoogleSidExp = Number(preSanitize?.maxGoogleSidExpSec || 0);
    if ((!curAfterBak.hasGoogleAuth || vaultGoogleSidExp > sqlGoogleSidExp + 3600) && vault.gmail.length > 0) {
      missingVaultCookies.push(...vault.gmail);
      missingSources.push("gmail");
    }
    if (!curAfterBak.hasOutlookAuth && vault.outlook.length > 0) {
      missingVaultCookies.push(...vault.outlook);
      missingSources.push("outlook");
    }
    if (!curAfterBak.hasTikTokAuth && vault.tiktok.length > 0) {
      missingVaultCookies.push(...vault.tiktok);
      missingSources.push("tiktok");
    }
    if (vault.services.length > 0) {
      missingVaultCookies.push(...vault.services);
      missingSources.push("services");
    }
    if (missingVaultCookies.length > 0) {
      const inj = injectVaultCookiesIntoClosedSqlite(userDataDir, missingVaultCookies);
      vaultInjectedCount = inj.injectedCount;
      vaultSources = missingSources;
    }
  }

  // 4. Sanitize SQLite structure, refresh healthy snapshot & sync restored login states to P0020
  sanitizeProfileSqliteCookiesInPlace(userDataDir);
  snapshotProfileCookiesIfHealthy(userDataDir, { force: restoredFromBak || vaultInjectedCount > 0 });
  if (restoredFromBak || vaultInjectedCount > 0) {
    try {
      const { syncProfilePlatformsToP0020IfChanged } = require("./stealth-multiplatform-sync.cjs");
      void syncProfilePlatformsToP0020IfChanged({
        userDataDir,
        profileCode,
        source: "p0003_manual_restore",
      }).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    mode: "disk-sqlite",
    restoredFromBak: restoredFromBak || Boolean(ldbRestored.restored),
    localStorageRestored: Boolean(ldbRestored.restored),
    vaultInjectedCount,
    vaultSources,
    status: getProfileCookieGuardStatus(userDataDir, { profileCode }),
  };
}

/**
 * Proposal 2 (`ok 2`): Writes backed-up cookies from the 4 ecosystem vaults (`fb`, `mail`, `tiktok`, `service`)
 * directly into the profile's on-disk `Default/Network/Cookies.vault-hydrated.json` and updates `Cookies.guard-meta.json`
 * (plus snapshots `Cookies.last-good.bak` if a healthy SQLite DB is present) so every profile directory with vault backups
 * has a self-contained on-disk backup even before launching Chromium.
 */
function writeBackVaultCookiesToProfileDisk(userDataDir, { profileCode = "", injectSqlite = false } = {}) {
  const code = String(profileCode || path.basename(String(userDataDir || "")).match(/^(\d{4})\b/)?.[1] || "")
    .trim()
    .padStart(4, "0");
  if (!userDataDir || !/^\d{4}$/.test(code)) {
    return { ok: false, skipped: true, reason: "invalid_profile" };
  }
  _guardVaultCache = null;
  _guardVaultCacheAt = 0;
  const vault = collectVaultCookiesForProfileCode(code, { userDataDir });
  if (vault.allCookies.length === 0) {
    return { ok: false, code, skipped: true, reason: "no_vault_cookies" };
  }

  const netDir = path.join(userDataDir, "Default", "Network");
  const hydratedPath = path.join(userDataDir, COOKIES_VAULT_HYDRATED_REL_PATH);
  const metaPath = path.join(userDataDir, COOKIES_META_REL_PATH);

  try {
    fs.mkdirSync(netDir, { recursive: true });
    const payload = {
      profileCode: code,
      updatedAt: new Date().toISOString(),
      sources: vault.sources,
      counts: {
        total: vault.allCookies.length,
        facebook: vault.facebook.length,
        gmail: vault.gmail.length,
        outlook: vault.outlook.length,
        tiktok: vault.tiktok.length,
        services: vault.services.length,
      },
      cookies: vault.allCookies,
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    fs.writeFileSync(hydratedPath, jsonStr, "utf8");

    let sqliteInjected = 0;
    if (injectSqlite) {
      const inj = injectVaultCookiesIntoClosedSqlite(userDataDir, vault.allCookies);
      sqliteInjected = inj.injectedCount;
    }

    const bakPath = path.join(userDataDir, COOKIES_BAK_REL_PATH);
    const snap =
      sqliteInjected > 0 || !fs.existsSync(bakPath)
        ? snapshotProfileCookiesIfHealthy(userDataDir, { force: sqliteInjected > 0 })
        : { snapshotted: false };
    const existingMeta = readGuardMeta(userDataDir) || {};
    const hasGoogleAuth = Boolean(existingMeta.hasGoogleAuth || vault.gmail.length > 0);
    const hasOutlookAuth = Boolean(existingMeta.hasOutlookAuth || vault.outlook.length > 0);
    const hasFacebookAuth = Boolean(existingMeta.hasFacebookAuth || vault.facebook.length > 0);
    const hasTikTokAuth = Boolean(existingMeta.hasTikTokAuth || vault.tiktok.length > 0);
    const authDomainsCount = Math.max(
      Number(existingMeta.authDomainsCount || 0),
      (hasGoogleAuth ? 1 : 0) + (hasOutlookAuth ? 1 : 0) + (hasFacebookAuth ? 1 : 0) + (hasTikTokAuth ? 1 : 0) + (vault.services.length > 0 ? 1 : 0),
    );
    const mergedMeta = {
      ...existingMeta,
      updatedAt: new Date().toISOString(),
      vaultHydratedAt: payload.updatedAt,
      vaultSources: vault.sources,
      vaultCookiesCount: vault.allCookies.length,
      totalRows: Math.max(Number(existingMeta.totalRows || 0), vault.allCookies.length),
      authDomainsCount,
      hasGoogleAuth,
      hasOutlookAuth,
      hasFacebookAuth,
      hasTikTokAuth,
      byteSize: Math.max(Number(existingMeta.byteSize || 0), Buffer.byteLength(jsonStr, "utf8")),
    };
    fs.writeFileSync(metaPath, JSON.stringify(mergedMeta, null, 2), "utf8");

    return {
      ok: true,
      code,
      sources: vault.sources,
      totalCookies: vault.allCookies.length,
      sqliteInjected,
      snapshottedSqlite: Boolean(snap?.snapshotted),
    };
  } catch (err) {
    return { ok: false, code, error: err?.message || "write_back_failed" };
  }
}

/**
 * Batch sweeps `profileMap` (or `baseDir`) and writes back all ecosystem vault cookies
 * to each profile directory's `Default/Network/Cookies.vault-hydrated.json` + `Cookies.guard-meta.json`.
 */
function batchWriteBackAllVaultCookiesToProfilesDisk({
  baseDir = "D:\\StealthBrowser\\profiles",
  profileMap = null,
  injectSqlite = false,
  skipProfileCodes = [
    "0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009",
    "0010", "0011", "0012", "0013", "0014", "0015", "0016", "0017", "0018", "0019", "0020", "0021",
    "0059", "0069", "0120",
  ],
} = {}) {
  const skipSet = new Set(skipProfileCodes.map((c) => String(c).trim().padStart(4, "0")));
  let scanned = 0;
  let written = 0;
  let totalCookiesWritten = 0;
  const bySource = { facebook: 0, gmail: 0, outlook: 0, tiktok: 0, services: 0 };

  const pairs = [];
  if (profileMap && typeof profileMap.entries === "function") {
    for (const [k, v] of profileMap.entries()) {
      const code = String(k || "").trim().padStart(4, "0");
      const dir = typeof v === "string" ? v : v?.dir;
      if (dir) pairs.push({ code, dir });
    }
  } else if (baseDir && fs.existsSync(baseDir)) {
    const catalogCandidates = [
      path.join(baseDir, "profiles.json"),
      path.resolve(baseDir, "..", "data", "profiles.json"),
      "D:\\StealthBrowser\\data\\profiles.json",
    ];
    for (const catPath of catalogCandidates) {
      if (!fs.existsSync(catPath)) continue;
      try {
        const rawCat = JSON.parse(fs.readFileSync(catPath, "utf8"));
        const list = Array.isArray(rawCat) ? rawCat : rawCat?.profiles || [];
        for (const p of list) {
          const code = String(p?.code || String(p?.name || "").match(/^(\d{4})/)?.[1] || "")
            .trim()
            .padStart(4, "0");
          const dir = p?.userDataDir || p?.folderPath || (p?.id ? path.join(baseDir, String(p.id)) : "");
          if (/^\d{4}$/.test(code) && dir && fs.existsSync(dir)) {
            pairs.push({ code, dir });
          }
        }
        if (pairs.length > 0) break;
      } catch {
        /* ignore */
      }
    }
    if (pairs.length === 0) {
      const sqliteCatalogCandidates = [
        path.join(process.env.APPDATA || "", "stealth-browser-console", "data", "stealth-console.db"),
        path.join(process.env.APPDATA || "", "p0003-stealth-browser-console", "data", "stealth-console.db"),
        path.resolve(baseDir, "..", "data", "stealth-console.db"),
        "D:\\StealthBrowser\\data\\stealth-console.db",
      ];
      for (const dbPath of sqliteCatalogCandidates) {
        if (!dbPath || !fs.existsSync(dbPath)) continue;
        let catDb = null;
        try {
          catDb = new DatabaseSync(dbPath, { readOnly: true });
          const rows = catDb.prepare("SELECT id, name FROM profiles").all();
          for (const r of Array.isArray(rows) ? rows : []) {
            const m = String(r?.name || "").match(/(?:^|\D)(\d{4})(?:\D|$)/);
            const dir = r?.id ? path.join(baseDir, String(r.id)) : "";
            if (m && dir && fs.existsSync(dir)) {
              pairs.push({ code: m[1], dir });
            }
          }
          if (pairs.length > 0) break;
        } catch {
          /* ignore */
        } finally {
          try {
            catDb?.close();
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (pairs.length === 0) {
      for (const d of fs.readdirSync(baseDir, { withFileTypes: true })) {
        if (!d.isDirectory() || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(d.name)) continue;
        const m = d.name.match(/^(\d{4})(?:[-_]|$)/);
        const fullDir = path.join(baseDir, d.name);
        if (m && fs.existsSync(path.join(fullDir, "Default"))) {
          pairs.push({ code: m[1], dir: fullDir });
        }
      }
    }
  }

  if (injectSqlite) {
    const encKeys = [];
    for (const { code, dir } of pairs) {
      if (skipSet.has(code)) continue;
      const vault = collectVaultCookiesForProfileCode(code, { userDataDir: dir });
      if (vault.allCookies.length === 0) continue;
      const lsPath = path.join(dir, LOCAL_STATE_REL_PATH);
      if (fs.existsSync(lsPath)) {
        try {
          const ls = JSON.parse(fs.readFileSync(lsPath, "utf8"));
          if (ls?.os_crypt?.encrypted_key) encKeys.push(ls.os_crypt.encrypted_key);
        } catch {
          /* ignore */
        }
      }
    }
    batchUnprotectDpapiKeys(encKeys);
  }

  let sqliteProfilesInjected = 0;
  let sqliteCookiesInjected = 0;
  for (const { code, dir } of pairs) {
    if (skipSet.has(code)) continue;
    scanned += 1;
    const out = writeBackVaultCookiesToProfileDisk(dir, {
      profileCode: code,
      injectSqlite,
    });
    if (out.ok) {
      written += 1;
      totalCookiesWritten += out.totalCookies || 0;
      if (out.sqliteInjected > 0) {
        sqliteProfilesInjected += 1;
        sqliteCookiesInjected += out.sqliteInjected;
      }
      for (const s of out.sources || []) {
        if (bySource[s] !== undefined) bySource[s] += 1;
      }
    }
  }
  return { ok: true, scanned, written, totalCookiesWritten, sqliteProfilesInjected, sqliteCookiesInjected, bySource };
}

const SERVICE_COOKIE_DOMAIN_RULES = [
  { key: "chatgpt", label: "ChatGPT", matchDomain: (d) => d.includes("chatgpt.com") || d.includes("openai.com"), authNames: ["__Secure-next-auth.session-token", "__Secure-next-auth.session-token.0", "__Secure-next-auth.session-token.1"] },
  { key: "claude", label: "Claude", matchDomain: (d) => d.includes("claude.ai") || d.includes("anthropic.com"), authNames: ["sessionKey"] },
  { key: "discord", label: "Discord", matchDomain: (d) => d.includes("discord.com"), authNames: ["token", "__Secure-session"] },
  { key: "canva", label: "Canva", matchDomain: (d) => d.includes("canva.com"), authNames: ["CanvaSession", "AAT", "BAAF", "CAS", "CIT", "gtm_session"] },
  { key: "capcut", label: "CapCut", matchDomain: (d) => d.includes("capcut.com"), authNames: ["sessionid", "sessionid_ss", "sid_tt", "uid_tt"] },
  { key: "elevenlabs", label: "ElevenLabs", matchDomain: (d) => d.includes("elevenlabs.io"), authNames: ["xi-auth", "__session", "session_token", "auth_token", "access_token", "refresh_token"] },
  { key: "grok", label: "Grok", matchDomain: (d) => d.includes("grok.com") || d.includes("x.ai") || d.includes("x.com"), authNames: ["sso", "sso-rw", "auth_token", "grok-auth-session"] },
  { key: "suno", label: "Suno", matchDomain: (d) => d.includes("suno.com"), authNames: ["__session", "__client", "suno-auth-session"] },
  { key: "midjourney", label: "Midjourney", matchDomain: (d) => d.includes("midjourney.com"), authNames: ["__Host-Midjourney.AuthUserTokenV3", "__Secure-next-auth.session-token", "_mj_session"] },
  { key: "runway", label: "Runway", matchDomain: (d) => d.includes("runwayml.com"), authNames: ["rw_token", "rw_auth_token", "access_token", "session_token"] },
  { key: "heygen", label: "HeyGen", matchDomain: (d) => d.includes("heygen.com"), authNames: ["heygen_token", "heygen-auth-session", "token"] },
  { key: "higgsfield", label: "Higgsfield", matchDomain: (d) => d.includes("higgsfield.ai"), authNames: ["__session", "__client", "hf-auth-session", "hf-tier"] },
  { key: "freepik", label: "Freepik", matchDomain: (d) => d.includes("freepik.com"), authNames: ["GR_TOKEN", "UID", "FP_SESSION"] },
  { key: "kling", label: "Kling", matchDomain: (d) => d.includes("klingai.com"), authNames: ["kuaishou.ai.portal_st", "kling-auth-session", "userId"] },
  { key: "leonardo ai", label: "Leonardo AI", matchDomain: (d) => d.includes("leonardo.ai"), authNames: ["__Secure-next-auth.session-token", "accessToken", "refreshToken"] },
  { key: "perplexity", label: "Perplexity", matchDomain: (d) => d.includes("perplexity.ai"), authNames: ["__Secure-next-auth.session-token", "pplx-auth-token"] },
  { key: "topview", label: "TopView", matchDomain: (d) => d.includes("topview.ai"), authNames: ["topview_token", "token", "access_token"] },
  { key: "vidiq", label: "VidIQ", matchDomain: (d) => d.includes("vidiq.com"), authNames: ["auth_token", "vidiq_session"] },
  { key: "cursor", label: "Cursor", matchDomain: (d) => d.includes("cursor.com") || d.includes("cursor.sh"), authNames: ["WorkosCursorSessionToken", "WorkOSCursorSessionToken", "cursor_session"] },
  { key: "windsurf", label: "Windsurf", matchDomain: (d) => d.includes("windsurf.com") || d.includes("codeium.com"), authNames: ["__session", "windsurf_session", "auth_token"] },
  { key: "kalodata", label: "Kalodata", matchDomain: (d) => d.includes("kalodata.com"), authNames: ["SESSION", "token", "kalodata_token", "AGL_USER_ID"] },
  { key: "vercel", label: "Vercel", matchDomain: (d) => d.includes("vercel.com"), authNames: ["authorization"] },
  { key: "github", label: "GitHub", matchDomain: (d) => d.includes("github.com"), authNames: ["user_session", "__Host-user_session_same_site", "logged_in"] },
  { key: "adobe", label: "Adobe", matchDomain: (d) => d.includes("adobe.com"), authNames: ["aux_sid", "ims_sid", "ims_token"] },
  { key: "sync.so", label: "Sync.so", matchDomain: (d) => d.includes("sync.so"), authNames: ["sync-auth-session", "__client", "__session"] },
];

/**
 * Proposal 3 (`ok 3`): Scans a profile's `Default/Local Storage/leveldb` (or `.last-good.bak`) and `Default/IndexedDB`
 * for SPA tokens (`Discord`, `ElevenLabs`, `HeyGen`, `Suno`, `Higgsfield`, `CapCut`, `Midjourney`, `Canva`,
 * `Runway`, `Kling`, `TopView`, `VidIQ`, `Cursor`, `Windsurf`, `Kalodata`, `Adobe`, `Sync.so`, `Grok`, etc.)
 * and returns canonical SPA session descriptors + extracted tokens for `service-cookie-vault.json`.
 */
function extractProfileSpaAuthSessions(userDataDir) {
  if (!userDataDir) return [];
  const defDir = path.join(userDataDir, "Default");
  const lsLiveDir = path.join(userDataDir, LOCAL_STORAGE_REL_PATH);
  const lsBakDir = path.join(userDataDir, LOCAL_STORAGE_BAK_REL_PATH);
  const idbDir = path.join(defDir, "IndexedDB");

  let lsDir = "";
  if (fs.existsSync(lsLiveDir)) {
    try {
      const hasLdb = fs.readdirSync(lsLiveDir).some((f) => /\.(ldb|log)$/i.test(f));
      if (hasLdb) lsDir = lsLiveDir;
    } catch {
      /* ignore */
    }
  }
  if (!lsDir && fs.existsSync(lsBakDir)) {
    lsDir = lsBakDir;
  }

  let ls = "";
  if (lsDir) {
    try {
      const files = fs.readdirSync(lsDir).filter((f) => /\.(ldb|log)$/i.test(f));
      const chunks = [];
      for (const f of files) {
        try {
          const p = path.join(lsDir, f);
          const st = fs.statSync(p);
          if (st.size > 0 && st.size <= 4 * 1024 * 1024) {
            chunks.push(fs.readFileSync(p).toString("latin1").replace(/\x00/g, ""));
          }
        } catch {
          /* ignore locked file */
        }
      }
      ls = chunks.join("\n");
    } catch {
      /* ignore */
    }
  }

  let idbFolders = [];
  const idbText = {};
  const idbBytes = {};
  if (fs.existsSync(idbDir)) {
    try {
      idbFolders = fs
        .readdirSync(idbDir)
        .filter((f) => f.endsWith(".indexeddb.leveldb") && !f.includes("chrome-extension"));
      for (const folder of idbFolders) {
        if (
          !/elevenlabs\.io|adobe\.com|sync\.so|suno\.com|x\.ai|grok\.com|cursor\.com|midjourney\.com|canva\.com|discord\.com|leonardo\.ai|runwayml\.com|freepik\.com|topview\.ai|vidiq\.com|vercel\.com|kalodata\.com|kalowave\.com|perplexity\.ai|runninghub\.ai|windsurf\.com|codeium\.com|exness\.com|vtmarkets\.com/i.test(
            folder,
          )
        ) {
          continue;
        }
        const fullFolder = path.join(idbDir, folder);
        try {
          const files = fs.readdirSync(fullFolder).filter((f) => /\.(ldb|log)$/i.test(f));
          const chunks = [];
          let totalBytes = 0;
          for (const f of files) {
            try {
              const p = path.join(fullFolder, f);
              const st = fs.statSync(p);
              if (st.size > 0) {
                totalBytes += st.size;
                if (st.size <= 2 * 1024 * 1024) {
                  chunks.push(fs.readFileSync(p).toString("latin1").replace(/\x00/g, ""));
                }
              }
            } catch {
              /* ignore */
            }
          }
          idbText[folder] = chunks.join("\n");
          idbBytes[folder] = totalBytes;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (!ls && idbFolders.length === 0) return [];

  const extractOriginEntries = (domainStr, extraText = "") => {
    const cleanHost = String(domainStr || "").replace(/^\./, "").toLowerCase();
    const entries = {};
    const originValChunks = [];
    if (ls && cleanHost) {
      const escaped = cleanHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(
        `_https:\\/\\/(?:[a-z0-9-]+\\.)?${escaped}[\\x01]([A-Za-z0-9_.:@-]{2,64})[\\x01][\\s\\S]{1,20}?[\\x01]([\\x20-\\x7e]{2,500})`,
        "gi",
      );
      let m;
      while ((m = re.exec(ls)) !== null) {
        const k = m[1];
        const rawVal = m[2].trim();
        originValChunks.push(`${k}=${rawVal}`);
        if (/^(test|__sak|__mplssupport__|ph_|_gcl|SLARDAR|spdt-|version\.|text\.)/i.test(k)) continue;
        const jsonMatch = rawVal.match(/^(\{[^{}]{2,480}\}|"[^"\x00-\x1f]{1,240}"|[A-Za-z0-9_.-]{2,200})/);
        if (jsonMatch) {
          entries[k] = jsonMatch[1];
        }
      }
    }
    const combined = `${originValChunks.join("\n")}\n${extraText}`;
    const rtMatch =
      combined.match(/"refresh_?token"\s*:\s*"([A-Za-z0-9._-]{20,500})"/i) ||
      combined.match(/refresh_?token[^A-Za-z0-9._-]{1,16}([A-Za-z0-9._-]{28,500})/i);
    if (rtMatch) entries.refreshToken = rtMatch[1];
    const atMatch =
      combined.match(/"(?:access_?token|id_?token)"\s*:\s*"([A-Za-z0-9._-]{20,900})"/i) ||
      combined.match(/(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})/);
    if (atMatch) entries.accessToken = atMatch[1];
    const xiAuthMethod = combined.match(/xi-preserve:auth_last_used[\s\S]{0,20}?"([a-z0-9._-]+)"/i);
    if (xiAuthMethod && cleanHost.includes("elevenlabs")) {
      entries["xi-preserve:auth_last_used"] = JSON.stringify(xiAuthMethod[1]);
    }
    if (Object.keys(entries).length === 0) {
      entries.__p0003_spa_evidence = JSON.stringify(`${cleanHost}:verified_leveldb`);
    }
    return entries;
  };

  const matched = [];
  const pushSpa = (key, label, domain, cookieName, cookieValue, evidence, extra = {}) => {
    const idbFolder = idbFolders.find((f) => f.includes(String(domain || "").replace(/^\./, "")));
    const parsedEntries = extractOriginEntries(domain, idbFolder ? idbText[idbFolder] || "" : "");
    const mergedEntries = {
      ...parsedEntries,
      ...(extra.entries || {}),
      ...(extra.token ? { token: JSON.stringify(extra.token) } : {}),
      ...(extra.userId ? { user_id_cache: JSON.stringify(extra.userId) } : {}),
    };
    matched.push({
      key,
      label,
      evidence,
      spaStorage: {
        evidence,
        ...extra,
        ...(Object.keys(mergedEntries).length > 0 ? { entries: mergedEntries } : {}),
      },
      cookie: {
        name: cookieName,
        value: String(cookieValue || evidence),
        domain,
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "Lax",
        syntheticSpa: true,
      },
    });
  };

  // 1. Discord (`token` JWT or `user_id_cache` snowflake in LocalStorage)
  if (ls.includes("discord.com")) {
    const jwtMatch = ls.match(/([A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,})/);
    const uidMatch = ls.match(/user_id_cache[\s\S]{0,40}?"(\d{17,20})"/);
    if (jwtMatch || uidMatch) {
      pushSpa(
        "discord",
        "Discord",
        ".discord.com",
        "token",
        jwtMatch ? jwtMatch[1] : `uid:${uidMatch[1]}`,
        "LocalStorage:discord_token",
        {
          ...(jwtMatch ? { token: jwtMatch[1] } : {}),
          ...(uidMatch ? { userId: uidMatch[1] } : {}),
        },
      );
    }
  }

  // 2. ElevenLabs (require actual Firebase `stsTokenManager`+`refreshToken` / `AMf-vB` in IndexedDB or `xi_` API key in LocalStorage)
  const elIdbKey = idbFolders.find((f) => f.includes("elevenlabs.io"));
  const elRefreshMatch = elIdbKey ? (idbText[elIdbKey] || "").match(/AMf-vB[A-Za-z0-9_-]{20,}/)?.[0] : "";
  const xiKey = ls.includes("_https://elevenlabs.io") ? ls.match(/xi_[A-Za-z0-9]{24,}/)?.[0] : "";
  if (elRefreshMatch || xiKey) {
    pushSpa(
      "elevenlabs",
      "ElevenLabs",
      ".elevenlabs.io",
      xiKey ? "xi-api-key" : "__session",
      xiKey || elRefreshMatch,
      elRefreshMatch ? "IndexedDB:firebaseLocalStorage" : "LocalStorage:elevenlabs.io",
    );
  }

  // 3. Leonardo AI (require real Cognito/NextAuth/JWT token in Leonardo origin or IndexedDB)
  const leoIdb = idbFolders.find((f) => f.includes("app.leonardo.ai"));
  const leoEntries = extractOriginEntries("leonardo.ai", leoIdb ? idbText[leoIdb] || "" : "");
  const leoRealToken = leoEntries.accessToken || leoEntries.refreshToken || "";
  if (leoRealToken && !leoRealToken.startsWith("spa_")) {
    pushSpa(
      "leonardo ai",
      "Leonardo AI",
      ".leonardo.ai",
      "__Secure-next-auth.session-token",
      leoRealToken,
      "LocalStorage+IDB:leonardo.ai",
    );
  }

  // 4. Runway (require real Auth0/Runway JWT token and exclude RW_USER_TOKEN=anonymous)
  const rwIdbText = idbFolders
    .filter((f) => f.includes("runwayml.com"))
    .map((f) => idbText[f] || "")
    .join("\n");
  const rwEntries = extractOriginEntries("runwayml.com", rwIdbText);
  const rwUserToken = String(rwEntries.RW_USER_TOKEN || "").replace(/^"|"$/g, "").trim();
  const rwRealToken =
    rwEntries.accessToken ||
    rwEntries.refreshToken ||
    (rwUserToken && rwUserToken.toLowerCase() !== "anonymous" && rwUserToken.length >= 24 && /eyJ[A-Za-z0-9_-]{20,}/.test(rwUserToken)
      ? rwUserToken
      : "");
  if (rwRealToken && !rwRealToken.startsWith("spa_")) {
    pushSpa(
      "runway",
      "Runway",
      ".runwayml.com",
      "rw_auth_token",
      rwRealToken,
      "LocalStorage+IDB:runwayml.com",
    );
  }

  // 5. TopView (require real JWT token in TopView origin or IndexedDB)
  const tvIdb = idbFolders.find((f) => f.includes("topview.ai"));
  const tvEntries = extractOriginEntries("topview.ai", tvIdb ? idbText[tvIdb] || "" : "");
  const tvRealToken = tvEntries.accessToken || tvEntries.refreshToken || "";
  if (tvRealToken && !tvRealToken.startsWith("spa_")) {
    pushSpa(
      "topview",
      "TopView",
      ".topview.ai",
      "topview_token",
      tvRealToken,
      "LocalStorage+IDB:topview.ai",
    );
  }

  // 6. VidIQ (extract real JWT `access_token` + `refresh_token` from `https_app.vidiq.com_0.indexeddb.leveldb`)
  const vqIdb = idbFolders.find((f) => f.includes("app.vidiq.com"));
  const vqEntries = extractOriginEntries("vidiq.com", vqIdb ? idbText[vqIdb] || "" : "");
  const vqRealToken = vqEntries.accessToken || vqEntries.refreshToken || "";
  if (vqRealToken && !vqRealToken.startsWith("spa_")) {
    pushSpa(
      "vidiq",
      "VidIQ",
      ".vidiq.com",
      "auth_token",
      vqRealToken,
      "LocalStorage+IDB:app.vidiq.com",
    );
  }

  return matched;
}

/**
 * Proposal 2 (`ok 2`): Reverse-syncs on-disk SQLite `Default/Network/Cookies` (and `Cookies.last-good.bak`)
 * across all profiles in `profileMap` (or `baseDir`) using `_dpapiKeyCache` + `decryptCookieValueChromium`,
 * harvesting any authenticated cookies not yet stored in `fb-cookie-vault.json`, `mail-cookie-vault.json`,
 * `tiktok-cookie-vault.json`, or `service-cookie-vault.json`.
 */
function harvestDiskSqliteToEcosystemVaults({
  baseDir = "D:\\StealthBrowser\\profiles",
  profileMap = null,
  skipProfileCodes = ["0010", "0011", "0012", "0013", "0014", "0015", "0016", "0017", "0018", "0019", "0020", "0021", "0059", "0069"],
} = {}) {
  const vaultDir = resolveP0002VaultDir();
  if (!vaultDir) return { ok: false, reason: "vault_dir_not_found" };

  let DatabaseSync = null;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    return { ok: false, reason: "node_sqlite_unavailable" };
  }

  const skipSet = new Set(skipProfileCodes.map((c) => String(c).trim().padStart(4, "0")));
  const pairs = [];
  if (profileMap && typeof profileMap.entries === "function") {
    for (const [k, v] of profileMap.entries()) {
      const code = String(k || "").trim().padStart(4, "0");
      const dir = typeof v === "string" ? v : v?.dir;
      if (dir) pairs.push({ code, dir });
    }
  } else if (baseDir && fs.existsSync(baseDir)) {
    const catalogCandidates = [
      path.join(baseDir, "profiles.json"),
      path.resolve(baseDir, "..", "data", "profiles.json"),
      "D:\\StealthBrowser\\data\\profiles.json",
    ];
    for (const catPath of catalogCandidates) {
      if (!fs.existsSync(catPath)) continue;
      try {
        const rawCat = JSON.parse(fs.readFileSync(catPath, "utf8"));
        const list = Array.isArray(rawCat) ? rawCat : rawCat?.profiles || [];
        for (const p of list) {
          const code = String(p?.code || String(p?.name || "").match(/^(\d{4})/)?.[1] || "")
            .trim()
            .padStart(4, "0");
          const dir = p?.userDataDir || p?.folderPath || (p?.id ? path.join(baseDir, String(p.id)) : "");
          if (/^\d{4}$/.test(code) && dir && fs.existsSync(dir)) {
            pairs.push({ code, dir });
          }
        }
        if (pairs.length > 0) break;
      } catch {
        /* ignore */
      }
    }
    if (pairs.length === 0) {
      const sqliteCatalogCandidates = [
        path.join(process.env.APPDATA || "", "stealth-browser-console", "data", "stealth-console.db"),
        path.join(process.env.APPDATA || "", "p0003-stealth-browser-console", "data", "stealth-console.db"),
        path.resolve(baseDir, "..", "data", "stealth-console.db"),
        "D:\\StealthBrowser\\data\\stealth-console.db",
      ];
      for (const dbPath of sqliteCatalogCandidates) {
        if (!dbPath || !fs.existsSync(dbPath)) continue;
        let catDb = null;
        try {
          catDb = new DatabaseSync(dbPath, { readOnly: true });
          const rows = catDb.prepare("SELECT id, name FROM profiles").all();
          for (const r of Array.isArray(rows) ? rows : []) {
            const m = String(r?.name || "").match(/(?:^|\D)(\d{4})(?:\D|$)/);
            const dir = r?.id ? path.join(baseDir, String(r.id)) : "";
            if (m && dir && fs.existsSync(dir)) {
              pairs.push({ code: m[1], dir });
            }
          }
          if (pairs.length > 0) break;
        } catch {
          /* ignore */
        } finally {
          try {
            catDb?.close();
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (pairs.length === 0) {
      for (const d of fs.readdirSync(baseDir, { withFileTypes: true })) {
        if (!d.isDirectory() || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(d.name)) continue;
        const m = d.name.match(/^(\d{4})(?:[-_]|$)/);
        const fullDir = path.join(baseDir, d.name);
        if (m && fs.existsSync(path.join(fullDir, "Default"))) {
          pairs.push({ code: m[1], dir: fullDir });
        }
      }
    }
  }

  // 1) Pre-warm DPAPI cache for all profiles that have a readable SQLite Cookies file (> 4 KB)
  const encKeys = [];
  const candidateProfiles = [];
  for (const { code, dir } of pairs) {
    if (skipSet.has(code)) continue;
    const ckPath = path.join(dir, COOKIES_REL_PATH);
    const bakPath = path.join(dir, COOKIES_BAK_REL_PATH);
    const targetCk =
      fs.existsSync(ckPath) && fs.statSync(ckPath).size > 4096
        ? ckPath
        : fs.existsSync(bakPath) && fs.statSync(bakPath).size > 4096
          ? bakPath
          : "";
    if (!targetCk) continue;
    const lsPath = path.join(dir, LOCAL_STATE_REL_PATH);
    const lsBakPath = path.join(dir, LOCAL_STATE_BAK_REL_PATH);
    const targetLs = fs.existsSync(lsPath) ? lsPath : fs.existsSync(lsBakPath) ? lsBakPath : "";
    if (!targetLs) continue;
    try {
      const ls = JSON.parse(fs.readFileSync(targetLs, "utf8"));
      const ek = ls?.os_crypt?.encrypted_key;
      if (ek) {
        encKeys.push(ek);
        candidateProfiles.push({ code, dir, targetCk, encryptedKeyB64: ek });
      }
    } catch {
      /* ignore */
    }
  }

  batchUnprotectDpapiKeys(encKeys);

  // 2) Load raw vault files for merging
  const fbPath = path.join(vaultDir, "fb-cookie-vault.json");
  const mailPath = path.join(vaultDir, "mail-cookie-vault.json");
  const ttPath = path.join(vaultDir, "tiktok-cookie-vault.json");
  const svcPath = path.join(vaultDir, "service-cookie-vault.json");

  const readJsonSafe = (p, fallback) => {
    if (!fs.existsSync(p)) return fallback;
    try {
      return JSON.parse(fs.readFileSync(p, "utf8")) || fallback;
    } catch {
      return fallback;
    }
  };

  const fbVault = readJsonSafe(fbPath, {});
  const mailRaw = readJsonSafe(mailPath, { updatedAt: new Date().toISOString(), profiles: {} });
  if (!mailRaw.profiles) mailRaw.profiles = {};
  const ttRaw = readJsonSafe(ttPath, { updatedAt: new Date().toISOString(), profiles: {} });
  if (!ttRaw.profiles) ttRaw.profiles = {};
  const svcRaw = readJsonSafe(svcPath, { updatedAt: new Date().toISOString(), services: {} });
  if (!svcRaw.services) svcRaw.services = {};

  let harvestedFb = 0;
  let harvestedGmail = 0;
  let harvestedOutlook = 0;
  let harvestedTikTok = 0;
  let harvestedServices = 0;
  let decryptedCookiesTotal = 0;
  const nowIso = new Date().toISOString();

  for (const { code, targetCk, encryptedKeyB64 } of candidateProfiles) {
    const masterKey = unprotectDpapiKey(encryptedKeyB64);
    if (!masterKey) continue;

    let db = null;
    let rows = [];
    let metaVer = 24;
    try {
      db = new DatabaseSync(targetCk, { open: true, readOnly: true });
      try {
        const mRow = db.prepare("SELECT value FROM meta WHERE key = 'version'").get();
        if (mRow?.value) metaVer = Number(mRow.value) || 24;
      } catch {
        metaVer = 24;
      }
      rows = db
        .prepare(
          "SELECT host_key, name, value, encrypted_value, path, CAST(expires_utc AS TEXT) AS expires_utc, CAST(last_update_utc AS TEXT) AS last_update_utc, CAST(creation_utc AS TEXT) AS creation_utc, is_secure, is_httponly, samesite FROM cookies ORDER BY last_update_utc ASC, creation_utc ASC, rowid ASC",
        )
        .all();
    } catch {
      rows = [];
    } finally {
      try {
        db?.close();
      } catch {
        /* ignore */
      }
    }

    if (!rows.length) continue;

    const rawDecoded = [];
    for (const r of rows) {
      const hostKey = String(r.host_key || "").trim();
      const name = String(r.name || "").trim();
      if (!hostKey || !name) continue;
      let val = String(r.value || "");
      if (!val && r.encrypted_value) {
        val = decryptCookieValueChromium(masterKey, r.encrypted_value, metaVer);
        if (val) decryptedCookiesTotal += 1;
      }
      if (!val) continue;
      let expUs = 0n;
      try {
        expUs = BigInt(String(r.expires_utc || "0").replace(/[^0-9-]/g, "") || "0");
      } catch {
        expUs = 0n;
      }
      const expSec =
        expUs > WEBKIT_EPOCH_DIFF_MS * 1000n
          ? Number((expUs - WEBKIT_EPOCH_DIFF_MS * 1000n) / 1000000n)
          : Math.round(Date.now() / 1000) + 365 * 86400;
      let updatedUs = 0n;
      try {
        updatedUs = BigInt(String(r.last_update_utc || r.creation_utc || "0").replace(/[^0-9-]/g, "") || "0");
      } catch {
        updatedUs = 0n;
      }
      const is3p = name.startsWith("__Secure-3P");
      const sameSite = is3p
        ? "None"
        : r.samesite === 0
          ? "None"
          : r.samesite === 1
            ? "Lax"
            : r.samesite === 2
              ? "Strict"
              : "Lax";
      rawDecoded.push({
        name,
        value: val,
        domain: hostKey,
        path: String(r.path || "/"),
        secure: is3p || Boolean(r.is_secure),
        httpOnly: Boolean(r.is_httponly),
        sameSite,
        expires: expSec,
        _updatedUs: updatedUs,
      });
    }

    const decodedCookies = reconcileSplitGoogleAuthCookies(rawDecoded, []);
    if (!decodedCookies.length) continue;

    // A) Facebook (`c_user` + `xs`) — SQLite is authoritative: always refresh Vault when SQLite holds a valid FB session
    const fbCookies = decodedCookies.filter((c) => c.domain.includes("facebook.com"));
    if (fbCookies.some((c) => c.name === "c_user") && fbCookies.some((c) => c.name === "xs")) {
      const cUser = fbCookies.find((c) => c.name === "c_user")?.value || null;
      fbVault[code] = {
        code,
        fbUserId: cUser,
        updatedAt: nowIso,
        source: "p0003_sqlite_harvest",
        cookies: fbCookies,
      };
      harvestedFb += 1;
    }

    // B) Gmail (`SID` + `__Secure-1PSID` coherent) — SQLite is authoritative: always refresh Vault with sanitized coherent Google set
    const gmCookies = sanitizeCoherentGoogleCookieSet(decodedCookies.filter((c) => c.domain.includes("google.com")));
    if (gmCookies.some((c) => c.name === "SID" && c.value) && gmCookies.some((c) => c.name === "__Secure-1PSID" && c.value)) {
      if (!mailRaw.profiles[code]) mailRaw.profiles[code] = {};
      mailRaw.profiles[code].gmail = {
        code,
        provider: "gmail",
        account: mailRaw.profiles[code]?.gmail?.account || null,
        updatedAt: nowIso,
        source: "p0003_sqlite_harvest",
        cookies: gmCookies,
      };
      harvestedGmail += 1;
    }

    // C) Outlook (`RPSSecAuth`, `MSPAuth`, `WLSSC`, `OwaUserState`, `DefaultAnchorMailbox`, `SDIDC`) — SQLite is authoritative
    const olCookies = decodedCookies.filter(
      (c) => c.domain.includes("live.com") || c.domain.includes("outlook.com") || c.domain.includes("office.com") || c.domain.includes("microsoft.com"),
    );
    if (olCookies.some((c) => ["RPSSecAuth", "MSPAuth", "WLSSC", "OwaUserState", "DefaultAnchorMailbox", "SDIDC", "__Host-MSAAUTHP"].includes(c.name))) {
      if (!mailRaw.profiles[code]) mailRaw.profiles[code] = {};
      mailRaw.profiles[code].outlook = {
        code,
        provider: "outlook",
        account: mailRaw.profiles[code]?.outlook?.account || null,
        updatedAt: nowIso,
        source: "p0003_sqlite_harvest",
        cookies: olCookies,
      };
      harvestedOutlook += 1;
    }

    // D) TikTok (`sessionid` or `sid_tt` with real 24-64 char hex value) — SQLite is authoritative
    const ttCookies = decodedCookies.filter(
      (c) => c.domain.includes("tiktok.com") && !String(c.value || "").startsWith("dGlrdG9rX"),
    );
    if (
      ttCookies.some(
        (c) =>
          ["sessionid", "sessionid_ss", "sid_tt"].includes(c.name) &&
          /^[0-9a-f]{24,64}$/i.test(String(c.value || "").trim()),
      )
    ) {
      ttRaw.profiles[code] = {
        code,
        account: ttRaw.profiles[code]?.account || null,
        updatedAt: nowIso,
        source: "p0003_sqlite_harvest",
        cookies: ttCookies,
      };
      harvestedTikTok += 1;
    }

    // E) Services (`ChatGPT`, `Claude`, `Discord`, `Canva`, `CapCut`, etc.) — SQLite is authoritative
    for (const rule of SERVICE_COOKIE_DOMAIN_RULES) {
      const svcCookies = decodedCookies.filter((c) => rule.matchDomain(c.domain));
      if (svcCookies.length === 0) continue;
      const hasAuth = svcCookies.some((c) =>
        rule.authNames.some((an) => c.name === an || c.name.startsWith(`${an}.`)),
      );
      if (!hasAuth) continue;
      const vKey = `${code}:${rule.key}`;
      svcRaw.services[vKey] = {
        code,
        service: rule.label,
        account: svcRaw.services[vKey]?.account || null,
        updatedAt: nowIso,
        source: "p0003_sqlite_harvest",
        cookies: svcCookies,
      };
      harvestedServices += 1;
    }
  }

  // 3) Proposal 3 (`ok 3`): Sweep LevelDB `Default/Local Storage/leveldb` & `Default/IndexedDB` for SPA auth tokens
  let harvestedSpaServices = 0;
  let localStorageBackupsCreated = 0;
  for (const { code, dir } of pairs) {
    if (skipSet.has(code)) continue;
    const bakDir = path.join(dir, LOCAL_STORAGE_BAK_REL_PATH);
    if (!fs.existsSync(bakDir)) {
      const snapLs = snapshotLocalStorageIfHealthy(dir);
      if (snapLs?.snapshotted) localStorageBackupsCreated += 1;
    }
    const spaSessions = extractProfileSpaAuthSessions(dir);
    for (const spa of spaSessions) {
      const vKey = `${code}:${spa.key}`;
      const existing = svcRaw.services[vKey];
      const hasCookies = Array.isArray(existing?.cookies) && existing.cookies.length > 0;
      const needsSpaUpgrade =
        !existing?.spaStorage ||
        (!existing?.spaStorage?.entries && spa.spaStorage?.entries && Object.keys(spa.spaStorage.entries).length > 0);
      if (!hasCookies || needsSpaUpgrade) {
        svcRaw.services[vKey] = {
          code,
          service: spa.label,
          account: existing?.account || null,
          updatedAt: nowIso,
          source: hasCookies ? existing.source || "p0003_spa_leveldb_harvest" : "p0003_spa_leveldb_harvest",
          spaStorage: spa.spaStorage,
          cookies: hasCookies ? existing.cookies : [spa.cookie],
        };
        harvestedServices += 1;
        if (!hasCookies) {
          harvestedSpaServices += 1;
        }
      }
    }
  }

  const mirrorVaultWrite = (primaryPath, fileName, jsonStr) => {
    fs.writeFileSync(primaryPath, jsonStr, "utf8");
    for (const altDir of [
      "D:\\StealthBrowser\\data\\cookie-vaults",
      "E:\\Dev\\Tool\\P0002-Social-Hub\\data",
    ]) {
      try {
        if (!fs.existsSync(altDir)) continue;
        const altPath = path.join(altDir, fileName);
        if (path.resolve(altPath) !== path.resolve(primaryPath)) {
          fs.writeFileSync(altPath, jsonStr, "utf8");
        }
      } catch {
        /* ignore mirror write error */
      }
    }
  };

  if (harvestedFb > 0) {
    mirrorVaultWrite(fbPath, "fb-cookie-vault.json", JSON.stringify(fbVault, null, 2));
  }
  if (harvestedGmail > 0 || harvestedOutlook > 0) {
    mailRaw.updatedAt = nowIso;
    mirrorVaultWrite(mailPath, "mail-cookie-vault.json", JSON.stringify(mailRaw, null, 2));
  }
  if (harvestedTikTok > 0) {
    ttRaw.updatedAt = nowIso;
    mirrorVaultWrite(ttPath, "tiktok-cookie-vault.json", JSON.stringify(ttRaw, null, 2));
  }
  if (harvestedServices > 0) {
    svcRaw.updatedAt = nowIso;
    mirrorVaultWrite(svcPath, "service-cookie-vault.json", JSON.stringify(svcRaw, null, 2));
  }

  if (harvestedFb + harvestedGmail + harvestedOutlook + harvestedTikTok + harvestedServices > 0) {
    _guardVaultCache = null;
    _guardVaultCacheAt = 0;
  }

  return {
    ok: true,
    scannedProfiles: candidateProfiles.length,
    decryptedCookiesTotal,
    localStorageBackupsCreated,
    harvested: {
      facebook: harvestedFb,
      gmail: harvestedGmail,
      outlook: harvestedOutlook,
      tiktok: harvestedTikTok,
      services: harvestedServices,
      spaServices: harvestedSpaServices,
    },
  };
}

const GOOGLE_CORE_AUTH_COOKIE_NAMES = new Set([
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "__Secure-1PSID",
  "__Secure-3PSID",
  "__Secure-1PSIDTS",
  "__Secure-3PSIDTS",
  "__Secure-1PAPISID",
  "__Secure-3PAPISID",
  "SIDCC",
  "__Secure-1PSIDCC",
  "__Secure-3PSIDCC",
]);

const GOOGLE_CROSS_TLD_AUTH_COOKIE_NAMES = new Set([
  "SID",
  "APISID",
  "SAPISID",
  "__Secure-1PSID",
  "__Secure-3PSID",
  "__Secure-1PAPISID",
  "__Secure-3PAPISID",
]);

const MICROSOFT_CORE_AUTH_COOKIE_NAMES = new Set([
  "RPSSecAuth",
  "MSPAuth",
  "MSNPPAuth",
  "__Host-MSAAUTH",
  "__Host-MSAAUTHP",
  "ESTSAUTH",
  "ESTSAUTHPERSISTENT",
  "WLSSC",
  "SDIDC",
  "OwaUserState",
  "DefaultAnchorMailbox",
  "JSH",
  "JSHP",
]);

function isGoogleRegionalHostKey(hostKey) {
  const h = String(hostKey || "").toLowerCase();
  return /^\.google\.(com\.[a-z]{2,3}|co\.[a-z]{2,3}|[a-z]{2,3})$/.test(h) && h !== ".google.com";
}

function readCookiesFromSingleSqliteFile(targetPath, masterKey, DatabaseSync) {
  let db = null;
  let tmpCopyPath = "";
  try {
    // Always copy targetPath to os.tmpdir() before opening with DatabaseSync so Node never holds a file handle
    // on Default/Network/Cookies that could collide with Chromium 146's exclusive LockProfileCookieDatabase.
    tmpCopyPath = path.join(
      os.tmpdir(),
      `p0003-ck-read-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
    );
    try {
      fs.copyFileSync(targetPath, tmpCopyPath);
    } catch {
      fs.writeFileSync(tmpCopyPath, fs.readFileSync(targetPath));
    }
    for (const suffix of ["-wal", "-journal"]) {
      const sideSrc = `${targetPath}${suffix}`;
      if (fs.existsSync(sideSrc)) {
        try {
          fs.copyFileSync(sideSrc, `${tmpCopyPath}${suffix}`);
        } catch {
          /* ignore */
        }
      }
    }
    db = new DatabaseSync(tmpCopyPath);
    const metaVer = Number(db.prepare("SELECT value FROM meta WHERE key = 'version'").get()?.value || 24);
    const rows = db
      .prepare(
        "SELECT host_key, name, value, encrypted_value, path, is_secure, is_httponly, samesite, CAST(expires_utc AS TEXT) AS expires_utc_str, CAST(last_update_utc AS TEXT) AS last_update_utc_str, CAST(creation_utc AS TEXT) AS creation_utc_str FROM cookies ORDER BY last_update_utc ASC, creation_utc ASC, rowid ASC",
      )
      .all();
    db.close();
    db = null;
    const byKey = new Map();
    for (const r of Array.isArray(rows) ? rows : []) {
      let val = r.value ? String(r.value) : "";
      if (!val && r.encrypted_value) {
        val = decryptCookieValueChromium(masterKey, r.encrypted_value, metaVer);
      }
      if (!val) continue;
      let expires = -1;
      if (r.expires_utc_str && r.expires_utc_str !== "0") {
        try {
          const expUs = BigInt(r.expires_utc_str);
          if (expUs > 0n) {
            const expMs = expUs / 1000n - WEBKIT_EPOCH_DIFF_MS;
            if (expMs > 0n) expires = Number(expMs) / 1000;
          }
        } catch {
          /* ignore */
        }
      }
      let updatedUs = 0n;
      try {
        updatedUs = BigInt(r.last_update_utc_str || r.creation_utc_str || "0");
      } catch {
        updatedUs = 0n;
      }
      const sameSite = r.samesite === 0 ? "None" : r.samesite === 1 ? "Lax" : r.samesite === 2 ? "Strict" : undefined;
      const domain = String(r.host_key || "");
      const pathVal = String(r.path || "/");
      const name = String(r.name || "");
      byKey.set(`${domain.toLowerCase()}\t${pathVal}\t${name}`, {
        name,
        value: val,
        domain,
        path: pathVal,
        secure: Boolean(r.is_secure),
        httpOnly: Boolean(r.is_httponly),
        ...(sameSite ? { sameSite } : {}),
        ...(expires > 0 ? { expires } : {}),
        _updatedUs: updatedUs,
      });
    }
    return Array.from(byKey.values());
  } catch {
    return [];
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    if (tmpCopyPath) {
      for (const suffix of ["", "-wal", "-shm", "-journal"]) {
        try {
          const p = `${tmpCopyPath}${suffix}`;
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

function reconcileSplitGoogleAuthCookies(primaryList, backupList = []) {
  const byKey = new Map();
  for (const c of primaryList) {
    byKey.set(`${String(c.domain || "").toLowerCase()}\t${String(c.path || "/")}\t${c.name}`, c);
  }
  const backupGoogleCandidates = (Array.isArray(backupList) ? backupList : []).filter((c) => {
    const d = String(c?.domain || "").toLowerCase();
    return (
      d === ".google.com" ||
      d === "accounts.google.com" ||
      d === ".accounts.google.com" ||
      isGoogleRegionalHostKey(d)
    );
  });

  // Determine the newest Google auth session timestamp and SID prefix.
  // Primary SQLite (`Default/Network/Cookies`) is always authoritative when it already holds a Google session (`SID` / `__Secure-1PSID`),
  // so `Cookies.last-good.bak` (`backupList`) can never overwrite a live primary Google session with an older backup token.
  const primaryGoogleList = primaryList.filter((c) => {
    const d = String(c?.domain || "").toLowerCase();
    return d === ".google.com" || d.includes("accounts.google.com") || isGoogleRegionalHostKey(d);
  });
  const primaryHasGoogleAuth = primaryGoogleList.some(
    (c) =>
      (c.name === "SID" || c.name === "__Secure-1PSID" || c.name === "__Secure-3PSID") &&
      String(c.value || "").trim().length > 10,
  );
  let newestAuthUs = 0n;
  let newestSidPrefix = "";
  const prefixSourceList = primaryHasGoogleAuth ? primaryGoogleList : [...primaryGoogleList, ...backupGoogleCandidates];
  for (const c of prefixSourceList) {
    if (!GOOGLE_CORE_AUTH_COOKIE_NAMES.has(c.name) && c.name !== "LSID") continue;
    const u = typeof c._updatedUs === "bigint" ? c._updatedUs : 0n;
    if (u >= newestAuthUs) {
      newestAuthUs = u;
      if ((c.name === "SID" || c.name === "__Secure-1PSID" || c.name === "__Secure-3PSID") && String(c.value || "").startsWith("g.")) {
        newestSidPrefix = String(c.value).slice(0, 22);
      }
    }
  }

  for (const c of backupGoogleCandidates) {
    const dLow = String(c.domain || "").toLowerCase();
    const key = `${dLow}\t${String(c.path || "/")}\t${c.name}`;
    const existing = byKey.get(key);
    if (primaryHasGoogleAuth) {
      if (!existing) {
        if (
          newestSidPrefix &&
          (c.name === "SID" || c.name === "__Secure-1PSID" || c.name === "__Secure-3PSID") &&
          String(c.value || "").startsWith("g.") &&
          !String(c.value || "").startsWith(newestSidPrefix)
        ) {
          continue;
        }
        const cUs = typeof c._updatedUs === "bigint" ? c._updatedUs : 0n;
        if (newestAuthUs > 0n && cUs > 0n && newestAuthUs - cUs > 300_000_000n) {
          continue;
        }
        byKey.set(key, c);
      }
      continue;
    }
    const cUs = typeof c._updatedUs === "bigint" ? c._updatedUs : 0n;
    const exUs = existing && typeof existing._updatedUs === "bigint" ? existing._updatedUs : 0n;
    if (!existing || cUs > exUs) {
      byKey.set(key, c);
    }
  }

  // Promote newer regional (.google.com.vn / .google.hu / etc.) cross-TLD Google auth cookies to .google.com when .google.com is missing or older.
  // Never promote HSID or SSID across TLDs because Google signs HSID/SSID per host_key (.google.com vs .google.hu).
  for (const c of Array.from(byKey.values())) {
    if (!GOOGLE_CROSS_TLD_AUTH_COOKIE_NAMES.has(c.name)) continue;
    if (!isGoogleRegionalHostKey(c.domain)) continue;
    const dotGoogleKey = `.google.com\t/\t${c.name}`;
    const existingDot = byKey.get(dotGoogleKey);
    const cUs = typeof c._updatedUs === "bigint" ? c._updatedUs : 0n;
    const exUs = existingDot && typeof existingDot._updatedUs === "bigint" ? existingDot._updatedUs : 0n;
    const dotIsStaleSid =
      existingDot &&
      newestSidPrefix &&
      (c.name === "SID" || c.name === "__Secure-1PSID" || c.name === "__Secure-3PSID") &&
      !String(existingDot.value || "").startsWith(newestSidPrefix) &&
      String(c.value || "").startsWith(newestSidPrefix);
    if (!existingDot || cUs > exUs || dotIsStaleSid) {
      byKey.set(dotGoogleKey, {
        ...c,
        domain: ".google.com",
        path: "/",
      });
    }
  }

  // Reconcile Microsoft (Outlook / live.com / microsoft.com / office.com) auth cookies from backupList ONLY when missing in primaryList.
  // Primary SQLite (`Default/Network/Cookies`) is authoritative when it already holds a Microsoft auth session (`primaryHasMsAuth`).
  const primaryHasMsAuth = primaryList.some((c) => {
    const d = String(c?.domain || "").toLowerCase();
    return (
      (d.includes("live.com") ||
        d.includes("outlook.com") ||
        d.includes("office.com") ||
        d.includes("microsoft.com") ||
        d.includes("microsoftonline.com")) &&
      (c.name === "RPSSecAuth" ||
        c.name === "MSPAuth" ||
        c.name === "__Host-MSAAUTH" ||
        c.name === "__Host-MSAAUTHP" ||
        c.name === "ESTSAUTH" ||
        c.name === "ESTSAUTHPERSISTENT" ||
        c.name === "WLSSC") &&
      String(c.value || "").trim().length >= 10
    );
  });
  const backupMsCandidates = (Array.isArray(backupList) ? backupList : []).filter((c) => {
    const d = String(c?.domain || "").toLowerCase();
    return (
      d.includes("live.com") ||
      d.includes("outlook.com") ||
      d.includes("office.com") ||
      d.includes("microsoft.com") ||
      d.includes("microsoftonline.com")
    );
  });
  for (const c of backupMsCandidates) {
    if (!MICROSOFT_CORE_AUTH_COOKIE_NAMES.has(c.name)) continue;
    const dLow = String(c.domain || "").toLowerCase();
    const key = `${dLow}\t${String(c.path || "/")}\t${c.name}`;
    const existing = byKey.get(key);
    if (primaryHasMsAuth) {
      if (!existing) byKey.set(key, c);
      continue;
    }
    const cUs = typeof c._updatedUs === "bigint" ? c._updatedUs : 0n;
    const exUs = existing && typeof existing._updatedUs === "bigint" ? existing._updatedUs : 0n;
    if (!existing || cUs > exUs) {
      byKey.set(key, c);
    }
  }

  // Reconcile Facebook core auth cookies (`c_user`, `xs`, `fr`, `datr`, `sb`, `dbln`, `ps_l`, `ps_n`) from backupList when primaryList lost `c_user` or `xs`.
  const primaryHasFbAuth =
    Array.from(byKey.values()).some((c) => String(c.domain || "").includes("facebook.com") && c.name === "c_user") &&
    Array.from(byKey.values()).some((c) => String(c.domain || "").includes("facebook.com") && c.name === "xs");
  if (!primaryHasFbAuth && Array.isArray(backupList) && backupList.length > 0) {
    const backupFb = backupList.filter((c) => String(c?.domain || "").toLowerCase().includes("facebook.com"));
    const backupHasFbAuth =
      backupFb.some((c) => c.name === "c_user" && c.value) && backupFb.some((c) => c.name === "xs" && c.value);
    if (backupHasFbAuth) {
      for (const c of backupFb) {
        const dLow = String(c.domain || "").toLowerCase();
        const key = `${dLow}\t${String(c.path || "/")}\t${c.name}`;
        byKey.set(key, c);
      }
    }
  }

  // Enforce coherent Google `g.a000*` session prefix across `.google.com` (`SID`, `__Secure-1PSID`, `__Secure-3PSID`),
  // purge stale `OSID` / `__Secure-OSID` / `COMPASS` / `GMAIL_AT` left over from older sessions, and enforce `SameSite=None` on `__Secure-3P*`.
  const dot1Psid = byKey.get(".google.com\t/\t__Secure-1PSID");
  const dot3Psid = byKey.get(".google.com\t/\t__Secure-3PSID");
  const dotSid = byKey.get(".google.com\t/\tSID");
  const canonicalGooglePrefix =
    newestSidPrefix ||
    (dot1Psid && String(dot1Psid.value || "").startsWith("g.") ? String(dot1Psid.value).slice(0, 22) : "") ||
    (dot3Psid && String(dot3Psid.value || "").startsWith("g.") ? String(dot3Psid.value).slice(0, 22) : "") ||
    (dotSid && String(dotSid.value || "").startsWith("g.") ? String(dotSid.value).slice(0, 22) : "");
  const canonicalGoogleExpSec = Number(dot1Psid?.expires || dotSid?.expires || 0);
  const canonicalGoogleUs =
    newestAuthUs ||
    (typeof dot1Psid?._updatedUs === "bigint" ? dot1Psid._updatedUs : 0n) ||
    (typeof dotSid?._updatedUs === "bigint" ? dotSid._updatedUs : 0n);

  const outList = [];
  for (const c of byKey.values()) {
    const dLow = String(c.domain || "").toLowerCase();
    if (dLow.includes("google.")) {
      if (
        canonicalGooglePrefix &&
        (c.name === "SID" || c.name === "__Secure-1PSID" || c.name === "__Secure-3PSID") &&
        String(c.value || "").startsWith("g.") &&
        !String(c.value || "").startsWith(canonicalGooglePrefix)
      ) {
        continue;
      }
      if (c.name === "OSID" || c.name === "__Secure-OSID" || c.name === "COMPASS" || c.name === "GMAIL_AT") {
        const cUs = typeof c._updatedUs === "bigint" ? c._updatedUs : 0n;
        const cExp = Number(c.expires || 0);
        if (canonicalGoogleUs > 0n && cUs > 0n && canonicalGoogleUs - cUs > 300_000_000n) {
          continue;
        }
        if (canonicalGoogleExpSec > 0 && cExp > 0 && Math.abs(canonicalGoogleExpSec - cExp) > 3600) {
          continue;
        }
        if (
          canonicalGooglePrefix.length >= 11 &&
          String(c.value || "").startsWith("g.a000") &&
          String(c.value || "").slice(0, 11) !== canonicalGooglePrefix.slice(0, 11)
        ) {
          continue;
        }
      }
    }
    const { _updatedUs, ...rest } = c;
    if (String(rest.name || "").startsWith("__Secure-3P")) {
      rest.sameSite = "None";
      rest.secure = true;
    }
    outList.push(rest);
  }
  return outList;
}

/**
 * In-place SQLite hygiene for a closed profile's `Default/Network/Cookies` (and `Cookies.last-good.bak`):
 * 1. Deduplicates any duplicate `(host_key, name, path)` rows, keeping the row with the highest `last_update_utc, creation_utc, rowid`.
 * 2. Fixes `__Secure-3P*` rows with `samesite != 0` or `is_secure != 1`.
 * 3. Repairs colliding `creation_utc` values (caused by legacy batch cookie writers) so Chromium's `SQLitePersistentCookieStore`
 *    (`cookies_by_creation_time_`) never drops cookies on load.
 * 4. Purges split/stale Google `SID`/`__Secure-1PSID`/`__Secure-3PSID` and stale `OSID`/`__Secure-OSID`/`COMPASS`/`GMAIL_AT`
 *    from older login sessions so `mail.google.com` never triggers `CookieMismatch` logout.
 */
function sanitizeProfileSqliteCookiesInPlace(
  userDataDir,
  { targetRelPath = COOKIES_REL_PATH, ignoreProfileLock = false } = {},
) {
  if (!userDataDir) return { ok: false, mutated: false };
  const ckPath = path.join(userDataDir, targetRelPath);
  if (!fs.existsSync(ckPath)) return { ok: false, mutated: false };
  if (!ignoreProfileLock && targetRelPath === COOKIES_REL_PATH) {
    try {
      for (const lockName of ["lockfile", "SingletonLock"]) {
        const lp = path.join(userDataDir, lockName);
        if (!fs.existsSync(lp)) continue;
        try {
          const fd = fs.openSync(lp, "r+");
          fs.closeSync(fd);
        } catch (err) {
          if (err && (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES")) {
            return { ok: false, locked: true, mutated: false };
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  let DatabaseSync = null;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    return { ok: false, mutated: false };
  }

  let db = null;
  try {
    db = new DatabaseSync(ckPath, { open: true });
    const cols = new Set(
      db
        .prepare("PRAGMA table_info(cookies)")
        .all()
        .map((c) => String(c.name || "")),
    );
    if (!cols.has("path") || !cols.has("creation_utc")) {
      db.close();
      return {
        ok: true,
        mutated: false,
        dedupedRows: 0,
        fixedXsiteRows: 0,
        fixedSchemeRows: 0,
        fixed3pRows: 0,
        fixedCreationUtcRows: 0,
        purgedStaleGoogleRows: 0,
      };
    }
    const hasTopFrameCol = cols.has("top_frame_site_key");
    const hasXsiteCol = cols.has("has_cross_site_ancestor");
    const hasSchemeCol = cols.has("source_scheme") && cols.has("source_port");

    const dupCountRow = db
      .prepare(
        hasTopFrameCol
          ? "SELECT COUNT(*) AS c FROM (SELECT 1 FROM cookies GROUP BY LOWER(host_key), top_frame_site_key, name, path HAVING COUNT(*) > 1)"
          : "SELECT COUNT(*) AS c FROM (SELECT 1 FROM cookies GROUP BY LOWER(host_key), name, path HAVING COUNT(*) > 1)",
      )
      .get();
    const badXsiteRow =
      hasTopFrameCol && hasXsiteCol
        ? db
            .prepare(
              "SELECT COUNT(*) AS c FROM cookies WHERE top_frame_site_key = '' AND (has_cross_site_ancestor != 1 OR source_type = 0)",
            )
            .get()
        : { c: 0 };
    const badSchemeRow = hasSchemeCol
      ? db
          .prepare(
            `SELECT COUNT(*) AS c FROM cookies
             WHERE (source_scheme != 2 OR source_port != 443)
               AND (
                 is_secure = 1
                 OR host_key LIKE '%google.%'
                 OR host_key LIKE '%youtube.com'
                 OR host_key LIKE '%facebook.com'
                 OR host_key LIKE '%live.com'
                 OR host_key LIKE '%outlook.com'
                 OR host_key LIKE '%office.com'
                 OR host_key LIKE '%microsoft%'
                 OR host_key LIKE '%tiktok.com'
                 OR host_key LIKE '%claude.ai'
                 OR host_key LIKE '%openai.com'
                 OR host_key LIKE '%chatgpt.com'
                 OR host_key LIKE '%canva.com'
                 OR host_key LIKE '%capcut.com'
                 OR host_key LIKE '%adobe.com'
                 OR host_key LIKE '%github.com'
                 OR host_key LIKE '%discord.com'
                 OR host_key LIKE '%elevenlabs.io'
               )`,
          )
          .get()
      : { c: 0 };
    const bad3pRow = db
      .prepare(
        "SELECT COUNT(*) AS c FROM cookies WHERE name LIKE '__Secure-3P%' AND (samesite != 0 OR is_secure != 1)",
      )
      .get();
    const dupCrRow = db
      .prepare(
        "SELECT COUNT(*) AS c FROM (SELECT 1 FROM cookies GROUP BY creation_utc HAVING COUNT(*) > 1)",
      )
      .get();
    const googleAuthRows = db
      .prepare(
        `SELECT rowid, host_key, name, value, encrypted_value,
                CAST(expires_utc AS TEXT) AS expires_utc_str,
                CAST(last_update_utc AS TEXT) AS last_update_utc_str,
                CAST(creation_utc AS TEXT) AS creation_utc_str
         FROM cookies
         WHERE host_key LIKE '%google.%'
           AND name IN (
             'SID', '__Secure-1PSID', '__Secure-3PSID',
             'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PAPISID', '__Secure-3PAPISID',
             '__Secure-1PSIDTS', '__Secure-3PSIDTS', 'SIDCC', '__Secure-1PSIDCC', '__Secure-3PSIDCC',
             'LSID', '__Host-1PLSID', '__Host-3PLSID',
             'OSID', '__Secure-OSID', 'COMPASS', 'GMAIL_AT'
           )
         ORDER BY last_update_utc ASC, creation_utc ASC, rowid ASC`,
      )
      .all();

    let maxGoogleSidExpSec = 0;
    if (Array.isArray(googleAuthRows)) {
      for (const r of googleAuthRows) {
        if (r.name === "SID" || r.name === "__Secure-1PSID") {
          try {
            const expUs = BigInt(String(r.expires_utc_str || "0"));
            if (expUs > 0n) {
              const expSec = Number(expUs / 1000n - WEBKIT_EPOCH_DIFF_MS) / 1000;
              if (expSec > maxGoogleSidExpSec) maxGoogleSidExpSec = expSec;
            }
          } catch {
            /* ignore */
          }
        }
      }
    }

    let staleGoogleRowIds = [];
    if (Array.isArray(googleAuthRows) && googleAuthRows.length > 1) {
      const needsDecrypt = googleAuthRows.some((r) => !r.value && r.encrypted_value && r.encrypted_value.length > 0);
      const masterKey = needsDecrypt ? ensureProfileLocalStateDpapiKey(userDataDir) : null;
      let metaVer = 24;
      try {
        metaVer = Number(db.prepare("SELECT value FROM meta WHERE key = 'version'").get()?.value || 24);
      } catch {
        metaVer = 24;
      }
      if (masterKey || !needsDecrypt) {
        const decoded = [];
        for (const r of googleAuthRows) {
          let val = r.value ? String(r.value) : "";
          if (!val && r.encrypted_value && masterKey) {
            val = decryptCookieValueChromium(masterKey, r.encrypted_value, metaVer);
          }
          let updUs = 0n;
          let expUs = 0n;
          try {
            updUs = BigInt(String(r.last_update_utc_str || r.creation_utc_str || "0"));
          } catch {
            updUs = 0n;
          }
          try {
            expUs = BigInt(String(r.expires_utc_str || "0"));
          } catch {
            expUs = 0n;
          }
          decoded.push({
            rowid: Number(r.rowid),
            hostKey: String(r.host_key || "").toLowerCase(),
            name: String(r.name || ""),
            val,
            updUs,
            expUs,
          });
        }
        const dotSids = decoded
          .filter(
            (d) =>
              (d.hostKey === ".google.com" || isGoogleRegionalHostKey(d.hostKey)) &&
              (d.name === "__Secure-1PSID" || d.name === "SID") &&
              d.val.startsWith("g."),
          )
          .sort((a, b) =>
            a.expUs !== b.expUs ? (a.expUs < b.expUs ? -1 : 1) : a.updUs !== b.updUs ? (a.updUs < b.updUs ? -1 : 1) : 0,
          );
        const canonicalAuth = dotSids.length > 0 ? dotSids[dotSids.length - 1] : null;
        if (canonicalAuth) {
          const canonicalPrefix = canonicalAuth.val.slice(0, 22);
          const canonicalUpdUs = canonicalAuth.updUs;
          const canonicalExpUs = canonicalAuth.expUs;
          for (const d of decoded) {
            if (
              (d.name === "SID" || d.name === "__Secure-1PSID" || d.name === "__Secure-3PSID") &&
              d.val.startsWith("g.") &&
              !d.val.startsWith(canonicalPrefix)
            ) {
              staleGoogleRowIds.push(d.rowid);
            } else if (
              d.name === "OSID" ||
              d.name === "__Secure-OSID" ||
              d.name === "COMPASS" ||
              d.name === "GMAIL_AT"
            ) {
              const isOlderByUpd = canonicalUpdUs > 0n && d.updUs > 0n && canonicalUpdUs - d.updUs > 300_000_000n;
              const isDiffByExp =
                canonicalExpUs > 0n &&
                d.expUs > 0n &&
                (canonicalExpUs > d.expUs ? canonicalExpUs - d.expUs : d.expUs - canonicalExpUs) > 3_600_000_000n;
              const isDiffEpochBucket =
                canonicalPrefix.length >= 11 &&
                d.val.startsWith("g.a000") &&
                d.val.slice(0, 11) !== canonicalPrefix.slice(0, 11);
              if (isOlderByUpd || isDiffByExp || isDiffEpochBucket) {
                staleGoogleRowIds.push(d.rowid);
              }
            }
          }
        }
      }
    }

    const needDedupe = Number(dupCountRow?.c || 0) > 0;
    const needXsiteFix = Number(badXsiteRow?.c || 0) > 0;
    const needSchemeFix = Number(badSchemeRow?.c || 0) > 0;
    const need3pFix = Number(bad3pRow?.c || 0) > 0;
    const needCrFix = Number(dupCrRow?.c || 0) > 0;
    const needStaleGooglePurge = staleGoogleRowIds.length > 0;

    if (!needDedupe && !needXsiteFix && !needSchemeFix && !need3pFix && !needCrFix && !needStaleGooglePurge) {
      db.close();
      return {
        ok: true,
        mutated: false,
        maxGoogleSidExpSec,
        dedupedRows: 0,
        fixedXsiteRows: 0,
        fixedSchemeRows: 0,
        fixed3pRows: 0,
        fixedCreationUtcRows: 0,
        purgedStaleGoogleRows: 0,
      };
    }

    let dedupedRows = 0;
    let fixedXsiteRows = 0;
    let fixedSchemeRows = 0;
    let fixed3pRows = 0;
    let fixedCreationUtcRows = 0;
    let purgedStaleGoogleRows = 0;

    db.exec("BEGIN IMMEDIATE");
    if (needStaleGooglePurge) {
      const delById = db.prepare("DELETE FROM cookies WHERE rowid = ?");
      for (const rid of new Set(staleGoogleRowIds)) {
        const r = delById.run(rid);
        purgedStaleGoogleRows += Number(r?.changes || 0);
      }
    }
    if (needDedupe || needXsiteFix || needSchemeFix) {
      const allRows = db
        .prepare(
          hasTopFrameCol
            ? "SELECT rowid, host_key, top_frame_site_key, name, path FROM cookies ORDER BY last_update_utc ASC, creation_utc ASC, rowid ASC"
            : "SELECT rowid, host_key, '' AS top_frame_site_key, name, path FROM cookies ORDER BY last_update_utc ASC, creation_utc ASC, rowid ASC",
        )
        .all();
      const keepByKey = new Map();
      for (const r of allRows) {
        const k = `${String(r.host_key || "").toLowerCase()}\t${String(r.top_frame_site_key || "")}\t${String(r.path || "/")}\t${String(r.name || "")}`;
        keepByKey.set(k, Number(r.rowid));
      }
      const keepSet = new Set(keepByKey.values());
      const delById = db.prepare("DELETE FROM cookies WHERE rowid = ?");
      for (const r of allRows) {
        const rid = Number(r.rowid);
        if (!keepSet.has(rid)) {
          const res = delById.run(rid);
          dedupedRows += Number(res?.changes || 0);
        }
      }
    }
    if (needXsiteFix && hasTopFrameCol && hasXsiteCol) {
      const rXsite = db
        .prepare(
          "UPDATE OR REPLACE cookies SET has_cross_site_ancestor = 1, source_type = CASE WHEN source_type = 0 THEN 1 ELSE source_type END WHERE top_frame_site_key = '' AND (has_cross_site_ancestor != 1 OR source_type = 0)",
        )
        .run();
      fixedXsiteRows = Number(rXsite?.changes || 0);
    }
    if (needSchemeFix && hasSchemeCol) {
      const rSch = db
        .prepare(
          `UPDATE OR REPLACE cookies
           SET source_scheme = 2, source_port = 443
           WHERE (source_scheme != 2 OR source_port != 443)
             AND (
               is_secure = 1
               OR host_key LIKE '%google.%'
               OR host_key LIKE '%youtube.com'
               OR host_key LIKE '%facebook.com'
               OR host_key LIKE '%live.com'
               OR host_key LIKE '%outlook.com'
               OR host_key LIKE '%office.com'
               OR host_key LIKE '%microsoft%'
               OR host_key LIKE '%tiktok.com'
               OR host_key LIKE '%claude.ai'
               OR host_key LIKE '%openai.com'
               OR host_key LIKE '%chatgpt.com'
               OR host_key LIKE '%canva.com'
               OR host_key LIKE '%capcut.com'
               OR host_key LIKE '%adobe.com'
               OR host_key LIKE '%github.com'
               OR host_key LIKE '%discord.com'
               OR host_key LIKE '%elevenlabs.io'
             )`,
        )
        .run();
      fixedSchemeRows = Number(rSch?.changes || 0);
    }
    if (need3pFix) {
      const r3p = db
        .prepare(
          "UPDATE cookies SET samesite = 0, is_secure = 1 WHERE name LIKE '__Secure-3P%' AND (samesite != 0 OR is_secure != 1)",
        )
        .run();
      fixed3pRows = Number(r3p?.changes || 0);
    }
    if (needCrFix) {
      const crRows = db
        .prepare(
          "SELECT rowid, CAST(creation_utc AS TEXT) AS cr_str FROM cookies ORDER BY creation_utc ASC, rowid ASC",
        )
        .all();
      const seenCr = new Set();
      for (const r of crRows) {
        try {
          const cr = BigInt(String(r.cr_str || "0"));
          if (cr > 0n) seenCr.add(cr.toString());
        } catch {
          /* ignore */
        }
      }
      const seenAssigned = new Set();
      const updCr = db.prepare("UPDATE cookies SET creation_utc = ? WHERE rowid = ?");
      for (const r of crRows) {
        let cr = 0n;
        try {
          cr = BigInt(String(r.cr_str || "0"));
        } catch {
          cr = 0n;
        }
        if (cr <= 0n) {
          cr = (BigInt(Date.now()) + WEBKIT_EPOCH_DIFF_MS) * 1000n;
        }
        const crKey = cr.toString();
        if (!seenAssigned.has(crKey)) {
          seenAssigned.add(crKey);
        } else {
          let nextCr = cr + 1n;
          while (seenCr.has(nextCr.toString()) || seenAssigned.has(nextCr.toString())) {
            nextCr += 1n;
          }
          seenCr.add(nextCr.toString());
          seenAssigned.add(nextCr.toString());
          updCr.run(nextCr, Number(r.rowid));
          fixedCreationUtcRows += 1;
        }
      }
    }
    db.exec("COMMIT");
    db.close();
    db = null;
    return {
      ok: true,
      mutated: true,
      maxGoogleSidExpSec,
      dedupedRows,
      fixedXsiteRows,
      fixedSchemeRows,
      fixed3pRows,
      fixedCreationUtcRows,
      purgedStaleGoogleRows,
    };
  } catch (err) {
    try {
      db?.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    return { ok: false, mutated: false, error: err?.message || String(err) };
  }
}

/**
 * Decrypts all cookies from a closed profile's on-disk `Default/Network/Cookies` (falling back to and reconciling with `Cookies.last-good.bak`)
 * using the profile's `Local State` DPAPI master key so on-close sync can back up fresh sessions to the ecosystem vaults
 * and verify live cookie validity even when the user closes the window before the background CDP timer fires.
 */
function extractDecryptedCookiesFromProfileSqlite(userDataDir) {
  if (!userDataDir) return { ok: false, cookies: [] };
  const masterKey = ensureProfileLocalStateDpapiKey(userDataDir);
  if (!masterKey) return { ok: false, cookies: [] };
  let DatabaseSync = null;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    return { ok: false, cookies: [] };
  }
  const ckPath = path.join(userDataDir, COOKIES_REL_PATH);
  const bakPath = path.join(userDataDir, COOKIES_BAK_REL_PATH);
  const hasCk = fs.existsSync(ckPath) && fs.statSync(ckPath).size > 0;
  const hasBak = fs.existsSync(bakPath) && fs.statSync(bakPath).size > 0;
  const primaryCookies = hasCk ? readCookiesFromSingleSqliteFile(ckPath, masterKey, DatabaseSync) : [];
  if (primaryCookies.length > 0) {
    const rawHasDotGoogleSid = primaryCookies.some(
      (c) =>
        (String(c?.domain || "").toLowerCase() === ".google.com" ||
          String(c?.domain || "").toLowerCase() === "google.com") &&
        ["SID", "__Secure-1PSID", "__Secure-3PSID"].includes(c?.name) &&
        c?.value,
    );
    const rawHasDotGoogleSapisid = primaryCookies.some(
      (c) =>
        (String(c?.domain || "").toLowerCase() === ".google.com" ||
          String(c?.domain || "").toLowerCase() === "google.com") &&
        ["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID"].includes(c?.name) &&
        c?.value,
    );
    let mergedPrimary = reconcileSplitGoogleAuthCookies(primaryCookies, []);
    if (hasBak) {
      const hasDomainAuth = (arr, pred) => Array.isArray(arr) && arr.some(pred);
      const hasPrimaryGoogle =
        hasDomainAuth(
          mergedPrimary,
          (c) =>
            (String(c?.domain || "").toLowerCase() === ".google.com" ||
              String(c?.domain || "").toLowerCase() === "google.com") &&
            ["SID", "__Secure-1PSID", "__Secure-3PSID"].includes(c?.name) &&
            c?.value,
        ) &&
        hasDomainAuth(
          mergedPrimary,
          (c) =>
            (String(c?.domain || "").toLowerCase() === ".google.com" ||
              String(c?.domain || "").toLowerCase() === "google.com") &&
            ["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID"].includes(c?.name) &&
            c?.value,
        );
      const hasPrimaryOutlook = hasDomainAuth(
        mergedPrimary,
        (c) =>
          (String(c?.domain || "").toLowerCase().includes("live.com") ||
            String(c?.domain || "").toLowerCase().includes("outlook.com") ||
            String(c?.domain || "").toLowerCase().includes("office.com")) &&
          ["RPSSecAuth", "MSPAuth", "__Host-MSAAUTH", "ESTSAUTH", "WLSSC", "OwaUserState", "DefaultAnchorMailbox"].includes(c?.name) &&
          c?.value &&
          c?.value !== "0" &&
          c?.value !== "deleted",
      );
      const hasPrimaryFb = hasDomainAuth(
        mergedPrimary,
        (c) => String(c?.domain || "").toLowerCase().includes("facebook.com") && c?.name === "c_user" && c?.value,
      );
      const hasPrimaryTt = hasDomainAuth(
        mergedPrimary,
        (c) => String(c?.domain || "").toLowerCase().includes("tiktok.com") && ["sessionid", "sessionid_ss", "sid_tt"].includes(c?.name) && c?.value,
      );
      if (!hasPrimaryGoogle || !hasPrimaryOutlook || !hasPrimaryFb || !hasPrimaryTt) {
        const backupCookies = readCookiesFromSingleSqliteFile(bakPath, masterKey, DatabaseSync);
        if (backupCookies.length > 0) {
          const normalizedBak = reconcileSplitGoogleAuthCookies(backupCookies, []);
          const supplement = normalizedBak.filter((c) => {
            const d = String(c?.domain || "").toLowerCase();
            if (!hasPrimaryGoogle && (d.includes("google.") || d.includes("youtube.com"))) return true;
            if (!hasPrimaryOutlook && (d.includes("live.com") || d.includes("outlook.com") || d.includes("office.com") || d.includes("microsoft"))) return true;
            if (!hasPrimaryFb && (d.includes("facebook.com") || d.includes("fb.com"))) return true;
            if (!hasPrimaryTt && d.includes("tiktok.com")) return true;
            return false;
          });
          if (supplement.length > 0) {
            mergedPrimary = dedupeCookieList([...mergedPrimary, ...supplement]);
          }
        }
      }
    }
    if (!rawHasDotGoogleSid || !rawHasDotGoogleSapisid) {
      const healedGoogle = mergedPrimary.filter((c) => {
        const d = String(c?.domain || "").toLowerCase();
        return d === ".google.com" || d.includes("accounts.google.com") || d.includes("mail.google.com");
      });
      if (
        healedGoogle.some((c) => ["SID", "__Secure-1PSID", "__Secure-3PSID"].includes(c?.name) && c?.value) &&
        healedGoogle.some((c) => ["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID"].includes(c?.name) && c?.value)
      ) {
        try {
          injectVaultCookiesIntoClosedSqlite(userDataDir, healedGoogle);
        } catch {
          /* ignore if locked */
        }
      }
    }
    return { ok: mergedPrimary.length > 0, cookies: mergedPrimary };
  }
  const backupCookies = hasBak ? readCookiesFromSingleSqliteFile(bakPath, masterKey, DatabaseSync) : [];
  if (backupCookies.length === 0) {
    return { ok: false, cookies: [] };
  }
  const merged = reconcileSplitGoogleAuthCookies(backupCookies, []);
  return { ok: merged.length > 0, cookies: merged };
}

module.exports = {
  COOKIES_REL_PATH,
  COOKIES_BAK_REL_PATH,
  COOKIES_META_REL_PATH,
  COOKIES_VAULT_HYDRATED_REL_PATH,
  LOCAL_STATE_REL_PATH,
  LOCAL_STATE_BAK_REL_PATH,
  LOCAL_STORAGE_REL_PATH,
  LOCAL_STORAGE_BAK_REL_PATH,
  unprotectDpapiKey,
  batchUnprotectDpapiKeys,
  decryptCookieValueChromium,
  extractDecryptedCookiesFromProfileSqlite,
  injectVaultCookiesIntoClosedSqlite,
  reconcileSplitGoogleAuthCookies,
  sanitizeProfileSqliteCookiesInPlace,
  extractProfileSpaAuthSessions,
  inspectSqliteCookiesFile,
  inspectProfileSqliteCookiesSummary,
  snapshotProfileCookiesIfHealthy,
  snapshotLocalStorageIfHealthy,
  restoreLocalStorageBackup,
  autoHealWipedProfileCookies,
  installPlaywrightContextCookieGuard,
  collectVaultCookiesForProfileCode,
  hydrateContextFromEcosystemVaults,
  getProfileCookieGuardStatus,
  restoreProfileCookiesManual,
  writeBackVaultCookiesToProfileDisk,
  batchWriteBackAllVaultCookiesToProfilesDisk,
  harvestDiskSqliteToEcosystemVaults,
};
