"use strict";

/**
 * Dual-Lane Shadow Profile Isolation (User Headed Primary Lane + Agent Headless Shadow Lane).
 *
 * Allows an Agent to run any profile in `--headless` mode inside an isolated shadow directory
 * (`%TEMP%/p0003-agent-shadow/<profileId>`) while the User simultaneously opens and uses the
 * exact same profile in normal Headed mode on the primary directory (`D:/StealthBrowser/profiles/<profileId>`),
 * with zero SingletonLock collision, zero window/tab hijacking, and automatic bi-directional cookie sync.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SHADOW_META_FILE = ".shadow-meta.json";
const DEFAULT_ORPHAN_MAX_IDLE_MS = 2 * 60 * 60 * 1000; // 2 hours

const LOCK_FILE_NAMES = new Set([
  "SingletonLock",
  "SingletonSocket",
  "SingletonCookie",
  "lockfile",
  "LOCK",
]);

function getFreeDiskBytes(dirPath) {
  try {
    const target = fs.existsSync(dirPath) ? dirPath : path.parse(path.resolve(dirPath)).root;
    if (typeof fs.statfsSync === "function") {
      const st = fs.statfsSync(target);
      return Number(st.bavail || st.bfree || 0) * Number(st.bsize || 4096);
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/**
 * Resolves the primary NVMe scratch pool root for Agent Shadow profiles (`ok 3`).
 * Prefers `STEALTH_AGENT_SHADOW_ROOT` if configured, otherwise selects `os.tmpdir()/p0003-agent-shadow`
 * on the primary NVMe (`C:`) when it has >= 10 GB free, or falls back to `D:/StealthBrowser/.agent-shadow`.
 */
function resolveShadowRootDir() {
  const envRoot = String(process.env.STEALTH_AGENT_SHADOW_ROOT || "").trim();
  if (envRoot) return path.resolve(envRoot);
  const tmpCandidate = path.join(os.tmpdir(), "p0003-agent-shadow");
  const dCandidate = "D:\\StealthBrowser\\.agent-shadow";
  const tmpFree = getFreeDiskBytes(os.tmpdir());
  if (tmpFree === 0 || tmpFree >= 10 * 1024 * 1024 * 1024) {
    return tmpCandidate;
  }
  const dFree = getFreeDiskBytes("D:\\");
  return dFree > tmpFree ? dCandidate : tmpCandidate;
}

const SHADOW_ROOT_DIR = resolveShadowRootDir();

function getCandidateShadowRoots() {
  const roots = new Set([
    path.resolve(SHADOW_ROOT_DIR),
    path.resolve(path.join(os.tmpdir(), "p0003-agent-shadow")),
    path.resolve("D:\\StealthBrowser\\.agent-shadow"),
  ]);
  const envRoot = String(process.env.STEALTH_AGENT_SHADOW_ROOT || "").trim();
  if (envRoot) roots.add(path.resolve(envRoot));
  return [...roots];
}

function resolveAgentShadowUserDataDir(profileId) {
  const safeId = String(profileId || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safeId) throw new Error("resolveAgentShadowUserDataDir: profileId is required");
  return path.join(resolveShadowRootDir(), safeId);
}

function isAgentShadowUserDataDir(userDataDir) {
  if (!userDataDir) return false;
  const norm = path.resolve(String(userDataDir)).toLowerCase();
  for (const root of getCandidateShadowRoots()) {
    const rootNorm = root.toLowerCase();
    if (norm.startsWith(rootNorm + path.sep)) return true;
  }
  return false;
}

/**
 * Fast (<0.1ms) check whether an Agent Shadow session is currently active on disk for `profileId`
 * (including when launched by the standalone `:6004` Agent Worker daemon).
 */
