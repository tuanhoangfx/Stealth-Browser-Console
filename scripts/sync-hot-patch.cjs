"use strict";

/**
 * Zero-Restart Hot-Patch Sync (`ok 2` + `ok 3`):
 * 1. Copies `electron/`, `dist/`, `package.json`, `tool.manifest.json`, and `CHANGELOG.md`
 *    into `C:\Users\CzP\AppData\Local\Programs\stealth-browser-console\resources\hot-patch`.
 * 2. Incrementally patches `resources/app.asar.staged` from `resources/app.asar` + `hot-patch/`
 *    so that on next `will-quit` (or background swap when app is closed), `app.asar` has the
 *    latest code baked in.
 * 3. Triggers `POST /api/system/hot-reload` on `:6003` and `:6004` without ever calling `taskkill`
 *    on `Stealth Browser Console.exe`.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const srcRoot = path.resolve(__dirname, "..");
const {
  tryAcquireProductMaintenanceLease,
  releaseProductMaintenanceLease,
} = require("../../scripts/lib/ensure-dev-lease.cjs");
const installResources =
  process.env.STEALTH_RESOURCES_DIR ||
  "C:\\Users\\CzP\\AppData\\Local\\Programs\\stealth-browser-console\\resources";
const hotPatchRoot = path.join(installResources, "hot-patch");

function computeAsarIntegrity(buf) {
  const blockSize = 4 * 1024 * 1024;
  const blocks = [];
  for (let i = 0; i < buf.length; i += blockSize) {
    const slice = buf.subarray(i, Math.min(i + blockSize, buf.length));
    blocks.push(crypto.createHash("sha256").update(slice).digest("hex"));
  }
  if (blocks.length === 0) {
    blocks.push(crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex"));
  }
  return {
    algorithm: "SHA256",
    hash: crypto.createHash("sha256").update(buf).digest("hex"),
    blockSize,
    blocks,
  };
}

function collectFilesRecursive(dir, relPrefix = "", out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      collectFilesRecursive(full, rel, out);
    } else if (ent.isFile()) {
      out.push({ rel, full });
    }
  }
  return out;
}

function setHeaderEntry(rootHeader, relPath, entryMeta) {
  const parts = relPath.split("/").filter(Boolean);
  let cur = rootHeader;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    if (!cur.files) cur.files = {};
    if (!cur.files[seg] || !cur.files[seg].files) {
      cur.files[seg] = { files: {} };
    }
    cur = cur.files[seg];
  }
  const leaf = parts[parts.length - 1];
  if (!cur.files) cur.files = {};
  if (cur.files[leaf]?.unpacked) {
    return false;
  }
  cur.files[leaf] = entryMeta;
  return true;
}

function updateStagedAsarFromHotPatch() {
  const baseAsar = path.join(installResources, "app.asar");
  const stagedAsar = path.join(installResources, "app.asar.staged");
  if (!fs.existsSync(baseAsar)) return { ok: false, reason: "missing_base_asar" };

  try {
    const asar = require("@electron/asar");
    const raw = asar.getRawHeader(baseAsar);
    const headerObj = JSON.parse(raw.headerString);
    const baseStat = fs.statSync(baseAsar);
    const dataStart = 8 + raw.headerSize;
    const origPayloadSize = baseStat.size - dataStart;

    const filesToPatch = collectFilesRecursive(hotPatchRoot);
    const appendedBuffers = [];
    let currentOffset = origPayloadSize;
    let patchedFilesCount = 0;

    for (const item of filesToPatch) {
      const buf = fs.readFileSync(item.full);
      const entryMeta = {
        size: buf.length,
        offset: String(currentOffset),
        integrity: computeAsarIntegrity(buf),
      };
      const applied = setHeaderEntry(headerObj, item.rel, entryMeta);
      if (applied) {
        appendedBuffers.push(buf);
        currentOffset += buf.length;
        patchedFilesCount += 1;
      } else {
        // Also copy unpacked files directly to app.asar.unpacked
        const unpackedDest = path.join(installResources, "app.asar.unpacked", ...item.rel.split("/"));
        try {
          fs.mkdirSync(path.dirname(unpackedDest), { recursive: true });
          fs.copyFileSync(item.full, unpackedDest);
        } catch {
          /* ignore */
        }
      }
    }

    const newHeaderJsonBuf = Buffer.from(JSON.stringify(headerObj), "utf8");
    const jsonLen = newHeaderJsonBuf.length;
    const alignedJsonLen = Math.ceil(jsonLen / 4) * 4;
    const newHeaderSize = alignedJsonLen + 8;

    const prefixBuf = Buffer.alloc(8 + newHeaderSize, 0);
    prefixBuf.writeUInt32LE(4, 0);
    prefixBuf.writeUInt32LE(newHeaderSize, 4);
    prefixBuf.writeUInt32LE(alignedJsonLen + 4, 8);
    prefixBuf.writeUInt32LE(jsonLen, 12);
    newHeaderJsonBuf.copy(prefixBuf, 16);

    const outFd = fs.openSync(stagedAsar, "w");
    const inFd = fs.openSync(baseAsar, "r");
    try {
      fs.writeSync(outFd, prefixBuf, 0, prefixBuf.length);
      const chunkSize = 8 * 1024 * 1024;
      const chunkBuf = Buffer.allocUnsafe(chunkSize);
      let readPos = dataStart;
      while (readPos < baseStat.size) {
        const toRead = Math.min(chunkSize, baseStat.size - readPos);
        const bytesRead = fs.readSync(inFd, chunkBuf, 0, toRead, readPos);
        if (bytesRead <= 0) break;
        fs.writeSync(outFd, chunkBuf, 0, bytesRead);
        readPos += bytesRead;
      }
      for (const b of appendedBuffers) {
        fs.writeSync(outFd, b, 0, b.length);
      }
    } finally {
      fs.closeSync(inFd);
      fs.closeSync(outFd);
    }

    const stagedStat = fs.statSync(stagedAsar);
    const shaHash = crypto.createHash("sha256");
    const verifyFd = fs.openSync(stagedAsar, "r");
    try {
      const vChunk = Buffer.allocUnsafe(8 * 1024 * 1024);
      let vPos = 0;
      while (vPos < stagedStat.size) {
        const n = fs.readSync(verifyFd, vChunk, 0, Math.min(vChunk.length, stagedStat.size - vPos), vPos);
        if (n <= 0) break;
        shaHash.update(vChunk.subarray(0, n));
        vPos += n;
      }
    } finally {
      fs.closeSync(verifyFd);
    }
    const stagedSha256 = shaHash.digest("hex");
    let pkgVer = null;
    try {
      pkgVer = JSON.parse(fs.readFileSync(path.join(srcRoot, "package.json"), "utf8"))?.version || null;
    } catch {
      /* ignore */
    }
    const shaMetaPath = `${stagedAsar}.sha256.json`;
    fs.writeFileSync(
      shaMetaPath,
      JSON.stringify(
        {
          version: pkgVer,
          size: stagedStat.size,
          sha256: stagedSha256,
          stagedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    return {
      ok: true,
      stagedAsar,
      stagedMeta: shaMetaPath,
      sha256: stagedSha256,
      version: pkgVer,
      patchedFilesCount,
      stagedSize: stagedStat.size,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const applyProd =
    process.argv.includes("--apply-prod") || process.env.STEALTH_ALLOW_PROD_SYNC === "1";
  if (!applyProd) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skippedProd: true,
          reason:
            "Prod (:6003) hot-patch & reload is locked by user rule unless --apply-prod is explicitly passed.",
        },
        null,
        2,
      ),
    );
    return;
  }
  const reloadUi = !process.argv.includes("--no-reload-ui");
  const leaseAttempt = tryAcquireProductMaintenanceLease("P0003", {
    ttlMs: 30_000,
    ports: [6003, 6004],
    reason: "sync-hot-patch",
  });
  try {
    fs.mkdirSync(hotPatchRoot, { recursive: true });

    const targets = ["electron", "dist", "package.json", "tool.manifest.json", "CHANGELOG.md"];
    const synced = [];
    for (const rel of targets) {
      const from = path.join(srcRoot, rel);
      const to = path.join(hotPatchRoot, rel);
      if (!fs.existsSync(from)) continue;
      fs.cpSync(from, to, {
        recursive: true,
        force: true,
        filter: (src) => !src.includes("packaged-node_modules"),
      });
      synced.push(rel);
    }

    const stageAsar = process.argv.includes("--stage-asar");
    const stagedPath = path.join(installResources, "app.asar.staged");
    let stagedAsarResult = { ok: true, skipped: true, reason: "hot_patch_dir_active" };
    if (stageAsar) {
      stagedAsarResult = updateStagedAsarFromHotPatch();
    } else if (fs.existsSync(stagedPath)) {
      try {
        fs.unlinkSync(stagedPath);
      } catch {
        /* ignore */
      }
    }

    const results = {};
    for (const port of [6003, 6004]) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/system/hot-reload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true, reloadUi }),
          signal: AbortSignal.timeout(6000),
        });
        results[port] = res.ok ? await res.json() : { ok: false, status: res.status };
      } catch {
        results[port] = { ok: false, reason: "offline_or_pre_v9_2_17" };
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          hotPatchRoot,
          synced,
          stagedAsar: stagedAsarResult,
          hotReload: results,
          maintenanceLease: leaseAttempt.ok ? "acquired_and_released" : "coalesced",
        },
        null,
        2,
      ),
    );
  } finally {
    if (leaseAttempt.ok) {
      releaseProductMaintenanceLease("P0003");
    }
  }
}

main().catch((err) => {
  console.error("[sync-hot-patch] error:", err);
  process.exit(1);
});
