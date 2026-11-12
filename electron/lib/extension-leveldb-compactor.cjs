"use strict";
/**
 * Post-close LevelDB WAL (`.log`) compactor for `Default/Local Extension Settings/<extId>`.
 *
 * Why WAL-only in-place compaction:
 * - MV3 extensions using `chrome.storage.local` (e.g. `E0001` periodic heartbeat/sync state) can
 *   accumulate 5–25 MB of uncompacted LevelDB write-ahead `.log` batches containing hundreds of
 *   thousands of overwritten versions of the same ~10–20 keys (`25 KB` live state).
 * - Rewriting ONLY the active `<NNNNNN>.log` file as a deduplicated LevelDB WriteBatch with
 *   exact Castagnoli CRC32C + LevelDB mask preserves `CURRENT`, `MANIFEST-*`, and any `.ldb` SST
 *   tables untouched while shrinking 20+ MB `.log` files down to ~25 KB in < 15 ms.
 * - Strictly skips live/locked profiles and `8xxx` (`8000`–`8999`) customer profiles.
 */
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_COMPACT_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5 MB
const LEVELDB_BLOCK_SIZE = 32768;
const LEVELDB_HEADER_SIZE = 7;
const LEVELDB_MASK_DELTA = 0xa282ead8;

const RECORD_FULL = 1;
const RECORD_FIRST = 2;
const RECORD_MIDDLE = 3;
const RECORD_LAST = 4;

const BATCH_OP_DELETE = 0;
const BATCH_OP_VALUE = 1;