function hasLiveAgentShadowOnDisk(profileId) {
  try {
    const shadowDir = resolveAgentShadowUserDataDir(profileId);
    if (!fs.existsSync(shadowDir)) return false;
    for (const lockName of ["lockfile", "SingletonLock"]) {
      const lockPath = path.join(shadowDir, lockName);
      if (fs.existsSync(lockPath)) {
        const ageMs = Date.now() - (fs.statSync(lockPath).mtimeMs || 0);
        if (ageMs >= 0 && ageMs < DEFAULT_ORPHAN_MAX_IDLE_MS) return true;
      }
    }
    const metaPath = path.join(shadowDir, SHADOW_META_FILE);
    if (fs.existsSync(metaPath)) {
      const ageMs = Date.now() - (fs.statSync(metaPath).mtimeMs || 0);
      if (ageMs >= 0 && ageMs < 15_000) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function safeCopyFile(src, dest) {
  try {
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.copyFileSync(src, dest);
      return true;
    } catch {
      const buf = fs.readFileSync(src);
      fs.writeFileSync(dest, buf);
      return true;
    }
  } catch {
    return false;
  }
}

function safeCopyDirShallow(srcDir, destDir, { maxFileBytes = 16 * 1024 * 1024 } = {}) {
  try {
    if (!fs.existsSync(srcDir)) return 0;
    fs.mkdirSync(destDir, { recursive: true });
    let copied = 0;
    for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (LOCK_FILE_NAMES.has(ent.name) || ent.name.endsWith(".tmp")) continue;
      const srcPath = path.join(srcDir, ent.name);
      const destPath = path.join(destDir, ent.name);
      if (ent.isFile()) {
        try {
          const st = fs.statSync(srcPath);
          if (st.size <= maxFileBytes && safeCopyFile(srcPath, destPath)) {
            copied += 1;
          }
        } catch {
          /* ignore locked/transient file */
        }
      }
    }
    return copied;
  } catch {
    return 0;
  }
}

/**
 * Atomically syncs a LevelDB directory (`Default/Local Storage/leveldb` or `Default/IndexedDB/<origin>.indexeddb.leveldb`)
 * from `srcDir` to `destDir` when `srcDir` has valid LevelDB state (`CURRENT`, `.log`, or `.ldb`).
 * Purges stale `.ldb`/`.log`/`MANIFEST-*` files in `destDir` that do not exist in `srcDir` so `CURRENT` and `MANIFEST-*`
 * stay 100% consistent on next Chromium launch.
 */
function syncLevelDbDirAtomic(srcDir, destDir, { maxFileBytes = 16 * 1024 * 1024 } = {}) {
  try {
    if (!fs.existsSync(srcDir)) return 0;
    const srcEntries = fs.readdirSync(srcDir, { withFileTypes: true });
    const validFiles = srcEntries.filter(
      (ent) =>
        ent.isFile() &&
        !LOCK_FILE_NAMES.has(ent.name) &&
        !ent.name.endsWith(".tmp") &&
        (ent.name === "CURRENT" ||
          ent.name.startsWith("MANIFEST-") ||
          /\.(log|ldb|sst|blob)$/i.test(ent.name)),
    );
    if (validFiles.length === 0) return 0;

    fs.mkdirSync(destDir, { recursive: true });
    const srcFileNames = new Set(
      srcEntries
        .filter((ent) => ent.isFile() && !LOCK_FILE_NAMES.has(ent.name) && !ent.name.endsWith(".tmp"))
        .map((ent) => ent.name),
    );

    let copied = 0;
    for (const ent of srcEntries) {
      if (!ent.isFile() || LOCK_FILE_NAMES.has(ent.name) || ent.name.endsWith(".tmp")) continue;
      const srcPath = path.join(srcDir, ent.name);
      const destPath = path.join(destDir, ent.name);
      try {
        const st = fs.statSync(srcPath);
        if (st.size <= maxFileBytes && safeCopyFile(srcPath, destPath)) {
          copied += 1;
        }
      } catch {
        /* ignore locked/transient file */
      }
    }

    if (copied > 0) {
      for (const destEnt of fs.readdirSync(destDir, { withFileTypes: true })) {
        if (!destEnt.isFile() || LOCK_FILE_NAMES.has(destEnt.name)) continue;
        if (!srcFileNames.has(destEnt.name)) {
          try {
            fs.unlinkSync(path.join(destDir, destEnt.name));
          } catch {
            /* ignore */
          }
        }
      }
    }
    return copied;
  } catch {
    return 0;
  }
}

/**
 * Seeds `%TEMP%/p0003-agent-shadow/<profileId>` from the primary profile directory
 * (`Local State`, `Default/Preferences`, `Default/Network/Cookies`, `Default/Local Storage/leveldb`,
 * and small auth `Default/IndexedDB` folders) without acquiring any lock on `primaryUserDataDir`.
 */
function seedAgentShadowFromPrimary(primaryUserDataDir, profileId) {
  const shadowDir = resolveAgentShadowUserDataDir(profileId);
  try {
    fs.mkdirSync(path.join(shadowDir, "Default", "Network"), { recursive: true });
    // Clear any stale lock files in shadowDir before launching
    for (const lockName of ["SingletonLock", "SingletonSocket", "SingletonCookie", "lockfile"]) {
      try {
        fs.unlinkSync(path.join(shadowDir, lockName));
      } catch {
        /* ignore */
      }
    }
    const now = Date.now();
    try {
      fs.writeFileSync(
        path.join(shadowDir, SHADOW_META_FILE),
        JSON.stringify({
          profileId: String(profileId || ""),
          primaryUserDataDir: primaryUserDataDir ? String(primaryUserDataDir) : "",
          seededAt: now,
          updatedAt: now,
          pid: process.pid,
        }),
        "utf8",
      );
    } catch {
      /* ignore */
    }
    if (!primaryUserDataDir || !fs.existsSync(primaryUserDataDir)) {
      return shadowDir;
    }

    // 1. Copy Local State & Preferences
    for (const rel of [
      "Local State",
      "Local State.last-good.bak",
      path.join("Default", "Preferences"),
      path.join("Default", "Secure Preferences"),
    ]) {
      safeCopyFile(path.join(primaryUserDataDir, rel), path.join(shadowDir, rel));
    }

    // 2. Copy SQLite Cookies & guard backups (fall back to Cookies.last-good.bak if primary Cookies is locked by User Headed Chrome)
    const primaryCookiesPath = path.join(primaryUserDataDir, "Default", "Network", "Cookies");
    const shadowCookiesPath = path.join(shadowDir, "Default", "Network", "Cookies");
    const cookiesCopied = safeCopyFile(primaryCookiesPath, shadowCookiesPath);
    if (!cookiesCopied) {
      safeCopyFile(
        path.join(primaryUserDataDir, "Default", "Network", "Cookies.last-good.bak"),
        shadowCookiesPath,
      );
    }
    for (const rel of [
      path.join("Default", "Network", "Cookies-journal"),
      path.join("Default", "Network", "Cookies.last-good.bak"),
      path.join("Default", "Network", "Cookies.guard-meta.json"),
      path.join("Default", "Network", "Cookies.vault-hydrated.json"),
    ]) {
      safeCopyFile(path.join(primaryUserDataDir, rel), path.join(shadowDir, rel));
    }

    // 3. Copy Local Storage leveldb (for SPA auth tokens: ElevenLabs, HeyGen, Adobe, Telegram, etc.)
    syncLevelDbDirAtomic(
      path.join(primaryUserDataDir, "Default", "Local Storage", "leveldb"),
      path.join(shadowDir, "Default", "Local Storage", "leveldb"),
    );

    // 4. Copy small IndexedDB auth folders (Firebase / Clerk / Supabase SPA sessions)
    const idbRoot = path.join(primaryUserDataDir, "Default", "IndexedDB");
    if (fs.existsSync(idbRoot)) {
      for (const ent of fs.readdirSync(idbRoot, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        if (!/(leveldb|blob)$/i.test(ent.name)) continue;
        syncLevelDbDirAtomic(
          path.join(idbRoot, ent.name),
          path.join(shadowDir, "Default", "IndexedDB", ent.name),
          { maxFileBytes: 8 * 1024 * 1024 },
        );
      }
    }
  } catch {
    /* best-effort seed */
  }
  return shadowDir;
}

/**
 * Syncs newly acquired cookies, Local Storage, and IndexedDB from the closing Agent Shadow directory
 * back into the Primary profile directory (when the User does not currently hold a lock on Primary),
 * and optionally removes the disposable shadow directory to keep `%TEMP%` clean.
 */
function syncAgentShadowBackToPrimary(
  shadowUserDataDir,
  primaryUserDataDir,
  { primaryLocked = false, cleanupShadow = true } = {},
) {
  let syncedDisk = false;
  try {
    // Zero-Interference Native Cookie + SPA Storage Persistence:
    // 1. SQLite Cookies & Local State are guarded so stale/reduced shadow cookies never overwrite primaryCookies.
    // 2. SPA auth storage (`Default/Local Storage/leveldb` and `Default/IndexedDB/*(leveldb|blob)` used by
    //    Firebase Auth / ElevenLabs / Clerk / Supabase) is synced back whenever `!primaryLocked`, independent
    //    of whether SQLite `Cookies` row count changed.
    if (
      shadowUserDataDir &&
      primaryUserDataDir &&
      !primaryLocked &&
      fs.existsSync(shadowUserDataDir)
    ) {
      const shadowCookies = path.join(shadowUserDataDir, "Default", "Network", "Cookies");
      const primaryCookies = path.join(primaryUserDataDir, "Default", "Network", "Cookies");
      const { inspectProfileSqliteCookiesSummary } = require("./profile-cookie-guard.cjs");
      const primaryStatSize = fs.existsSync(primaryCookies) ? fs.statSync(primaryCookies).size : 0;
      const primarySummary = inspectProfileSqliteCookiesSummary(primaryUserDataDir);
      const primaryHasRows = Boolean(
        primaryStatSize >= 12288 &&
          primarySummary.exists &&
          (!primarySummary.readable || primarySummary.totalRows > 0 || primarySummary.byteSize > 28672),
      );
      if (fs.existsSync(shadowCookies)) {
        const shadowStat = fs.statSync(shadowCookies);
        const shadowSummary = inspectProfileSqliteCookiesSummary(shadowUserDataDir);
        const shadowValid =
          (shadowSummary.exists && shadowSummary.readable && shadowSummary.totalRows > 0) ||
          (!shadowSummary.readable && shadowStat.size >= 12288);
        const shadowDidNotLoseAuth =
          !primarySummary.readable ||
          (shadowSummary.readable &&
            (!primarySummary.hasGoogleAuth || shadowSummary.hasGoogleAuth) &&
            (!primarySummary.hasOutlookAuth || shadowSummary.hasOutlookAuth) &&
            (!primarySummary.hasFacebookAuth || shadowSummary.hasFacebookAuth) &&
            (!primarySummary.hasTikTokAuth || shadowSummary.hasTikTokAuth));
        const shadowGainedOrUpdated =
          shadowDidNotLoseAuth &&
          shadowSummary.readable &&
          (shadowSummary.authDomainsCount > (primarySummary.authDomainsCount || 0) ||
            shadowSummary.hasGoogleAuth ||
            shadowSummary.hasOutlookAuth ||
            shadowSummary.hasFacebookAuth ||
            shadowSummary.hasTikTokAuth ||
            shadowSummary.totalRows >= Math.floor((primarySummary.totalRows || 0) * 0.7));
        if (shadowValid && (!primaryHasRows || shadowGainedOrUpdated)) {
          safeCopyFile(
            path.join(shadowUserDataDir, "Local State"),
            path.join(primaryUserDataDir, "Local State"),
          );
          safeCopyFile(shadowCookies, primaryCookies);
          safeCopyFile(
            shadowCookies,
            path.join(primaryUserDataDir, "Default", "Network", "Cookies.last-good.bak"),
          );
          syncedDisk = true;
        }
      }

      // Always sync back Local Storage leveldb & IndexedDB auth folders when Primary is unlocked
      const lsCopied = syncLevelDbDirAtomic(
        path.join(shadowUserDataDir, "Default", "Local Storage", "leveldb"),
        path.join(primaryUserDataDir, "Default", "Local Storage", "leveldb"),
      );
      if (lsCopied > 0) syncedDisk = true;

      const shadowIdbRoot = path.join(shadowUserDataDir, "Default", "IndexedDB");
      if (fs.existsSync(shadowIdbRoot)) {
        for (const ent of fs.readdirSync(shadowIdbRoot, { withFileTypes: true })) {
          if (!ent.isDirectory()) continue;
          if (!/(leveldb|blob)$/i.test(ent.name)) continue;
          const idbCopied = syncLevelDbDirAtomic(
            path.join(shadowIdbRoot, ent.name),
            path.join(primaryUserDataDir, "Default", "IndexedDB", ent.name),
            { maxFileBytes: 8 * 1024 * 1024 },
          );
          if (idbCopied > 0) syncedDisk = true;
        }
      }
    }
  } catch {
    /* ignore locked file if user opened primary mid-close */
  }

  if (cleanupShadow && shadowUserDataDir && isAgentShadowUserDataDir(shadowUserDataDir)) {
    try {
      fs.rmSync(shadowUserDataDir, { recursive: true, force: true });
    } catch {
      setTimeout(() => {
        try {
          fs.rmSync(shadowUserDataDir, { recursive: true, force: true });
        } catch {
          /* ignore if still releasing handle */
        }
      }, 1200).unref?.();
    }
  }

  return { syncedDisk };
}

function getShadowDirLastActivityMs(shadowDir) {
  let latest = 0;
  const candidates = [
    shadowDir,
    path.join(shadowDir, SHADOW_META_FILE),
    path.join(shadowDir, "lockfile"),
    path.join(shadowDir, "SingletonLock"),
    path.join(shadowDir, "Default", "Network", "Cookies"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const mtime = fs.statSync(p).mtimeMs || 0;
        if (mtime > latest) latest = mtime;
      }
    } catch {
      /* ignore */
    }
  }
  return latest;
}

/**
 * Sweeps orphaned Agent Shadow directories (`> maxIdleMs`, default 2 hours) across all NVMe scratch pool roots (`ok 3`).
 * Syncs back any newer healthy `Cookies` to `primaryUserDataDir` (when unlocked) before removing the orphan folder.
 */
function sweepOrphanAgentShadows({
  maxIdleMs = DEFAULT_ORPHAN_MAX_IDLE_MS,
  activeProfileIds = new Set(),
  activeShadowDirs = new Set(),
  now = Date.now(),
} = {}) {
  const roots = getCandidateShadowRoots();
  let scanned = 0;
  let swept = 0;
  let syncedBack = 0;

  const normActiveDirs = new Set(
    [...activeShadowDirs].map((d) => path.resolve(String(d)).toLowerCase()),
  );

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      scanned += 1;
      const shadowDir = path.join(root, ent.name);
      if (activeProfileIds.has(ent.name)) continue;
      if (normActiveDirs.has(path.resolve(shadowDir).toLowerCase())) continue;

      const lastActiveMs = getShadowDirLastActivityMs(shadowDir);
      if (lastActiveMs > 0 && now - lastActiveMs < maxIdleMs) continue;

      let primaryUserDataDir = "";
      try {
        const metaPath = path.join(shadowDir, SHADOW_META_FILE);
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          primaryUserDataDir = String(meta?.primaryUserDataDir || "");
        }
      } catch {
        /* ignore */
      }

      if (primaryUserDataDir && fs.existsSync(primaryUserDataDir)) {
        const primaryLocked = ["SingletonLock", "lockfile"].some((lk) =>
          fs.existsSync(path.join(primaryUserDataDir, lk)),
        );
        const res = syncAgentShadowBackToPrimary(shadowDir, primaryUserDataDir, {
          primaryLocked,
          cleanupShadow: false,
        });
        if (res.syncedDisk) syncedBack += 1;
      }

      try {
        fs.rmSync(shadowDir, { recursive: true, force: true });
        if (!fs.existsSync(shadowDir)) swept += 1;
      } catch {
        /* ignore locked handle */
      }
    }
  }

  return { scanned, swept, syncedBack, roots };
}

module.exports = {
  SHADOW_ROOT_DIR,
  DEFAULT_ORPHAN_MAX_IDLE_MS,
  resolveShadowRootDir,
  getCandidateShadowRoots,
  resolveAgentShadowUserDataDir,
  isAgentShadowUserDataDir,
  hasLiveAgentShadowOnDisk,
  syncLevelDbDirAtomic,
  seedAgentShadowFromPrimary,
  syncAgentShadowBackToPrimary,
  sweepOrphanAgentShadows,
};
