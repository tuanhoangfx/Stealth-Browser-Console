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
  const releaseProd =
    process.argv.includes("--release-prod") ||
    process.env.STEALTH_RELEASE_PROD === "1";
  const applyDevWorker =
    process.argv.includes("--dev-only") || !releaseProd;

  if (!releaseProd) {
    // Dev-Only mode: NEVER touch C:\Users\CzP\AppData\Local\Programs\stealth-browser-console\resources\hot-patch
    // and NEVER call :6003/api/system/hot-reload. Only reload :6004 (isolated worker / dev API) if running.
    let devReload = { ok: false, reason: "offline" };
    try {
      const res = await fetch("http://127.0.0.1:6004/api/system/hot-reload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true, reloadUi: false }),
        signal: AbortSignal.timeout(8000),
      });
      devReload = res.ok ? await res.json() : { ok: false, status: res.status };
    } catch {
      devReload = { ok: false, reason: "dev_worker_6004_offline" };
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "dev-isolated",
          skippedProd: true,
          devWorker6004: devReload,
          reason:
            "Prod (:6003) is strictly isolated for stability. Development updates only target Dev (:5103 / :6004). Pass --release-prod ONLY when the user explicitly requests a Prod Release.",
        },
        null,
        2,
      ),
    );
    return;
  }
  void applyDevWorker;
  const reloadUi = !process.argv.includes("--no-reload-ui");
  const allowProdUiReload =
    process.argv.includes("--reload-prod-ui") || (releaseProd && reloadUi);
  const leaseAttempt = tryAcquireProductMaintenanceLease("P0003", {
    ttlMs: 90_000,
    ports: [6003, 6004],
    reason: "sync-hot-patch",
  });
  try {
    if (!process.argv.includes("--skip-build")) {
      const { spawnSync } = require("node:child_process");
      const buildRes = spawnSync(
        process.execPath,
        [path.join(srcRoot, "scripts", "run-build.mjs")],
        { cwd: srcRoot, stdio: "inherit", windowsHide: true },
      );
      if (buildRes.status !== 0) {
        throw new Error(`Vite build failed with exit code ${buildRes.status}`);
      }
    }

    const orphanAppDir = path.join(installResources, "app");
    if (fs.existsSync(orphanAppDir) && !fs.existsSync(path.join(orphanAppDir, "package.json"))) {
      try {
        fs.rmSync(orphanAppDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }

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

    try {
      const preloadSrc = path.join(srcRoot, "electron", "preload.cjs");
      const preloadUnpackedDest = path.join(installResources, "app.asar.unpacked", "electron", "preload.cjs");
      if (fs.existsSync(preloadSrc)) {
        fs.mkdirSync(path.dirname(preloadUnpackedDest), { recursive: true });
        fs.copyFileSync(preloadSrc, preloadUnpackedDest);
      }
    } catch {
      /* ignore */
    }

    const bundledExtensionsSynced = [];
    try {
      const repoRoot = path.resolve(srcRoot, "..", "..");
      const bundledRoot = path.join(installResources, "bundled-extensions");
      for (const extFolder of ["E0001-cookie-bridge", "E0002-browser-operator"]) {
        const extSrc = path.join(repoRoot, "Extension", extFolder);
        if (!fs.existsSync(path.join(extSrc, "manifest.json"))) continue;
        const extDest = path.join(bundledRoot, extFolder);
        fs.mkdirSync(extDest, { recursive: true });
        fs.cpSync(extSrc, extDest, {
          recursive: true,
          force: true,
          filter: (src) => {
            const rel = path.relative(extSrc, src).replace(/\\/g, "/");
            if (!rel) return true;
            const first = rel.split("/")[0];
            return !["node_modules", ".git", "tests", "scripts", ".cursor", "docs"].includes(first);
          },
        });
        bundledExtensionsSynced.push(extFolder);
      }
    } catch {
      /* ignore */
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

    const baseAsarPath = path.join(installResources, "app.asar");
    if (fs.existsSync(baseAsarPath)) {
      try {
        fs.chmodSync(baseAsarPath, 0o444);
      } catch {
        /* ignore */
      }
    }

    const results = {};
    const extensionsReload = {};
    for (const port of [6003, 6004]) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/system/hot-reload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            force: true,
            releaseProd: true,
            reloadUi,
            allowProdUiReload: port === 6003 ? allowProdUiReload : true,
          }),
          signal: AbortSignal.timeout(30000),
        });
        results[port] = res.ok ? await res.json() : { ok: false, status: res.status };
      } catch {
        results[port] = { ok: false, reason: "offline_or_pre_v9_2_17" };
      }
      if (results[port]?.ok) {
        try {
          const extRes = await fetch(`http://127.0.0.1:${port}/api/extensions/reload-open`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "sync-hot-patch" }),
            signal: AbortSignal.timeout(15000),
          });
          if (extRes.ok) {
            const body = await extRes.json();
            extensionsReload[port] = {
              ok: Boolean(body?.ok),
              reloadNonce: body?.reloadNonce ?? null,
              reloadTriggeredAt: body?.reloadTriggeredAt ?? null,
              e0001Synced: Boolean(body?.e0001Synced),
              e0002Staged: Boolean(body?.e0002Staged),
            };
          } else {
            extensionsReload[port] = { ok: false, status: extRes.status };
          }
        } catch {
          extensionsReload[port] = { ok: false, reason: "reload_open_failed" };
        }
      }
    }

    if (!extensionsReload[6003]?.ok) {
      try {
        const { triggerOpenProfilesExtensionReload } = require("../electron/lib/extensions-status.cjs");
        const direct = triggerOpenProfilesExtensionReload();
        extensionsReload.direct = {
          ok: Boolean(direct?.ok),
          reloadNonce: direct?.reloadNonce ?? null,
          reloadTriggeredAt: direct?.reloadTriggeredAt ?? null,
          e0001Synced: Boolean(direct?.e0001Synced),
          e0002Staged: Boolean(direct?.e0002Staged),
        };
      } catch {
        /* ignore */
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          hotPatchRoot,
          synced,
          bundledExtensionsSynced,
          stagedAsar: stagedAsarResult,
          hotReload: results,
          extensionsReload,
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
