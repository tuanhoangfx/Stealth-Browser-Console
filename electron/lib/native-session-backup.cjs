"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const COLD_SLOT_ZPACK_FILE = "cold-slot.zpack";

const COOKIES_REL_PATH = path.join("Default", "Network", "Cookies");
const COOKIES_BAK_REL_PATH = path.join("Default", "Network", "Cookies.last-good.bak");
const LOCAL_STATE_REL_PATH = "Local State";
const LOCAL_STATE_BAK_REL_PATH = "Local State.last-good.bak";
const LOCAL_STORAGE_REL_PATH = path.join("Default", "Local Storage", "leveldb");
const LOCAL_STORAGE_BAK_REL_PATH = path.join("Default", "Local Storage", "leveldb.last-good.bak");

// Deterministic 32-byte key used strictly to wrap the 32-byte Chromium Master Key inside manifest.json
// so backups can be restored across Windows reinstalls / new machines by re-wrapping Local State via DPAPI
// without ever modifying a single byte inside Default/Network/Cookies.
const PORTABLE_BUNDLE_KEY = crypto
  .createHash("sha256")
  .update(String(process.env.STEALTH_BUNDLE_MASTER_SECRET || "p0003-native-session-bundle-ssot-v1"))
  .digest();

function wrapMasterKeyPortable(masterKeyBuf) {
  if (!Buffer.isBuffer(masterKeyBuf) || masterKeyBuf.length !== 32) return "";
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", PORTABLE_BUNDLE_KEY, iv);
    const enc = Buffer.concat([cipher.update(masterKeyBuf), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
  } catch {
    return "";
  }
}

function unwrapMasterKeyPortable(wrappedB64) {
  if (!wrappedB64 || typeof wrappedB64 !== "string") return null;
  try {
    const raw = Buffer.from(wrappedB64, "base64");
    if (raw.length !== 12 + 16 + 32) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", PORTABLE_BUNDLE_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
  } catch {
    return null;
  }
}

function protectDpapiKeyNative(masterKeyBuf) {
  if (process.platform !== "win32" || !Buffer.isBuffer(masterKeyBuf) || masterKeyBuf.length !== 32) return "";
  try {
    const { protectDpapiKey } = require("./profile-cookie-guard.cjs");
    return protectDpapiKey(masterKeyBuf);
  } catch {
    return "";
  }
}

function isProfileDirectoryLocked(userDataDir) {
  if (!userDataDir || !fs.existsSync(userDataDir)) return false;
  for (const lockName of ["lockfile", "SingletonLock"]) {
    const lp = path.join(userDataDir, lockName);
    if (!fs.existsSync(lp)) continue;
    try {
      const fd = fs.openSync(lp, "r+");
      fs.closeSync(fd);
    } catch (err) {
      if (err && (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES")) {
        return true;
      }
    }
  }
  const ckPath = path.join(userDataDir, COOKIES_REL_PATH);
  if (fs.existsSync(ckPath)) {
    try {
      const fd = fs.openSync(ckPath, "r");
      fs.closeSync(fd);
    } catch (err) {
      if (err && (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES")) {
        return true;
      }
    }
  }
  return false;
}

function resolveProfileBackupRoot(userDataDir) {
  if (!userDataDir) return "";
  const folderName = path.basename(userDataDir);
  const parentDir = path.dirname(userDataDir);
  // If under <root>/profiles/<id>, store backups at <root>/backups/<id>
  if (path.basename(parentDir).toLowerCase() === "profiles") {
    return path.join(path.dirname(parentDir), "backups", folderName);
  }
  return path.join(parentDir, ".session-backups", folderName);
}

function sha256File(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return "";
  }
}

function inspectLevelDbDir(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return { exists: false, dataBytes: 0, fileCount: 0 };
  try {
    let dataBytes = 0;
    let fileCount = 0;
    for (const name of fs.readdirSync(dirPath)) {
      if (name === "LOCK" || name.endsWith(".tmp")) continue;
      if (/\.(ldb|log)$/i.test(name) || name === "CURRENT" || name.startsWith("MANIFEST-")) {
        const st = fs.statSync(path.join(dirPath, name));
        if (st.isFile()) {
          dataBytes += st.size;
          fileCount += 1;
        }
      }
    }
    return { exists: fileCount > 0 && dataBytes > 0, dataBytes, fileCount };
  } catch {
    return { exists: false, dataBytes: 0, fileCount: 0 };
  }
}

function copyLevelDbDirClean(srcDir, dstDir) {
  const info = inspectLevelDbDir(srcDir);
  if (!info.exists) return { copied: false, dataBytes: 0, fileCount: 0 };
  try {
    fs.mkdirSync(dstDir, { recursive: true });
    for (const old of fs.readdirSync(dstDir)) {
      if (old === "LOCK") continue;
      try {
        fs.unlinkSync(path.join(dstDir, old));
      } catch {
        /* ignore */
      }
    }
    let copiedBytes = 0;
    let copiedFiles = 0;
    for (const name of fs.readdirSync(srcDir)) {
      if (name === "LOCK" || name.endsWith(".tmp")) continue;
      if (/\.(ldb|log)$/i.test(name) || name === "CURRENT" || name.startsWith("MANIFEST-")) {
        const srcFile = path.join(srcDir, name);
        const st = fs.statSync(srcFile);
        if (st.isFile()) {
          fs.copyFileSync(srcFile, path.join(dstDir, name));
          copiedBytes += st.size;
          copiedFiles += 1;
        }
      }
    }
    return { copied: copiedFiles > 0, dataBytes: copiedBytes, fileCount: copiedFiles };
  } catch {
    return { copied: false, dataBytes: 0, fileCount: 0 };
  }
}

function copySqliteOrDataFileClean(srcFile, dstFile, { isSqlite = false } = {}) {
  if (!srcFile || !fs.existsSync(srcFile)) return { copied: false, bytes: 0 };
  try {
    const st = fs.statSync(srcFile);
    if (!st.isFile() || st.size <= 0) return { copied: false, bytes: 0 };
    fs.mkdirSync(path.dirname(dstFile), { recursive: true });
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      const dstSide = `${dstFile}${suffix}`;
      if (fs.existsSync(dstSide)) {
        try {
          fs.unlinkSync(dstSide);
        } catch {
          /* ignore */
        }
      }
    }
    fs.copyFileSync(srcFile, dstFile);
    let copiedSidecar = false;
    for (const suffix of ["-wal", "-journal"]) {
      const sideSrc = `${srcFile}${suffix}`;
      if (fs.existsSync(sideSrc)) {
        try {
          fs.copyFileSync(sideSrc, `${dstFile}${suffix}`);
          copiedSidecar = true;
        } catch {
          /* ignore */
        }
      }
    }
    if (isSqlite && copiedSidecar) {
      try {
        const db = openSqliteSync(dstFile, { readOnly: false });
        db.prepare("SELECT 1 FROM sqlite_master LIMIT 1").get();
        try {
          db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        } catch {
          /* ignore if rollback journal mode */
        }
        db.close();
      } catch {
        /* ignore */
      }
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        try {
          if (fs.existsSync(`${dstFile}${suffix}`)) fs.unlinkSync(`${dstFile}${suffix}`);
        } catch {
          /* ignore */
        }
      }
    }
    return { copied: true, bytes: fs.statSync(dstFile).size };
  } catch {
    return { copied: false, bytes: 0 };
  }
}

