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
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");

const srcRoot = path.resolve(__dirname, "..");
const { CLOAK_ESM_DEPS } = require("../electron/lib/cloakbrowser-esm-deps.cjs");
const { REQUIRED_UNPACKED_PACKAGES } = require("../electron/lib/packaged-runtime-check.cjs");
const {
  tryAcquireProductMaintenanceLease,
  releaseProductMaintenanceLease,
} = require("../../scripts/lib/ensure-dev-lease.cjs");

function ensureUnpackedCloakbrowserSynced({ repoRoot = srcRoot, installResourcesDir = installResources } = {}) {
  const unpackedRoot = path.join(installResourcesDir, "app.asar.unpacked");
  const targetNodeModules = path.join(unpackedRoot, "node_modules");
  const distUnpackedRoot = path.join(repoRoot, "dist-desktop", "win-unpacked", "resources", "app.asar.unpacked");
  const distNodeModules = path.join(distUnpackedRoot, "node_modules");
  const requiredPkgs = Array.from(new Set([...REQUIRED_UNPACKED_PACKAGES, ...CLOAK_ESM_DEPS]));
  const synced = [];
  const errors = [];

  let repoRequire = null;
  const getRepoRequire = () => {
    if (!repoRequire) {
      repoRequire = createRequire(path.join(repoRoot, "package.json"));
    }
    return repoRequire;
  };

  for (const pkg of requiredPkgs) {
    const destPkgDir = path.join(targetNodeModules, ...pkg.split("/"));
    const readyCheck =
      pkg === "cloakbrowser"
        ? path.join(destPkgDir, "dist", "index.js")
        : pkg === "better-sqlite3"
          ? path.join(destPkgDir, "build", "Release", "better_sqlite3.node")
          : pkg === "sql.js"
            ? path.join(destPkgDir, "dist", "sql-wasm.wasm")
            : pkg === "playwright-core"
              ? path.join(destPkgDir, "index.js")
              : path.join(destPkgDir, "package.json");
    if (fs.existsSync(readyCheck)) continue;

    let copied = false;
    const distPkgDir = path.join(distNodeModules, ...pkg.split("/"));
    if (fs.existsSync(path.join(distPkgDir, "package.json"))) {
      try {
        fs.mkdirSync(path.dirname(destPkgDir), { recursive: true });
        fs.cpSync(distPkgDir, destPkgDir, { recursive: true, force: true, dereference: true });
        synced.push(`${pkg} (dist-desktop)`);
        copied = true;
      } catch (err) {
        errors.push(`${pkg}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!copied) {
      try {
        const directCandidates = [
          path.join(repoRoot, "electron", "packaged-node_modules", "node_modules", ...pkg.split("/")),
          path.join(repoRoot, "node_modules", ...pkg.split("/")),
        ];
        let resolvedDir = directCandidates.find((d) => fs.existsSync(path.join(d, "package.json"))) || "";
        if (!resolvedDir) {
          try {
            resolvedDir = path.dirname(getRepoRequire().resolve(`${pkg}/package.json`));
          } catch {
            const tarPkgJson = path.join(repoRoot, "node_modules", "tar", "package.json");
            if (fs.existsSync(tarPkgJson)) {
              const tarReq = createRequire(tarPkgJson);
              try {
                resolvedDir = path.dirname(tarReq.resolve(`${pkg}/package.json`));
              } catch {
                const entry = tarReq.resolve(pkg);
                let cur = path.dirname(entry);
                while (cur && cur !== path.dirname(cur)) {
                  if (fs.existsSync(path.join(cur, "package.json"))) {
                    resolvedDir = cur;
                    break;
                  }
                  cur = path.dirname(cur);
                }
              }
            }
          }
        }
        if (!resolvedDir) {
          throw new Error(`Cannot locate package directory for ${pkg}`);
        }
        fs.mkdirSync(path.dirname(destPkgDir), { recursive: true });
        fs.cpSync(resolvedDir, destPkgDir, { recursive: true, force: true, dereference: true });
        synced.push(`${pkg} (node_modules)`);
      } catch (err) {
        errors.push(`${pkg}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { ok: errors.length === 0, synced, errors, targetNodeModules };
}
const installResources =
  process.env.STEALTH_RESOURCES_DIR ||
  "C:\\Users\\CzP\\AppData\\Local\\Programs\\stealth-browser-console\\resources";
const hotPatchRoot = path.join(installResources, "hot-patch");

async function updateStagedAsarFromHotPatch() {
  try {
    const helperUrl = pathToFileURL(path.resolve(srcRoot, "..", "scripts", "lib", "desktop-hot-patch.mjs")).href;
    const { stageAsarFromHotPatch } = await import(helperUrl);
    return stageAsarFromHotPatch({
      resourcesDir: installResources,
      hotPatchRoot,
      productRoot: srcRoot,
      exeName: "Stealth Browser Console.exe",
      swapIfIdle: false,
    });
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

function copyFileAtomicIfChanged(srcFile, dstFile) {
  const srcBuf = fs.readFileSync(srcFile);
  if (fs.existsSync(dstFile)) {
    try {
      const dstBuf = fs.readFileSync(dstFile);
      if (srcBuf.equals(dstBuf)) return false;
    } catch {
      /* re-write on read error */
    }
  }
  fs.mkdirSync(path.dirname(dstFile), { recursive: true });
  const tmpFile = `${dstFile}.tmp-${process.pid}-${Date.now()}`;
  try {
    const fd = fs.openSync(tmpFile, "w");
    try {
      fs.writeSync(fd, srcBuf, 0, srcBuf.length, 0);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpFile, dstFile);
  } catch (err) {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    throw err;
  }
  return true;
}

function syncTargetAtomicIfChanged(from, to, filter) {
  if (typeof filter === "function" && !filter(from)) return 0;
  const st = fs.statSync(from);
  if (st.isFile()) {
    return copyFileAtomicIfChanged(from, to) ? 1 : 0;
  }
  if (!st.isDirectory()) return 0;
  fs.mkdirSync(to, { recursive: true });
  let updated = 0;
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const childFrom = path.join(from, ent.name);
    const childTo = path.join(to, ent.name);
    if (ent.isDirectory()) {
      updated += syncTargetAtomicIfChanged(childFrom, childTo, filter);
    } else if (ent.isFile()) {
      if (typeof filter === "function" && !filter(childFrom)) continue;
      if (copyFileAtomicIfChanged(childFrom, childTo)) updated += 1;
    }
  }
  return updated;
}

    const targets = ["electron", "dist", "package.json", "tool.manifest.json", "CHANGELOG.md"];
    const synced = [];
    const syncFilter = (src) => {
      const norm = src.replace(/\\/g, "/");
      if (norm.includes("/packaged-node_modules")) return false;
      if (/\/(?:__tests__|e2e)\//i.test(norm) || /\.test\.(?:[cm]?js|tsx?)$/i.test(norm)) return false;
      return true;
    };
    for (const rel of targets) {
      const from = path.join(srcRoot, rel);
      const to = path.join(hotPatchRoot, rel);
      if (!fs.existsSync(from)) continue;
      syncTargetAtomicIfChanged(from, to, syncFilter);
      synced.push(rel);
    }
    const staleHotPatchPackagedNm = path.join(hotPatchRoot, "electron", "packaged-node_modules");
    if (fs.existsSync(staleHotPatchPackagedNm)) {
      try {
        fs.rmSync(staleHotPatchPackagedNm, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
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

    const unpackedCloakSynced = ensureUnpackedCloakbrowserSynced({
      repoRoot: srcRoot,
      installResourcesDir: installResources,
    });

    const bundledExtensionsSynced = [];
    try {
      const asarSrc = path.join(srcRoot, "build", "bundled-extensions.asar");
      const asarDest = path.join(installResources, "bundled-extensions.asar");
      const legacyDir = path.join(installResources, "bundled-extensions");
      if (fs.existsSync(asarSrc)) {
        fs.copyFileSync(asarSrc, asarDest);
        if (fs.existsSync(legacyDir)) {
          try {
            fs.rmSync(legacyDir, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
        bundledExtensionsSynced.push("bundled-extensions.asar");
      } else {
        const repoRoot = path.resolve(srcRoot, "..", "..");
        const { shouldCopyExtensionEntry } = require(path.join(srcRoot, "electron", "lib", "cloakbrowser-extension-stage.cjs"));
        for (const extFolder of ["E0001-cookie-bridge", "E0002-browser-operator"]) {
          const extSrc = path.join(repoRoot, "Extension", extFolder);
          if (!fs.existsSync(path.join(extSrc, "manifest.json"))) continue;
          const extDest = path.join(legacyDir, extFolder);
          fs.mkdirSync(extDest, { recursive: true });
          fs.cpSync(extSrc, extDest, {
            recursive: true,
            force: true,
            filter: (src) => {
              const rel = path.relative(extSrc, src).replace(/\\/g, "/");
              return !rel || shouldCopyExtensionEntry(rel);
            },
          });
          bundledExtensionsSynced.push(extFolder);
        }
      }
    } catch {
      /* ignore */
    }

    const stageAsar = process.argv.includes("--stage-asar");
    const stagedPath = path.join(installResources, "app.asar.staged");
    let stagedAsarResult = { ok: true, skipped: true, reason: "hot_patch_dir_active" };
    if (stageAsar) {
      stagedAsarResult = await updateStagedAsarFromHotPatch();
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
          unpackedCloakSynced,
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

module.exports = { ensureUnpackedCloakbrowserSynced };

if (require.main === module) {
  main().catch((err) => {
    console.error("[sync-hot-patch] error:", err);
    process.exit(1);
  });
}