// Precomputed reflected CRC32C (Castagnoli polynomial 0x82F63B78) lookup table
const CRC32C_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? ((crc >>> 1) ^ 0x82f63b78) >>> 0 : (crc >>> 1) >>> 0;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32cExtend(initCrc, buf, offset = 0, length = buf.length - offset) {
  let crc = (initCrc ^ 0xffffffff) >>> 0;
  const end = offset + length;
  for (let i = offset; i < end; i += 1) {
    crc = (CRC32C_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32cRecord(recordType, payloadBuf, offset = 0, length = payloadBuf.length - offset) {
  let crc = (CRC32C_TABLE[(0xffffffff ^ (recordType & 0xff)) & 0xff] ^ 0x00ffffff) >>> 0;
  const end = offset + length;
  for (let i = offset; i < end; i += 1) {
    crc = (CRC32C_TABLE[(crc ^ payloadBuf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function maskLevelDbCrc(crc) {
  const u = crc >>> 0;
  const rot = (((u >>> 15) | (u << 17)) >>> 0);
  return (rot + LEVELDB_MASK_DELTA) >>> 0;
}

function readVarint32(buf, offset, end) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < end && shift <= 28) {
    const byte = buf[pos];
    pos += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result >>> 0, next: pos };
    }
    shift += 7;
  }
  return null;
}

function encodeVarint32(value) {
  const bytes = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

/**
 * Parse a LevelDB `.log` WAL buffer, verifying block framing & masked CRC32C checksums.
 */
function parseLevelDbWalBuffer(buf, { strictCrc = true } = {}) {
  const opsByKeyHex = new Map();
  let minSeq = null;
  let maxNextSeq = 1n;
  let batchCount = 0;
  let opCount = 0;
  let crcFailures = 0;

  let blockStart = 0;
  let pendingChunks = [];
  let inFragment = false;

  const consumeBatch = (batchBuf) => {
    if (batchBuf.length < 12) return;
    const seq = batchBuf.readBigUInt64LE(0);
    const declaredCount = batchBuf.readUInt32LE(8);
    if (minSeq === null || seq < minSeq) minSeq = seq;
    let pos = 12;
    let parsedOps = 0;
    while (pos < batchBuf.length) {
      const tag = batchBuf[pos];
      pos += 1;
      const kLen = readVarint32(batchBuf, pos, batchBuf.length);
      if (!kLen || pos + (kLen.next - pos) + kLen.value > batchBuf.length) break;
      pos = kLen.next;
      const key = Buffer.from(batchBuf.subarray(pos, pos + kLen.value));
      pos += kLen.value;

      if (tag === BATCH_OP_VALUE) {
        const vLen = readVarint32(batchBuf, pos, batchBuf.length);
        if (!vLen || vLen.next + vLen.value > batchBuf.length) break;
        pos = vLen.next;
        const value = Buffer.from(batchBuf.subarray(pos, pos + vLen.value));
        pos += vLen.value;
        opsByKeyHex.set(key.toString("hex"), { type: BATCH_OP_VALUE, key, value });
        parsedOps += 1;
        opCount += 1;
      } else if (tag === BATCH_OP_DELETE) {
        opsByKeyHex.set(key.toString("hex"), { type: BATCH_OP_DELETE, key, value: null });
        parsedOps += 1;
        opCount += 1;
      } else {
        break;
      }
    }
    const effectiveCount = BigInt(Math.max(declaredCount, parsedOps, 1));
    const nextSeq = seq + effectiveCount;
    if (nextSeq > maxNextSeq) maxNextSeq = nextSeq;
    batchCount += 1;
  };

  while (blockStart < buf.length) {
    const blockEnd = Math.min(blockStart + LEVELDB_BLOCK_SIZE, buf.length);
    let offset = blockStart;
    while (offset + LEVELDB_HEADER_SIZE <= blockEnd) {
      const expectedMaskedCrc = buf.readUInt32LE(offset);
      const length = buf.readUInt16LE(offset + 4);
      const type = buf[offset + 6];
      if (expectedMaskedCrc === 0 && length === 0 && type === 0) {
        // Zero-padded block trailer
        break;
      }
      if (type < RECORD_FULL || type > RECORD_LAST || offset + LEVELDB_HEADER_SIZE + length > blockEnd) {
        // Truncated tail record at crash boundary — stop cleanly like Chromium LevelDB recovery
        pendingChunks = [];
        inFragment = false;
        break;
      }
      const actualMaskedCrc = maskLevelDbCrc(crc32cRecord(type, buf, offset + LEVELDB_HEADER_SIZE, length));
      if (actualMaskedCrc !== expectedMaskedCrc) {
        crcFailures += 1;
        pendingChunks = [];
        inFragment = false;
        if (strictCrc && offset + LEVELDB_HEADER_SIZE + length < buf.length - LEVELDB_BLOCK_SIZE) {
          return {
            ok: false,
            reason: "mid-stream-crc-mismatch",
            crcFailures,
            batchCount,
            opCount,
            opsByKeyHex,
            minSeq,
            maxNextSeq,
          };
        }
        offset += LEVELDB_HEADER_SIZE + length;
        continue;
      }
      const slice = buf.subarray(offset + LEVELDB_HEADER_SIZE, offset + LEVELDB_HEADER_SIZE + length);
      offset += LEVELDB_HEADER_SIZE + length;

      if (type === RECORD_FULL) {
        pendingChunks = [];
        inFragment = false;
        consumeBatch(slice);
      } else if (type === RECORD_FIRST) {
        pendingChunks = [slice];
        inFragment = true;
      } else if (type === RECORD_MIDDLE) {
        if (inFragment) pendingChunks.push(slice);
      } else if (type === RECORD_LAST) {
        if (inFragment) {
          pendingChunks.push(slice);
          const full = Buffer.concat(pendingChunks);
          pendingChunks = [];
          inFragment = false;
          consumeBatch(full);
        }
      }
    }
    blockStart += LEVELDB_BLOCK_SIZE;
  }

  return {
    ok: true,
    crcFailures,
    batchCount,
    opCount,
    opsByKeyHex,
    minSeq: minSeq ?? 1n,
    maxNextSeq,
  };
}

/**
 * Encode deduplicated operations into a single spec-compliant LevelDB WriteBatch WAL stream
 * framed into 32KB blocks with masked Castagnoli CRC32C headers.
 */
function encodeLevelDbWalFromOps(ops, { startSeq = 1n } = {}) {
  if (!Array.isArray(ops) || ops.length === 0) {
    return Buffer.alloc(0);
  }
  const bodyParts = [];
  const header = Buffer.alloc(12);
  header.writeBigUInt64LE(BigInt(startSeq), 0);
  header.writeUInt32LE(ops.length >>> 0, 8);
  bodyParts.push(header);

  for (const op of ops) {
    if (op.type === BATCH_OP_DELETE) {
      bodyParts.push(Buffer.from([BATCH_OP_DELETE]), encodeVarint32(op.key.length), op.key);
    } else {
      const val = op.value || Buffer.alloc(0);
      bodyParts.push(
        Buffer.from([BATCH_OP_VALUE]),
        encodeVarint32(op.key.length),
        op.key,
        encodeVarint32(val.length),
        val,
      );
    }
  }

  const batchPayload = Buffer.concat(bodyParts);
  const outParts = [];
  let blockOffset = 0;
  let pos = 0;
  let begin = true;

  do {
    const leftover = LEVELDB_BLOCK_SIZE - blockOffset;
    if (leftover < LEVELDB_HEADER_SIZE) {
      if (leftover > 0) {
        outParts.push(Buffer.alloc(leftover, 0));
      }
      blockOffset = 0;
    }
    const avail = LEVELDB_BLOCK_SIZE - blockOffset - LEVELDB_HEADER_SIZE;
    const left = batchPayload.length - pos;
    const fragmentLen = Math.min(left, avail);
    const end = fragmentLen === left;
    let recordType = RECORD_MIDDLE;
    if (begin && end) recordType = RECORD_FULL;
    else if (begin) recordType = RECORD_FIRST;
    else if (end) recordType = RECORD_LAST;

    const recHeader = Buffer.alloc(LEVELDB_HEADER_SIZE);
    const maskedCrc = maskLevelDbCrc(crc32cRecord(recordType, batchPayload, pos, fragmentLen));
    recHeader.writeUInt32LE(maskedCrc, 0);
    recHeader.writeUInt16LE(fragmentLen, 4);
    recHeader[6] = recordType;

    outParts.push(recHeader);
    if (fragmentLen > 0) {
      outParts.push(batchPayload.subarray(pos, pos + fragmentLen));
    }
    blockOffset += LEVELDB_HEADER_SIZE + fragmentLen;
    pos += fragmentLen;
    begin = false;
  } while (pos < batchPayload.length);

  return Buffer.concat(outParts);
}

function levelDbLockFileIsBusy(extLevelDbDir) {
  const lockPath = path.join(extLevelDbDir, "LOCK");
  if (!fs.existsSync(lockPath)) return false;
  try {
    const fd = fs.openSync(lockPath, "r+");
    fs.closeSync(fd);
    return false;
  } catch (err) {
    return err?.code === "EBUSY" || err?.code === "EPERM" || err?.code === "EACCES";
  }
}

function isProtectedCustomer8xxxCode(profileCode) {
  const raw = String(profileCode || "").trim();
  if (!raw) return false;
  const digits = raw.replace(/^#/, "");
  return /^8\d{3}$/.test(digits);
}

function inferProfileCodeFromUserDataDir(userDataDir) {
  try {
    const base = path.basename(String(userDataDir || ""));
    if (/^\d{4,5}$/.test(base)) return base;
    const pidMetaPath = path.join(userDataDir, "stealth-pid.json");
    if (fs.existsSync(pidMetaPath)) {
      const meta = JSON.parse(fs.readFileSync(pidMetaPath, "utf8"));
      const candidate = String(meta?.profileName || meta?.name || meta?.profileCode || "").trim();
      const match = candidate.match(/(?:^|#)(\d{4,5})\b/);
      if (match) return match[1];
    }
    try {
      let initMod = null;
      for (const mod of Object.values(require.cache)) {
        if (
          mod?.filename &&
          /electron[\\/]db[\\/]init\.cjs$/i.test(mod.filename) &&
          typeof mod.exports?.isDatabaseReady === "function" &&
          mod.exports.isDatabaseReady()
        ) {
          initMod = mod.exports;
          break;
        }
      }
      const { isDatabaseReady, getDb } = initMod || require("../db/init.cjs");
      if (typeof isDatabaseReady === "function" && isDatabaseReady() && base) {
        const stmt = getDb().prepare("SELECT name FROM profiles WHERE id = ? LIMIT 1");
        let row = null;
        if (typeof stmt.get === "function") {
          row = stmt.get(base);
        } else {
          try {
            if (typeof stmt.bind === "function") stmt.bind([base]);
            if (stmt.step()) row = stmt.getAsObject();
          } finally {
            if (typeof stmt.free === "function") stmt.free();
          }
        }
        const nameStr = String(row?.name || "").trim();
        const match = nameStr.match(/(?:^|#)(\d{4,5})\b/);
        if (match) return match[1];
      }
    } catch {
      /* ignore db unavailable */
    }
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Compact a single extension's `Default/Local Extension Settings/<extId>` LevelDB WAL `.log`
 * if its `.log` byte total exceeds `thresholdBytes`.
 */
function compactSingleExtensionLevelDbDir(extLevelDbDir, options = {}) {
  const thresholdBytes = Number(options.thresholdBytes) > 0
    ? Number(options.thresholdBytes)
    : DEFAULT_COMPACT_THRESHOLD_BYTES;

  if (!extLevelDbDir || !fs.existsSync(extLevelDbDir)) {
    return { compacted: false, reason: "missing-dir", savedBytes: 0 };
  }
  if (levelDbLockFileIsBusy(extLevelDbDir)) {
    return { compacted: false, reason: "leveldb-locked", savedBytes: 0 };
  }

  let entries;
  try {
    entries = fs.readdirSync(extLevelDbDir, { withFileTypes: true });
  } catch {
    return { compacted: false, reason: "readdir-error", savedBytes: 0 };
  }

  const logFiles = [];
  let hasSstFiles = false;
  let totalLogBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (/^\d+\.log$/i.test(entry.name)) {
      try {
        const fullPath = path.join(extLevelDbDir, entry.name);
        const st = fs.statSync(fullPath);
        logFiles.push({ name: entry.name, fullPath, size: st.size });
        totalLogBytes += st.size;
      } catch {
        /* ignore */
      }
    } else if (/\.(?:ldb|sst)$/i.test(entry.name)) {
      hasSstFiles = true;
    }
  }

  if (totalLogBytes < thresholdBytes || logFiles.length === 0) {
    return { compacted: false, reason: "below-threshold", beforeBytes: totalLogBytes, savedBytes: 0 };
  }

  // Sort chronologically by numeric WAL file number (`000003.log` < `000007.log`)
  logFiles.sort((a, b) => Number.parseInt(a.name, 10) - Number.parseInt(b.name, 10));

  // Compact the active (largest / latest) `.log` file(s) exceeding threshold
  let totalBefore = 0;
  let totalAfter = 0;
  let compactedFiles = 0;
  let liveKeyCount = 0;

  for (const logInfo of logFiles) {
    if (logInfo.size < Math.min(thresholdBytes, 1024 * 1024)) continue;
    let rawBuf;
    try {
      rawBuf = fs.readFileSync(logInfo.fullPath);
    } catch {
      continue;
    }
    const parsed = parseLevelDbWalBuffer(rawBuf, { strictCrc: true });
    if (!parsed.ok || parsed.opCount === 0) {
      continue;
    }

    const finalOps = [];
    for (const op of parsed.opsByKeyHex.values()) {
      if (op.type === BATCH_OP_DELETE && !hasSstFiles) {
        // No older SSTables exist, so deleted keys do not need tombstones
        continue;
      }
      finalOps.push(op);
    }
    if (finalOps.length === 0) continue;

    const seqSpan = BigInt(finalOps.length);
    const startSeq = parsed.maxNextSeq > seqSpan ? parsed.maxNextSeq - seqSpan : 1n;
    const compactedBuf = encodeLevelDbWalFromOps(finalOps, { startSeq });

    // Require meaningful space savings (> 50% smaller) and self-verify roundtrip CRC & keys
    if (compactedBuf.length === 0 || compactedBuf.length >= Math.floor(rawBuf.length * 0.5)) {
      continue;
    }
    const verify = parseLevelDbWalBuffer(compactedBuf, { strictCrc: true });
    if (!verify.ok || verify.crcFailures > 0 || verify.opsByKeyHex.size !== finalOps.length) {
      continue;
    }

    if (options.dryRun) {
      totalBefore += rawBuf.length;
      totalAfter += compactedBuf.length;
      compactedFiles += 1;
      liveKeyCount += finalOps.length;
      continue;
    }

    const tmpPath = `${logInfo.fullPath}.compact.${process.pid}.${Date.now()}.tmp`;
    try {
      const fd = fs.openSync(tmpPath, "w");
      try {
        fs.writeFileSync(fd, compactedBuf);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      if (levelDbLockFileIsBusy(extLevelDbDir)) {
        fs.rmSync(tmpPath, { force: true });
        return { compacted: false, reason: "locked-before-swap", savedBytes: 0 };
      }
      fs.renameSync(tmpPath, logInfo.fullPath);
      totalBefore += rawBuf.length;
      totalAfter += compactedBuf.length;
      compactedFiles += 1;
      liveKeyCount += finalOps.length;
    } catch {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  if (compactedFiles === 0) {
    return { compacted: false, reason: "no-savings", beforeBytes: totalLogBytes, savedBytes: 0 };
  }

  return {
    compacted: true,
    compactedFiles,
    liveKeyCount,
    beforeBytes: totalBefore,
    afterBytes: totalAfter,
    savedBytes: Math.max(0, totalBefore - totalAfter),
  };
}

/**
 * Inspect `Default/Local Extension Settings/*` inside a closed Chromium profile and compact
 * any bloated LevelDB WAL `.log` (> 5 MB by default).
 */
function compactClosedProfileExtensionLevelDb(userDataDir, options = {}) {
  if (!userDataDir || typeof userDataDir !== "string") {
    return { ok: false, skipped: true, reason: "invalid-dir", compactedDirs: 0, savedBytes: 0 };
  }
  const inferredCode = options.profileCode || inferProfileCodeFromUserDataDir(userDataDir);
  if (isProtectedCustomer8xxxCode(inferredCode)) {
    return { ok: false, skipped: true, reason: "protected-8xxx", compactedDirs: 0, savedBytes: 0 };
  }
  const { chromeProfileIsLive } = require("./profile-chrome-cleanup.cjs");
  try {
    if (!fs.existsSync(userDataDir) || chromeProfileIsLive(userDataDir)) {
      return { ok: false, skipped: true, reason: "profile-live", compactedDirs: 0, savedBytes: 0 };
    }
  } catch {
    return { ok: false, skipped: true, reason: "stat-error", compactedDirs: 0, savedBytes: 0 };
  }

  const extSettingsRoot = path.join(userDataDir, "Default", "Local Extension Settings");
  if (!fs.existsSync(extSettingsRoot)) {
    return { ok: true, skipped: false, compactedDirs: 0, savedBytes: 0, details: [] };
  }

  let subdirs;
  try {
    subdirs = fs.readdirSync(extSettingsRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return { ok: true, skipped: false, compactedDirs: 0, savedBytes: 0, details: [] };
  }

  let compactedDirs = 0;
  let savedBytes = 0;
  const details = [];
  for (const sub of subdirs) {
    const extDir = path.join(extSettingsRoot, sub.name);
    const res = compactSingleExtensionLevelDbDir(extDir, options);
    if (res.compacted) {
      compactedDirs += 1;
      savedBytes += res.savedBytes;
      details.push({ extId: sub.name, ...res });
    }
  }

  return {
    ok: true,
    skipped: false,
    compactedDirs,
    savedBytes,
    details,
  };
}

/**
 * Non-blocking post-close LevelDB WAL compaction:
 * Uses `fs.promises` to check `.log` sizes (< 0.1 ms when < 5 MB) and only spawns a background
 * Worker thread when an extension's LevelDB `.log` actually exceeds `thresholdBytes`.
 */
async function compactClosedProfileExtensionLevelDbAsync(userDataDir, options = {}) {
  if (!userDataDir || typeof userDataDir !== "string") {
    return { ok: false, skipped: true, reason: "invalid-dir", compactedDirs: 0, savedBytes: 0 };
  }
  const thresholdBytes = Number(options.thresholdBytes) > 0
    ? Number(options.thresholdBytes)
    : DEFAULT_COMPACT_THRESHOLD_BYTES;
  const inferredCode = options.profileCode || inferProfileCodeFromUserDataDir(userDataDir);
  if (isProtectedCustomer8xxxCode(inferredCode)) {
    return { ok: false, skipped: true, reason: "protected-8xxx", compactedDirs: 0, savedBytes: 0 };
  }
  const extSettingsRoot = path.join(userDataDir, "Default", "Local Extension Settings");
  let subdirs;
  try {
    const ents = await fs.promises.readdir(extSettingsRoot, { withFileTypes: true });
    subdirs = ents.filter((d) => d.isDirectory());
  } catch {
    return { ok: true, skipped: false, compactedDirs: 0, savedBytes: 0, details: [] };
  }
  if (!subdirs.length) {
    return { ok: true, skipped: false, compactedDirs: 0, savedBytes: 0, details: [] };
  }

  let hasOversized = false;
  for (const sub of subdirs) {
    try {
      const extDir = path.join(extSettingsRoot, sub.name);
      const files = await fs.promises.readdir(extDir);
      let dirLogBytes = 0;
      for (const fname of files) {
        if (!/^\d+\.log$/i.test(fname)) continue;
        const st = await fs.promises.stat(path.join(extDir, fname));
        dirLogBytes += st.size;
      }
      if (dirLogBytes >= thresholdBytes) {
        hasOversized = true;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  if (!hasOversized) {
    return { ok: true, skipped: false, compactedDirs: 0, savedBytes: 0, details: [] };
  }

  try {
    const { Worker, isMainThread } = require("node:worker_threads");
    if (isMainThread) {
      return await new Promise((resolve) => {
        const code = `
          const { parentPort, workerData } = require("node:worker_threads");
          const mod = require(${JSON.stringify(__filename)});
          try {
            const res = mod.compactClosedProfileExtensionLevelDb(workerData.userDataDir, workerData.opts);
            parentPort.postMessage(res);
          } catch (err) {
            parentPort.postMessage({ ok: false, skipped: true, reason: err?.message || "worker-error", compactedDirs: 0, savedBytes: 0 });
          }
        `;
        const w = new Worker(code, {
          eval: true,
          workerData: {
            userDataDir,
            opts: { thresholdBytes, profileCode: inferredCode },
          },
        });
        if (typeof w.unref === "function") w.unref();
        let settled = false;
        const finish = (val) => {
          if (settled) return;
          settled = true;
          resolve(val);
        };
        w.on("message", finish);
        w.on("error", () => finish(compactClosedProfileExtensionLevelDb(userDataDir, { thresholdBytes, profileCode: inferredCode })));
        w.on("exit", () => finish({ ok: true, skipped: false, compactedDirs: 0, savedBytes: 0, details: [] }));
      });
    }
  } catch {
    /* fallback to sync */
  }
  return compactClosedProfileExtensionLevelDb(userDataDir, { thresholdBytes, profileCode: inferredCode });
}

module.exports = {
  DEFAULT_COMPACT_THRESHOLD_BYTES,
  crc32cExtend,
  crc32cRecord,
  maskLevelDbCrc,
  parseLevelDbWalBuffer,
  encodeLevelDbWalFromOps,
  compactSingleExtensionLevelDbDir,
  compactClosedProfileExtensionLevelDb,
  compactClosedProfileExtensionLevelDbAsync,
  isProtectedCustomer8xxxCode,
};