function copyTreeCleanNoLocks(srcDir, dstDir) {
  if (!srcDir || !fs.existsSync(srcDir)) return { copied: false, bytes: 0, files: 0 };
  let totalBytes = 0;
  let totalFiles = 0;
  function walkCopy(sDir, dDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(sDir, { withFileTypes: true });
    } catch {
      return;
    }
    fs.mkdirSync(dDir, { recursive: true });
    for (const ent of entries) {
      if (ent.name === "LOCK" || ent.name.endsWith(".tmp")) continue;
      const sPath = path.join(sDir, ent.name);
      const dPath = path.join(dDir, ent.name);
      if (ent.isDirectory()) {
        walkCopy(sPath, dPath);
      } else if (ent.isFile()) {
        try {
          const st = fs.statSync(sPath);
          fs.copyFileSync(sPath, dPath);
          totalBytes += st.size;
          totalFiles += 1;
        } catch {
          /* ignore locked/ephemeral file */
        }
      }
    }
  }
  try {
    if (fs.existsSync(dstDir)) {
      fs.rmSync(dstDir, { recursive: true, force: true });
    }
    walkCopy(srcDir, dstDir);
    return { copied: totalFiles > 0, bytes: totalBytes, files: totalFiles };
  } catch {
    return { copied: false, bytes: 0, files: 0 };
  }
}

const DEFAULT_USER_STATE_FILES = [
  { rel: "History", isSqlite: true },
  { rel: "Bookmarks", isSqlite: false },
  { rel: "Bookmarks.bak", isSqlite: false },
  { rel: "Favicons", isSqlite: true },
  { rel: "Top Sites", isSqlite: true },
  { rel: "Shortcuts", isSqlite: true },
  { rel: "Preferences", isSqlite: false },
  { rel: "Login Data", isSqlite: true },
  { rel: "Login Data For Account", isSqlite: true },
  { rel: "Web Data", isSqlite: true },
  { rel: "Account Web Data", isSqlite: true },
  { rel: "Extension Cookies", isSqlite: true },
  { rel: "DIPS", isSqlite: true },
  { rel: "SharedStorage", isSqlite: true },
  { rel: path.join("Network", "Network Persistent State"), isSqlite: false },
  { rel: path.join("Network", "TransportSecurity"), isSqlite: false },
  { rel: path.join("Network", "Trust Tokens"), isSqlite: true },
];

const DEFAULT_USER_STATE_DIRS = [
  "Session Storage",
  "Sessions",
  "IndexedDB",
  "WebStorage",
  "Extension State",
  "Local Extension Settings",
  "Sync Data",
];

function openSqliteSync(dbPath, { readOnly = false } = {}) {
  const { openGuardSqlite } = require("./profile-cookie-guard.cjs");
  return openGuardSqlite(dbPath, { readOnly, busyTimeoutMs: 3000 });
}

const fastHistorySummaryCache = new Map();
const FAST_HISTORY_CACHE_MAX = 6000;

function inspectHistorySqliteCached(histPath) {
  if (!histPath || !fs.existsSync(histPath)) {
    return { urlsCount: 0, visitsCount: 0, bytes: 0 };
  }
  try {
    const st = fs.statSync(histPath);
    if (!st.isFile() || st.size <= 0) return { urlsCount: 0, visitsCount: 0, bytes: 0 };
    const key = `${histPath}:${st.size}:${Math.floor(st.mtimeMs)}`;
    const hit = fastHistorySummaryCache.get(key);
    if (hit) return hit;

    let db = null;
    try {
      db = openSqliteSync(histPath, { readOnly: true });
      const row = db
        .prepare("SELECT COUNT(*) AS u, COALESCE(SUM(visit_count), 0) AS v FROM urls")
        .get();
      const res = {
        urlsCount: Number(row?.u || 0),
        visitsCount: Number(row?.v || 0),
        bytes: st.size,
      };
      fastHistorySummaryCache.set(key, res);
      if (fastHistorySummaryCache.size > FAST_HISTORY_CACHE_MAX) {
        const first = fastHistorySummaryCache.keys().next().value;
        if (first) fastHistorySummaryCache.delete(first);
      }
      return res;
    } finally {
      try {
        db?.close();
      } catch {
        /* ignore */
      }
    }
  } catch {
    return { urlsCount: 0, visitsCount: 0, bytes: 0 };
  }
}

const SMART_IDB_MAX_ORIGIN_BYTES = 4 * 1024 * 1024; // 4 MB max per IndexedDB origin
const SMART_IDB_SKIP_PATTERNS = [
  /\.indexeddb\.blob$/i,
  /^https?_127\.0\.0\.1_/i,
  /^https?_localhost_/i,
  /databox\.infi\.io\.vn/i,
  /crm\.infi\.io\.vn/i,
  /mail\.google\.com/i,
  /drive\.google\.com/i,
  /docs\.google\.com/i,
  /capcut\.com/i,
  /muse\.ai/i,
];

function shouldSkipIndexedDbOriginDir(dirName) {
  const name = String(dirName || "").trim();
  if (!name) return true;
  return SMART_IDB_SKIP_PATTERNS.some((rx) => rx.test(name));
}

function computeDirectoryBytesBounded(dirPath, maxBytes = SMART_IDB_MAX_ORIGIN_BYTES + 1) {
  let total = 0;
  function walk(curr) {
    if (total > maxBytes) return;
    let entries = [];
    try {
      entries = fs.readdirSync(curr, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name === "LOCK" || ent.name.endsWith(".tmp")) continue;
      const full = path.join(curr, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        try {
          total += fs.statSync(full).size;
          if (total > maxBytes) return;
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(dirPath);
  return total;
}

function copyIndexedDbSmartTrim(srcIdbDir, dstIdbDir) {
  if (!srcIdbDir || !fs.existsSync(srcIdbDir)) {
    return { copied: false, bytes: 0, files: 0, skippedDirs: 0, skippedBytes: 0 };
  }
  let entries = [];
  try {
    entries = fs.readdirSync(srcIdbDir, { withFileTypes: true });
  } catch {
    return { copied: false, bytes: 0, files: 0, skippedDirs: 0, skippedBytes: 0 };
  }
  if (fs.existsSync(dstIdbDir)) {
    try {
      fs.rmSync(dstIdbDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  let totalBytes = 0;
  let totalFiles = 0;
  let skippedDirs = 0;

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (shouldSkipIndexedDbOriginDir(ent.name)) {
      skippedDirs += 1;
      continue;
    }
    const srcOriginDir = path.join(srcIdbDir, ent.name);
    const originBytes = computeDirectoryBytesBounded(srcOriginDir, SMART_IDB_MAX_ORIGIN_BYTES);
    if (originBytes <= 0 || originBytes > SMART_IDB_MAX_ORIGIN_BYTES) {
      skippedDirs += 1;
      continue;
    }
    const dstOriginDir = path.join(dstIdbDir, ent.name);
    const res = copyTreeCleanNoLocks(srcOriginDir, dstOriginDir);
    if (res.copied) {
      totalBytes += res.bytes;
      totalFiles += res.files;
    }
  }
  return {
    copied: totalFiles > 0,
    bytes: totalBytes,
    files: totalFiles,
    skippedDirs,
  };
}

function snapshotDefaultUserState(userDataDir, dstStateRoot) {
  const defaultDir = path.join(userDataDir, "Default");
  if (!fs.existsSync(defaultDir)) {
    return {
      hasHistoryBackup: false,
      historyBytes: 0,
      historyUrlsCount: 0,
      historyVisitsCount: 0,
      stateFilesCount: 0,
      stateBytes: 0,
    };
  }
  let hasHistoryBackup = false;
  let historyBytes = 0;
  let historyUrlsCount = 0;
  let historyVisitsCount = 0;
  let stateFilesCount = 0;
  let stateBytes = 0;

  for (const item of DEFAULT_USER_STATE_FILES) {
    const srcFile = path.join(defaultDir, item.rel);
    const dstFile = path.join(dstStateRoot, item.rel);
    const res = copySqliteOrDataFileClean(srcFile, dstFile, { isSqlite: item.isSqlite });
    if (res.copied) {
      stateFilesCount += 1;
      stateBytes += res.bytes;
      if (item.rel === "History") {
        hasHistoryBackup = true;
        historyBytes = res.bytes;
        const hInfo = inspectHistorySqliteCached(dstFile);
        historyUrlsCount = hInfo.urlsCount;
        historyVisitsCount = hInfo.visitsCount;
      }
    }
  }

  for (const relDir of DEFAULT_USER_STATE_DIRS) {
    const srcSub = path.join(defaultDir, relDir);
    const dstSub = path.join(dstStateRoot, relDir);
    const res =
      relDir === "IndexedDB"
        ? copyIndexedDbSmartTrim(srcSub, dstSub)
        : copyTreeCleanNoLocks(srcSub, dstSub);
    if (res.copied) {
      stateFilesCount += res.files;
      stateBytes += res.bytes;
    }
  }

  return {
    hasHistoryBackup,
    historyBytes,
    historyUrlsCount,
    historyVisitsCount,
    stateFilesCount,
    stateBytes,
  };
}

function restoreDefaultUserState(srcStateRoot, targetUserDataDir) {
  if (!srcStateRoot || !fs.existsSync(srcStateRoot)) {
    return { restored: false, historyRestored: false, stateFilesRestored: 0 };
  }
  const dstDefaultDir = path.join(targetUserDataDir, "Default");
  fs.mkdirSync(dstDefaultDir, { recursive: true });
  let stateFilesRestored = 0;
  let historyRestored = false;

  for (const item of DEFAULT_USER_STATE_FILES) {
    const srcFile = path.join(srcStateRoot, item.rel);
    const dstFile = path.join(dstDefaultDir, item.rel);
    if (!fs.existsSync(srcFile)) continue;
    const res = copySqliteOrDataFileClean(srcFile, dstFile, { isSqlite: false });
    if (res.copied) {
      stateFilesRestored += 1;
      if (item.rel === "History") historyRestored = true;
    }
  }

  for (const relDir of DEFAULT_USER_STATE_DIRS) {
    const srcSub = path.join(srcStateRoot, relDir);
    const dstSub = path.join(dstDefaultDir, relDir);
    if (!fs.existsSync(srcSub)) continue;
    const res = copyTreeCleanNoLocks(srcSub, dstSub);
    if (res.copied) {
      stateFilesRestored += res.files;
    }
  }

  return { restored: stateFilesRestored > 0, historyRestored, stateFilesRestored };
}

function readSlotManifest(slotDir) {
  if (!slotDir) return null;
  const manifestPath = path.join(slotDir, "manifest.json");
  const ckPath = path.join(slotDir, "Cookies");
  const zpackPath = path.join(slotDir, COLD_SLOT_ZPACK_FILE);
  if (!fs.existsSync(manifestPath) || (!fs.existsSync(ckPath) && !fs.existsSync(zpackPath))) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Cold Slot Compression (Proposal 3):
 * Compresses all files in `slot-previous` (except `manifest.json`) into a single deflate-compressed
 * `cold-slot.zpack` archive (~70% smaller on disk), keeping `slot-latest` uncompressed for <0.5s instant restore.
 */
function compressColdBackupSlot(slotDir) {
  if (!slotDir || !fs.existsSync(slotDir)) return { compressed: false, reason: "dir_not_found" };
  const manifestPath = path.join(slotDir, "manifest.json");
  const zpackPath = path.join(slotDir, COLD_SLOT_ZPACK_FILE);
  if (!fs.existsSync(manifestPath)) return { compressed: false, reason: "manifest_not_found" };
  if (fs.existsSync(zpackPath) && !fs.existsSync(path.join(slotDir, "Cookies"))) {
    const st = fs.statSync(zpackPath);
    return { compressed: true, alreadyCompressed: true, compressedBytes: st.size };
  }

  try {
    const files = [];
    const chunks = [];
    let offset = 0;

    function collect(currDir, relPrefix) {
      const entries = fs.readdirSync(currDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!relPrefix && (ent.name === "manifest.json" || ent.name === COLD_SLOT_ZPACK_FILE)) {
          continue;
        }
        const fullPath = path.join(currDir, ent.name);
        const relPath = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          collect(fullPath, relPath);
        } else if (ent.isFile()) {
          const buf = fs.readFileSync(fullPath);
          files.push({ rel: relPath, offset, size: buf.length });
          chunks.push(buf);
          offset += buf.length;
        }
      }
    }

    collect(slotDir, "");
    if (files.length === 0) return { compressed: false, reason: "no_payload_files" };

    const rawConcat = Buffer.concat(chunks, offset);
    const deflatedPayload = zlib.deflateRawSync(rawConcat, { level: 6 });
    const headerBuf = Buffer.from(JSON.stringify({ v: 1, uncompressedBytes: offset, files }), "utf8");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(headerBuf.length, 0);

    const finalArchive = Buffer.concat([lenBuf, headerBuf, deflatedPayload]);
    const tmpZpack = `${zpackPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmpZpack, finalArchive);
    fs.renameSync(tmpZpack, zpackPath);

    // Remove uncompressed files/dirs inside slotDir now that cold-slot.zpack is persisted
    for (const ent of fs.readdirSync(slotDir, { withFileTypes: true })) {
      if (ent.name === "manifest.json" || ent.name === COLD_SLOT_ZPACK_FILE) continue;
      fs.rmSync(path.join(slotDir, ent.name), { recursive: true, force: true });
    }

    const compressedBytes = finalArchive.length;
    const prevM = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const uncompressedBytes = Number(prevM.uncompressedSlotBytes || prevM.slotTotalBytes || offset);
    prevM.compressed = true;
    prevM.uncompressedSlotBytes = uncompressedBytes;
    prevM.compressedBytes = compressedBytes;
    prevM.slotTotalBytes = compressedBytes;
    fs.writeFileSync(manifestPath, JSON.stringify(prevM, null, 2), "utf8");

    return {
      compressed: true,
      uncompressedBytes,
      compressedBytes,
      savedBytes: Math.max(0, uncompressedBytes - compressedBytes),
      filesCount: files.length,
    };
  } catch (err) {
    return { compressed: false, error: err?.message || "compress_failed" };
  }
}

function extractColdBackupSlot(slotDir, destDir) {
  const zpackPath = path.join(slotDir, COLD_SLOT_ZPACK_FILE);
  if (!fs.existsSync(zpackPath)) return { extracted: false, error: "zpack_not_found" };
  try {
    const raw = fs.readFileSync(zpackPath);
    if (raw.length < 8) return { extracted: false, error: "corrupt_zpack" };
    const headerLen = raw.readUInt32BE(0);
    const headerJson = raw.subarray(4, 4 + headerLen).toString("utf8");
    const header = JSON.parse(headerJson);
    const inflated = zlib.inflateRawSync(raw.subarray(4 + headerLen));

    fs.mkdirSync(destDir, { recursive: true });
    for (const f of header.files || []) {
      const targetPath = path.join(destDir, ...String(f.rel || "").split("/"));
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const fileBuf = inflated.subarray(f.offset, f.offset + f.size);
      fs.writeFileSync(targetPath, fileBuf);
    }
    return { extracted: true, filesCount: (header.files || []).length };
  } catch (err) {
    return { extracted: false, error: err?.message || "extract_failed" };
  }
}

/**
 * Creates or rotates an atomic 2-slot native session backup (`slot-latest` & `slot-previous`).
 * Zero SQLite row mutation: copies Chromium's native `Cookies`, `Local State`, and `Local Storage/leveldb` bit-for-bit.
 */
function snapshotProfileNativeSession(
  userDataDir,
  {
    profileCode = "",
    force = false,
    compressSlot = true,
    compressPrev = true,
    inspectSqliteCookiesFile,
    unprotectDpapiKey,
  } = {},
) {
  if (!userDataDir || !fs.existsSync(userDataDir)) {
    return { ok: false, snapshotted: false, reason: "profile_dir_not_found" };
  }
  const locked = isProfileDirectoryLocked(userDataDir);
  const liveCkPath = path.join(userDataDir, COOKIES_REL_PATH);
  const bakCkPath = path.join(userDataDir, COOKIES_BAK_REL_PATH);
  const liveLsPath = path.join(userDataDir, LOCAL_STATE_REL_PATH);
  const bakLsPath = path.join(userDataDir, LOCAL_STATE_BAK_REL_PATH);
  const liveLdbDir = path.join(userDataDir, LOCAL_STORAGE_REL_PATH);
  const bakLdbDir = path.join(userDataDir, LOCAL_STORAGE_BAK_REL_PATH);

  const srcLsPath = fs.existsSync(liveLsPath) ? liveLsPath : fs.existsSync(bakLsPath) ? bakLsPath : "";
  const hasLiveCk = fs.existsSync(liveCkPath) && fs.statSync(liveCkPath).size > 0;
  const hasBakCk = fs.existsSync(bakCkPath) && fs.statSync(bakCkPath).size > 0;

  if (!hasLiveCk && !hasBakCk) {
    return { ok: false, snapshotted: false, reason: locked ? "profile_locked_no_bak" : "cookies_not_found" };
  }

  const backupRoot = resolveProfileBackupRoot(userDataDir);
  const slotLatestDir = path.join(backupRoot, "slot-latest");
  const slotPrevDir = path.join(backupRoot, "slot-previous");
  const tmpSlotDir = path.join(backupRoot, `slot-staging-${process.pid}-${Date.now()}`);

  try {
    fs.mkdirSync(tmpSlotDir, { recursive: true });
    const stagedCkPath = path.join(tmpSlotDir, "Cookies");
    let copiedFromLive = false;
    if (hasLiveCk) {
      try {
        fs.copyFileSync(liveCkPath, stagedCkPath);
        copiedFromLive = true;
        for (const suffix of ["-wal", "-journal"]) {
          const sideSrc = `${liveCkPath}${suffix}`;
          if (fs.existsSync(sideSrc)) {
            try {
              fs.copyFileSync(sideSrc, `${stagedCkPath}${suffix}`);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        copiedFromLive = false;
      }
    }
    if (!copiedFromLive && hasBakCk) {
      fs.copyFileSync(bakCkPath, stagedCkPath);
    }
    if (!fs.existsSync(stagedCkPath)) {
      fs.rmSync(tmpSlotDir, { recursive: true, force: true });
      return { ok: false, snapshotted: false, reason: "cookies_copy_failed" };
    }

    // If -wal sidecar was copied, checkpoint WAL into the staged Cookies file (merges WAL pages only, zero row edits)
    if (fs.existsSync(`${stagedCkPath}-wal`)) {
      try {
        const walDb = openSqliteSync(stagedCkPath, { readOnly: false });
        walDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        walDb.close();
      } catch {
        /* ignore */
      }
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        try {
          if (fs.existsSync(`${stagedCkPath}${suffix}`)) fs.unlinkSync(`${stagedCkPath}${suffix}`);
        } catch {
          /* ignore */
        }
      }
    }

    const ckSize = fs.statSync(stagedCkPath).size;
    const summary =
      typeof inspectSqliteCookiesFile === "function"
        ? inspectSqliteCookiesFile(stagedCkPath, ckSize)
        : { exists: true, readable: ckSize > 0, totalRows: ckSize > 20480 ? 1 : 0, authDomainsCount: 0, byteSize: ckSize };

    if (!summary.readable || summary.totalRows <= 0) {
      fs.rmSync(tmpSlotDir, { recursive: true, force: true });
      return { ok: false, snapshotted: false, reason: "empty_or_unreadable_cookies", current: summary };
    }

    const existingLatest = readSlotManifest(slotLatestDir);
    if (!force && existingLatest) {
      const wipedAllAuthDomains =
        Number(existingLatest.authDomainsCount || 0) > 0 && Number(summary.authDomainsCount || 0) === 0;
      const severeRowDrop =
        Number(existingLatest.totalRows || 0) > 0 &&
        summary.totalRows < Math.floor(Number(existingLatest.totalRows || 0) * 0.4);
      if (wipedAllAuthDomains || severeRowDrop) {
        fs.rmSync(tmpSlotDir, { recursive: true, force: true });
        return {
          ok: false,
          snapshotted: false,
          reason: wipedAllAuthDomains ? "lost_core_auth_domain_compared_to_latest" : "degraded_compared_to_latest",
          current: summary,
          existingLatest,
        };
      }
    }

    const stagedSha256 = sha256File(stagedCkPath);
    let wrappedMasterKeyB64 = "";
    if (srcLsPath && fs.existsSync(srcLsPath)) {
      fs.copyFileSync(srcLsPath, path.join(tmpSlotDir, "Local State"));
      if (typeof unprotectDpapiKey === "function") {
        try {
          const lsObj = JSON.parse(fs.readFileSync(srcLsPath, "utf8"));
          const encKeyB64 = lsObj?.os_crypt?.encrypted_key;
          if (encKeyB64) {
            const masterKey = unprotectDpapiKey(encKeyB64);
            if (Buffer.isBuffer(masterKey) && masterKey.length === 32) {
              wrappedMasterKeyB64 = wrapMasterKeyPortable(masterKey);
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    let ldbCopy = copyLevelDbDirClean(liveLdbDir, path.join(tmpSlotDir, "leveldb"));
    if (!ldbCopy.copied && inspectLevelDbDir(bakLdbDir).exists) {
      ldbCopy = copyLevelDbDirClean(bakLdbDir, path.join(tmpSlotDir, "leveldb"));
    }
    const userStateSnap = snapshotDefaultUserState(userDataDir, path.join(tmpSlotDir, "default-state"));
    const lsSize = srcLsPath && fs.existsSync(srcLsPath) ? fs.statSync(srcLsPath).size : 0;
    const slotTotalBytes = ckSize + lsSize + ldbCopy.dataBytes + userStateSnap.stateBytes;
    const nowIso = new Date().toISOString();
    const backupSequence = Number(existingLatest?.backupSequence || (existingLatest ? 1 : 0)) + 1;
    const manifest = {
      version: 2,
      slot: "latest",
      backupSequence,
      profileCode: String(profileCode || "").trim(),
      createdAt: nowIso,
      sourceUserDataDir: userDataDir,
      seededFromBakWhileLocked: locked && !copiedFromLive,
      cookiesBytes: ckSize,
      cookiesSha256: stagedSha256,
      totalRows: summary.totalRows,
      domainsCount: Number(summary.domainsCount || 0),
      authDomainsCount: summary.authDomainsCount,
      hasGoogleAuth: Boolean(summary.hasGoogleAuth),
      hasOutlookAuth: Boolean(summary.hasOutlookAuth),
      hasFacebookAuth: Boolean(summary.hasFacebookAuth),
      hasTikTokAuth: Boolean(summary.hasTikTokAuth),
      hasLocalStateBackup: Boolean(srcLsPath && fs.existsSync(srcLsPath)),
      localStateBytes: lsSize,
      hasLocalStorageBackup: Boolean(ldbCopy.copied),
      localStorageBackupBytes: ldbCopy.dataBytes,
      localStorageFiles: ldbCopy.fileCount,
      hasHistoryBackup: Boolean(userStateSnap.hasHistoryBackup),
      historyBytes: userStateSnap.historyBytes,
      historyUrlsCount: Number(userStateSnap.historyUrlsCount || 0),
      historyVisitsCount: Number(userStateSnap.historyVisitsCount || 0),
      stateFilesCount: userStateSnap.stateFilesCount,
      stateBytes: userStateSnap.stateBytes,
      slotTotalBytes,
      wrappedMasterKeyB64,
    };
    fs.writeFileSync(path.join(tmpSlotDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    // Rotate slot-latest -> slot-previous if slot-latest exists (always rotate on manual/force backup or when SHA-256 changed)
    let coldCompressionResult = null;
    if (fs.existsSync(slotLatestDir)) {
      const sameContent = existingLatest && existingLatest.cookiesSha256 === stagedSha256;
      if (!sameContent || force) {
        try {
          fs.rmSync(slotPrevDir, { recursive: true, force: true });
          fs.renameSync(slotLatestDir, slotPrevDir);
          const prevManifestPath = path.join(slotPrevDir, "manifest.json");
          if (fs.existsSync(prevManifestPath)) {
            const prevM = JSON.parse(fs.readFileSync(prevManifestPath, "utf8"));
            prevM.slot = "previous";
            prevM.rotatedAt = nowIso;
            fs.writeFileSync(prevManifestPath, JSON.stringify(prevM, null, 2), "utf8");
          }
          if (compressPrev && globalThis.__STEALTH_DISABLE_COLD_COMPRESSION__ !== true) {
            coldCompressionResult = compressColdBackupSlot(slotPrevDir);
          }
        } catch {
          fs.rmSync(slotLatestDir, { recursive: true, force: true });
        }
      } else {
        fs.rmSync(slotLatestDir, { recursive: true, force: true });
      }
    }

    fs.renameSync(tmpSlotDir, slotLatestDir);

    // Keep legacy .last-good.bak files in sync when profile is unlocked
    if (!locked) {
      try {
        fs.copyFileSync(stagedCkPath, bakCkPath);
        if (srcLsPath && fs.existsSync(srcLsPath)) {
          fs.copyFileSync(srcLsPath, bakLsPath);
        }
        if (ldbCopy.copied) {
          copyLevelDbDirClean(path.join(slotLatestDir, "leveldb"), bakLdbDir);
        }
      } catch {
        /* best-effort */
      }
    }

    if (compressSlot) {
      coldCompressionResult = compressColdBackupSlot(slotLatestDir);
    }

    return {
      ok: true,
      snapshotted: true,
      localStorageSnapshotted: ldbCopy.copied,
      historySnapshotted: userStateSnap.hasHistoryBackup,
      slot: "latest",
      manifest,
      coldCompression: coldCompressionResult,
      current: summary,
    };
  } catch (err) {
    try {
      if (fs.existsSync(tmpSlotDir)) fs.rmSync(tmpSlotDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return { ok: false, snapshotted: false, reason: err?.message || "snapshot_failed" };
  }
}

/**
 * Restores a profile's native session bundle (`Cookies` + `Local State` + `Local Storage/leveldb`)
 * from `slot-latest` or `slot-previous` (or from another source profile's backup when cloning/migrating).
 * Zero SQLite row mutation: copies Chromium's native `Cookies` file bit-for-bit and re-wraps `Local State` DPAPI key only if moved to a new Windows machine.
 */
function restoreProfileNativeSession(
  targetUserDataDir,
  {
    profileCode = "",
    slot = "latest",
    sourceUserDataDir = "",
    inspectSqliteCookiesFile,
    unprotectDpapiKey,
  } = {},
) {
  if (!targetUserDataDir) {
    return { ok: false, error: "Target profile directory not found." };
  }
  if (isProfileDirectoryLocked(targetUserDataDir)) {
    return {
      ok: false,
      locked: true,
      error: "Target profile is currently open. Close the profile window before restoring session backup.",
    };
  }

  const effectiveSourceDir = sourceUserDataDir || targetUserDataDir;
  const backupRoot = resolveProfileBackupRoot(effectiveSourceDir);
  const requestedSlotName = slot === "previous" ? "slot-previous" : "slot-latest";
  let slotDir = path.join(backupRoot, requestedSlotName);
  let manifest = readSlotManifest(slotDir);

  // If slot-latest hasn't been created yet in backupRoot, automatically build it from effectiveSourceDir (or its .last-good.bak)
  if (!manifest && requestedSlotName === "slot-latest" && fs.existsSync(effectiveSourceDir)) {
    const seeded = snapshotProfileNativeSession(effectiveSourceDir, {
      profileCode: effectiveSourceDir === targetUserDataDir ? profileCode : "",
      force: true,
      inspectSqliteCookiesFile,
      unprotectDpapiKey,
    });
    if (seeded.ok) {
      manifest = readSlotManifest(slotDir);
    }
  }
  // Fallback to slot-latest if slot-previous was requested but only slot-latest exists
  if (!manifest && requestedSlotName === "slot-previous") {
    const fallbackDir = path.join(backupRoot, "slot-latest");
    const fallbackManifest = readSlotManifest(fallbackDir);
    if (fallbackManifest) {
      slotDir = fallbackDir;
      manifest = fallbackManifest;
    }
  }

  if (!manifest) {
    return { ok: false, error: `No native session backup (${requestedSlotName}) found for this profile.` };
  }

  let effectiveSlotDir = slotDir;
  let tempExtractDir = "";
  if (!fs.existsSync(path.join(slotDir, "Cookies")) && fs.existsSync(path.join(slotDir, COLD_SLOT_ZPACK_FILE))) {
    tempExtractDir = path.join(backupRoot, `slot-extract-${process.pid}-${Date.now()}`);
    const ext = extractColdBackupSlot(slotDir, tempExtractDir);
    if (!ext.extracted) {
      try {
        if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return { ok: false, error: `Failed to decompress cold backup slot: ${ext.error || "unknown"}` };
    }
    effectiveSlotDir = tempExtractDir;
  }

  const srcCkPath = path.join(effectiveSlotDir, "Cookies");
  const srcLsPath = path.join(effectiveSlotDir, "Local State");
  const srcLdbDir = path.join(effectiveSlotDir, "leveldb");

  const dstCkPath = path.join(targetUserDataDir, COOKIES_REL_PATH);
  const dstBakCkPath = path.join(targetUserDataDir, COOKIES_BAK_REL_PATH);
  const dstLsPath = path.join(targetUserDataDir, LOCAL_STATE_REL_PATH);
  const dstBakLsPath = path.join(targetUserDataDir, LOCAL_STATE_BAK_REL_PATH);
  const dstLdbDir = path.join(targetUserDataDir, LOCAL_STORAGE_REL_PATH);
  const dstBakLdbDir = path.join(targetUserDataDir, LOCAL_STORAGE_BAK_REL_PATH);

  try {
    fs.mkdirSync(path.dirname(dstCkPath), { recursive: true });
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      const side = `${dstCkPath}${suffix}`;
      if (fs.existsSync(side)) {
        try {
          fs.unlinkSync(side);
        } catch {
          /* ignore */
        }
      }
    }

    // 1. Restore Default/Network/Cookies bit-for-bit (0 SQLite mutations)
    fs.copyFileSync(srcCkPath, dstCkPath);
    fs.copyFileSync(srcCkPath, dstBakCkPath);
    try {
      const dstMetaPath = path.join(targetUserDataDir, "Default", "Network", "Cookies.guard-meta.json");
      fs.writeFileSync(
        dstMetaPath,
        JSON.stringify(
          {
            updatedAt: new Date().toISOString(),
            totalRows: Number(manifest.totalRows || 0),
            domainsCount: Number(manifest.domainsCount || 0),
            authDomainsCount: Number(manifest.authDomainsCount || 0),
            hasGoogleAuth: Boolean(manifest.hasGoogleAuth),
            hasOutlookAuth: Boolean(manifest.hasOutlookAuth),
            hasFacebookAuth: Boolean(manifest.hasFacebookAuth),
            hasTikTokAuth: Boolean(manifest.hasTikTokAuth),
            byteSize: Number(manifest.cookiesBytes || 0),
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch {
      /* ignore */
    }

    // 2. Restore Local State (and automatically re-wrap DPAPI master key if restored onto a different Windows machine)
    let localStateRestored = false;
    let dpapiRewrapped = false;
    if (fs.existsSync(srcLsPath)) {
      fs.copyFileSync(srcLsPath, dstLsPath);
      localStateRestored = true;
      if (typeof unprotectDpapiKey === "function") {
        try {
          const lsObj = JSON.parse(fs.readFileSync(dstLsPath, "utf8"));
          const encKeyB64 = lsObj?.os_crypt?.encrypted_key;
          const canDecryptDirectly = encKeyB64 ? Boolean(unprotectDpapiKey(encKeyB64)) : false;
          if (!canDecryptDirectly && manifest.wrappedMasterKeyB64) {
            const masterKey32 = unwrapMasterKeyPortable(manifest.wrappedMasterKeyB64);
            if (masterKey32) {
              const newDpapiB64 = protectDpapiKeyNative(masterKey32);
              if (newDpapiB64) {
                lsObj.os_crypt = { ...(lsObj.os_crypt || {}), encrypted_key: newDpapiB64 };
                fs.writeFileSync(dstLsPath, JSON.stringify(lsObj), "utf8");
                dpapiRewrapped = true;
              }
            }
          }
        } catch {
          /* ignore */
        }
      }
      fs.copyFileSync(dstLsPath, dstBakLsPath);
    }

    // 3. Restore Default/Local Storage/leveldb
    const ldbRestored = copyLevelDbDirClean(srcLdbDir, dstLdbDir);
    if (ldbRestored.copied) {
      copyLevelDbDirClean(srcLdbDir, dstBakLdbDir);
    }

    // 4. Restore full Default/ user state (History, Bookmarks, Favicons, Top Sites, Preferences, Login Data, Web Data, Account Web Data, IndexedDB, Session Storage, Sessions, Extension Storage)
    const userStateRestored = restoreDefaultUserState(path.join(effectiveSlotDir, "default-state"), targetUserDataDir);

    return {
      ok: true,
      mode: "native-bundle",
      restoredSlot: manifest.slot || slot,
      restoredFromCompressedColdSlot: Boolean(tempExtractDir),
      restoredCreatedAt: manifest.createdAt || null,
      restoredFromBak: true,
      localStateRestored,
      dpapiRewrapped,
      localStorageRestored: Boolean(ldbRestored.copied),
      localStorageBytes: ldbRestored.dataBytes,
      historyRestored: userStateRestored.historyRestored,
      stateFilesRestored: userStateRestored.stateFilesRestored,
      totalRows: manifest.totalRows || 0,
      cookiesSha256: manifest.cookiesSha256 || "",
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "restore_native_session_failed",
    };
  } finally {
    if (tempExtractDir) {
      try {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

function getProfileNativeBackupSlots(userDataDir) {
  if (!userDataDir) return { slotLatest: null, slotPrevious: null };
  const backupRoot = resolveProfileBackupRoot(userDataDir);
  const slotLatest = readSlotManifest(path.join(backupRoot, "slot-latest"));
  const slotPrevious = readSlotManifest(path.join(backupRoot, "slot-previous"));
  return { slotLatest, slotPrevious };
}

const fastCookiesSummaryCache = new Map();
const FAST_COOKIES_CACHE_MAX = 6000;

function fastInspectCookiesCached(ckPath, inspectSqliteCookiesFile) {
  if (!ckPath || !fs.existsSync(ckPath)) return null;
  try {
    const st = fs.statSync(ckPath);
    if (st.size <= 0) return null;
    const key = `${ckPath}:${st.size}:${Math.floor(st.mtimeMs)}`;
    const hit = fastCookiesSummaryCache.get(key);
    if (hit) return hit;
    if (typeof inspectSqliteCookiesFile === "function") {
      const res = inspectSqliteCookiesFile(ckPath, st.size);
      if (res && res.ok !== false && Number(res.totalRows) > 0) {
        fastCookiesSummaryCache.set(key, res);
        if (fastCookiesSummaryCache.size > FAST_COOKIES_CACHE_MAX) {
          const first = fastCookiesSummaryCache.keys().next().value;
          if (first) fastCookiesSummaryCache.delete(first);
        }
      }
      return res;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function computeFastProfileStateBytes(userDataDir) {
  if (!userDataDir || !fs.existsSync(userDataDir)) return 0;
  let total = 0;
  const defaultDir = path.join(userDataDir, "Default");
  const safeSize = (p) => {
    try {
      const st = fs.statSync(p);
      return st.isFile() ? st.size : 0;
    } catch {
      return 0;
    }
  };
  total += safeSize(path.join(userDataDir, LOCAL_STATE_REL_PATH));
  total += safeSize(path.join(userDataDir, COOKIES_REL_PATH));
  for (const item of DEFAULT_USER_STATE_FILES) {
    total += safeSize(path.join(defaultDir, item.rel));
  }
  const ldb = inspectLevelDbDir(path.join(userDataDir, LOCAL_STORAGE_REL_PATH));
  total += ldb.dataBytes;
  for (const relDir of DEFAULT_USER_STATE_DIRS) {
    const sub = path.join(defaultDir, relDir);
    if (!fs.existsSync(sub)) continue;
    try {
      const entries = fs.readdirSync(sub, { withFileTypes: true });
      for (let i = 0; i < Math.min(entries.length, 80); i += 1) {
        const entry = entries[i];
        if (relDir === "IndexedDB" && shouldSkipIndexedDbOriginDir(entry.name)) {
          continue;
        }
        const full = path.join(sub, entry.name);
        if (entry.isFile()) {
          total += safeSize(full);
        } else if (entry.isDirectory()) {
          if (relDir === "IndexedDB") {
            const originBytes = computeDirectoryBytesBounded(full, SMART_IDB_MAX_ORIGIN_BYTES);
            if (originBytes > 0 && originBytes <= SMART_IDB_MAX_ORIGIN_BYTES) {
              total += originBytes;
            }
          } else {
            try {
              const subEntries = fs.readdirSync(full, { withFileTypes: true });
              for (let j = 0; j < Math.min(subEntries.length, 60); j += 1) {
                if (subEntries[j].isFile()) {
                  total += safeSize(path.join(full, subEntries[j].name));
                }
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  return total;
}

function computeManifestSlotBytes(manifest) {
  if (!manifest || typeof manifest !== "object") return 0;
  if (Number(manifest.slotTotalBytes) > 0) return Number(manifest.slotTotalBytes);
  return (
    Number(manifest.cookiesBytes || 0) +
    Number(manifest.localStateBytes || 0) +
    Number(manifest.localStorageBackupBytes || 0) +
    Number(manifest.stateBytes || 0)
  );
}

function peekProfileBackupDirectoryEntry(
  userDataDir,
  { profileId = "", zipMeta = null, inspectSqliteCookiesFile } = {},
) {
  const folderExists = Boolean(userDataDir && fs.existsSync(userDataDir));
  if (!folderExists) {
    return {
      id: String(profileId),
      folderExists: false,
      folderBytes: 0,
      lastBackupAt: zipMeta?.lastBackupAt || undefined,
      lastBackupBytes: zipMeta?.lastBackupBytes || 0,
      lastBackupPath: zipMeta?.lastBackupPath || undefined,
      slotVersion: 0,
      backupCount: 0,
      hasSlotLatest: false,
      hasSlotPrevious: false,
      slotLatestAt: null,
      slotPreviousAt: null,
      slotLatestBytes: 0,
      slotPreviousBytes: 0,
      totalBackupBytes: 0,
      avgBackupBytes: 0,
      cookiesCount: 0,
      domainsCount: 0,
      authDomainsCount: 0,
      hasGoogleAuth: false,
      hasOutlookAuth: false,
      hasFacebookAuth: false,
      hasTikTokAuth: false,
      historyBytes: 0,
      historyUrlsCount: 0,
      historyVisitsCount: 0,
      localStorageBytes: 0,
      stateFilesCount: 0,
      stateBytes: 0,
    };
  }

  const backupRoot = resolveProfileBackupRoot(userDataDir);
  const slotLatestDir = path.join(backupRoot, "slot-latest");
  const slotPreviousDir = path.join(backupRoot, "slot-previous");
  const slotLatest = readSlotManifest(slotLatestDir);
  const slotPrevious = readSlotManifest(slotPreviousDir);

  const ckPath = path.join(userDataDir, COOKIES_REL_PATH);
  const bakCkPath = path.join(userDataDir, COOKIES_BAK_REL_PATH);
  const histPath = path.join(userDataDir, "Default", "History");
  const slotHistPath = path.join(slotLatestDir, "default-state", "History");
  const guardMetaPath = path.join(userDataDir, "Default", "Network", "Cookies.guard-meta.json");

  let bakCkMtimeMs = 0;
  let bakCkBytes = 0;
  try {
    if (fs.existsSync(bakCkPath)) {
      const st = fs.statSync(bakCkPath);
      if (st.size > 0) {
        bakCkMtimeMs = st.mtimeMs;
        bakCkBytes = st.size;
      }
    }
  } catch {
    /* ignore */
  }

  let liveCkMtimeMs = 0;
  let liveCkBytes = 0;
  try {
    if (fs.existsSync(ckPath)) {
      const st = fs.statSync(ckPath);
      if (st.size > 0) {
        liveCkMtimeMs = st.mtimeMs;
        liveCkBytes = st.size;
      }
    }
  } catch {
    /* ignore */
  }

  let liveHistBytes = 0;
  try {
    if (fs.existsSync(histPath)) {
      liveHistBytes = fs.statSync(histPath).size;
    }
  } catch {
    /* ignore */
  }

  const ldbInfo = inspectLevelDbDir(path.join(userDataDir, LOCAL_STORAGE_REL_PATH));

  let guardMeta = null;
  if (fs.existsSync(guardMetaPath)) {
    try {
      guardMeta = JSON.parse(fs.readFileSync(guardMetaPath, "utf8"));
    } catch {
      guardMeta = null;
    }
  }

  const slotLatestMs = slotLatest?.createdAt ? Date.parse(slotLatest.createdAt) || 0 : 0;
  const guardMetaMs = guardMeta?.updatedAt ? Date.parse(guardMeta.updatedAt) || 0 : 0;
  const newestDiskCkMs = Math.max(liveCkMtimeMs, bakCkMtimeMs);
  const needLiveCookieInspect =
    (!slotLatest ||
      !slotLatest.domainsCount ||
      (slotLatest.totalRows === 10 && slotLatest.authDomainsCount === 0) ||
      newestDiskCkMs > slotLatestMs + 5000) &&
    (!guardMeta ||
      !guardMeta.totalRows ||
      !guardMeta.domainsCount ||
      (guardMeta.totalRows === 10 && guardMeta.authDomainsCount === 0) ||
      newestDiskCkMs > guardMetaMs + 5000);

  if (needLiveCookieInspect) {
    let inspected = null;
    if (liveCkBytes > 0) {
      inspected = fastInspectCookiesCached(ckPath, inspectSqliteCookiesFile);
    }
    if ((!inspected || !inspected.totalRows) && bakCkBytes > 0) {
      inspected = fastInspectCookiesCached(bakCkPath, inspectSqliteCookiesFile);
    }
    if (inspected && inspected.totalRows > 0) {
      guardMeta = inspected;
    }
  }

  const useGuardOverSlot =
    guardMeta &&
    Number(guardMeta.totalRows) > 0 &&
    (!slotLatest ||
      (slotLatest.totalRows === 10 && slotLatest.authDomainsCount === 0) ||
      newestDiskCkMs > slotLatestMs + 5000);

  const primaryCookieSource = useGuardOverSlot ? guardMeta : slotLatest || guardMeta;
  const cookiesCount = Number(primaryCookieSource?.totalRows ?? 0);
  const domainsCount = Number(
    primaryCookieSource?.domainsCount ?? slotLatest?.domainsCount ?? guardMeta?.domainsCount ?? 0,
  );
  const authDomainsCount = Number(primaryCookieSource?.authDomainsCount ?? 0);
  const hasGoogleAuth = Boolean(primaryCookieSource?.hasGoogleAuth);
  const hasOutlookAuth = Boolean(primaryCookieSource?.hasOutlookAuth);
  const hasFacebookAuth = Boolean(primaryCookieSource?.hasFacebookAuth);
  const hasTikTokAuth = Boolean(primaryCookieSource?.hasTikTokAuth);

  let historyUrlsCount = Number(slotLatest?.historyUrlsCount || 0);
  let historyVisitsCount = Number(slotLatest?.historyVisitsCount || 0);
  if (historyUrlsCount <= 0 || liveHistBytes > 0) {
    const targetHist = liveHistBytes > 0 ? histPath : fs.existsSync(slotHistPath) ? slotHistPath : "";
    if (targetHist) {
      const hInfo = inspectHistorySqliteCached(targetHist);
      if (hInfo.urlsCount > 0) {
        historyUrlsCount = hInfo.urlsCount;
        historyVisitsCount = hInfo.visitsCount;
      }
    }
  }

  const historyBytes = Math.max(Number(slotLatest?.historyBytes || 0), liveHistBytes);
  const localStorageBytes = Math.max(Number(slotLatest?.localStorageBackupBytes || 0), ldbInfo.dataBytes);
  const fastStateBytes = computeFastProfileStateBytes(userDataDir);

  const slotLatestBytes = computeManifestSlotBytes(slotLatest);
  const slotPreviousBytes = computeManifestSlotBytes(slotPrevious);
  const slotLatestCompressed = Boolean(slotLatest?.compressed);
  const slotPreviousCompressed = Boolean(slotPrevious?.compressed);
  const slotLatestUncompressedBytes = Number(slotLatest?.uncompressedSlotBytes || slotLatestBytes || 0);
  const slotPreviousUncompressedBytes = Number(slotPrevious?.uncompressedSlotBytes || slotPreviousBytes || 0);
  const slotCount = (slotLatest ? 1 : 0) + (slotPrevious ? 1 : 0);
  const hasZipBackup = Boolean(zipMeta?.lastBackupAt && Number(zipMeta?.lastBackupBytes) > 0);
  const backupCount = slotCount > 0 ? slotCount : hasZipBackup ? 1 : 0;
  const totalBackupBytes =
    slotCount > 0
      ? slotLatestBytes + slotPreviousBytes
      : hasZipBackup
        ? Number(zipMeta.lastBackupBytes)
        : 0;
  const totalUncompressedBackupBytes =
    slotCount > 0 ? slotLatestUncompressedBytes + slotPreviousUncompressedBytes : totalBackupBytes;
  const avgBackupBytes = backupCount > 0 ? Math.round(totalBackupBytes / backupCount) : 0;
  const stateBytes = Math.max(slotLatestUncompressedBytes, fastStateBytes);

  // "Update" in Backup Directory strictly represents the most recent requested backup slot or .zip export
  const backupCandidates = [slotLatest?.createdAt, zipMeta?.lastBackupAt].filter(Boolean);
  let lastBackupAt = undefined;
  let bestMs = 0;
  for (const iso of backupCandidates) {
    const ms = Date.parse(iso);
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      lastBackupAt = new Date(ms).toISOString();
    }
  }

  return {
    id: String(profileId),
    folderExists: true,
    folderBytes: totalBackupBytes,
    lastBackupAt,
    lastBackupBytes: slotLatestBytes || Number(zipMeta?.lastBackupBytes || 0),
    lastBackupPath: zipMeta?.lastBackupPath || undefined,
    slotVersion: slotLatest ? Number(slotLatest.version || 1) : 0,
    backupCount,
    hasSlotLatest: Boolean(slotLatest),
    hasSlotPrevious: Boolean(slotPrevious),
    slotLatestAt: slotLatest?.createdAt || null,
    slotPreviousAt: slotPrevious?.createdAt || null,
    slotLatestBytes,
    slotPreviousBytes,
    slotLatestCompressed,
    slotPreviousCompressed,
    slotLatestUncompressedBytes,
    slotPreviousUncompressedBytes,
    totalBackupBytes,
    totalUncompressedBackupBytes,
    avgBackupBytes,
    cookiesCount,
    domainsCount,
    authDomainsCount,
    hasGoogleAuth,
    hasOutlookAuth,
    hasFacebookAuth,
    hasTikTokAuth,
    historyBytes,
    historyUrlsCount,
    historyVisitsCount,
    localStorageBytes,
    stateFilesCount: Number(slotLatest?.stateFilesCount || 0),
    stateBytes,
  };
}

module.exports = {
  resolveProfileBackupRoot,
  isProfileDirectoryLocked,
  wrapMasterKeyPortable,
  unwrapMasterKeyPortable,
  compressColdBackupSlot,
  extractColdBackupSlot,
  snapshotDefaultUserState,
  restoreDefaultUserState,
  snapshotProfileNativeSession,
  restoreProfileNativeSession,
  getProfileNativeBackupSlots,
  computeFastProfileStateBytes,
  peekProfileBackupDirectoryEntry,
};
