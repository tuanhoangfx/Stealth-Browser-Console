#!/usr/bin/env node
/**
 * Icon sync + production build + electron-builder (Windows NSIS x64 by default).
 * Stages in %TEMP% first — avoids Windows EPERM when renaming win-unpacked inside the repo.
 *
 * Flags:
 *   --publish never|always
 *   --target dir
 *   --with-portable   also build portable exe (slower; ~doubles pack+sign+upload)
 *   --skip-build      reuse dist/ when index.html exists (release-desktop Fast owns Vite)
 *   --installer-only  or DESKTOP_RELEASE_INSTALLER_ONLY=1 — promote Setup+yml only; keep warm win-unpacked
 *
 * Fast (DESKTOP_RELEASE_FAST=1): skip Authenticode unless DESKTOP_RELEASE_SIGN=1;
 * prefer --prepackaged NSIS after refreshing app.asar dist/ from Vite out.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNodeExe, winSpawnOpts } from "./lib/win-spawn.mjs";

const require = createRequire(import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = resolveNodeExe();
const productOutput = path.join(root, "dist-desktop");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = process.env.STEALTH_RELEASE_VERSION?.trim() || pkg.version;

const publish =
  process.argv.includes("--publish") && process.argv[process.argv.indexOf("--publish") + 1]
    ? process.argv[process.argv.indexOf("--publish") + 1]
    : "never";
const targetDir = process.argv.includes("--target") && process.argv[process.argv.indexOf("--target") + 1] === "dir";
const withPortable = process.argv.includes("--with-portable");
const skipBuild = process.argv.includes("--skip-build");
const installerOnly =
  process.argv.includes("--installer-only") || process.env.DESKTOP_RELEASE_INSTALLER_ONLY === "1";
const fastMode = installerOnly || process.env.DESKTOP_RELEASE_FAST === "1";

function runNodeScript(rel, extraArgs = []) {
  const result = spawnSync(node, [path.join(root, rel), ...extraArgs], winSpawnOpts({ cwd: root, stdio: "inherit" }));
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

function findElectronBuilder() {
  let dir = root;
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "node_modules", "electron-builder", "cli.js");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("electron-builder not found — run pnpm install");
}

/** electron-builder's node-module-collector shells `pnpm` from PATH — Node's corepack shim is often broken. */
function resolvePnpmCjs() {
  const toolWinShell = path.join(root, "..", "scripts", "lib", "win-shell-env.cjs");
  if (fs.existsSync(toolWinShell)) {
    try {
      const pnpmCjs = require(toolWinShell).findPnpmCjs(root);
      if (pnpmCjs && fs.existsSync(pnpmCjs)) return pnpmCjs;
    } catch {
      /* ignore */
    }
  }
  const fallback = path.join(root, "..", "scripts", ".tools", "pnpm", "9.15.9", "package", "bin", "pnpm.cjs");
  return fs.existsSync(fallback) ? fallback : "";
}

function ensureWorkingPnpmOnPath(env) {
  if (process.platform !== "win32") return env;
  const pnpmCjs = resolvePnpmCjs();
  if (!pnpmCjs) {
    console.warn("run-electron-package: no working pnpm.cjs — electron-builder may fail on broken corepack shim");
    return env;
  }
  const shimDir = path.join(os.tmpdir(), "p0003-pnpm-path-shim");
  fs.mkdirSync(shimDir, { recursive: true });
  fs.writeFileSync(path.join(shimDir, "pnpm.cmd"), `@echo off\r\n"${node}" "${pnpmCjs}" %*\r\n`, "utf8");
  console.log(`run-electron-package: PATH pnpm shim → ${pnpmCjs}`);
  return { ...env, PATH: `${shimDir};${env.PATH || process.env.PATH || ""}` };
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else copyFileWithRetry(from, to);
  }
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function copyFileWithRetry(from, to, attempts = 5) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  for (let i = 0; i < attempts; i++) {
    try {
      fs.copyFileSync(from, to);
      return;
    } catch (e) {
      const code = e && typeof e === "object" ? e.code : "";
      if ((code === "EBUSY" || code === "EPERM") && i < attempts - 1) {
        sleepMs(400);
        continue;
      }
      throw e;
    }
  }
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (e) {
    const code = e && typeof e === "object" ? e.code : "";
    if (code === "EPERM" || code === "EBUSY") {
      console.warn(`run-electron-package: skip rm ${dir} (${code})`);
      return;
    }
    throw e;
  }
}

function copyDirBestEffort(src, dest) {
  rmDir(dest);
  copyDir(src, dest);
}

function pruneStaleDesktopArtifacts(outputDir, ver) {
  if (!fs.existsSync(outputDir)) return;
  for (const name of fs.readdirSync(outputDir)) {
    const full = path.join(outputDir, name);
    if (!fs.statSync(full).isFile()) continue;
    if (name === "latest.yml") continue;
    const staleSetup =
      /^Stealth-Browser-Console-Setup-/.test(name) && !name.includes(`-${ver}.`);
    const stalePortable =
      /^Stealth-Browser-Console-Portable-/.test(name) && !name.includes(`-${ver}.`);
    if (staleSetup || stalePortable) {
      fs.unlinkSync(full);
      console.log(`run-electron-package: removed stale artifact ${name}`);
    }
  }
}

function promoteStagingToProductOutput(stagingOutput, ver) {
  fs.mkdirSync(productOutput, { recursive: true });
  const pendingUnpacked = path.join(productOutput, "win-unpacked-pending");
  const targetUnpacked = path.join(productOutput, "win-unpacked");
  const marker = path.join(productOutput, "PENDING_UNPACKED.json");

  const setupExe = `Stealth-Browser-Console-Setup-${ver}.exe`;
  const setupBlockmap = `${setupExe}.blockmap`;

  for (const name of [setupExe, setupBlockmap, "latest.yml"]) {
    const src = path.join(stagingOutput, name);
    if (fs.existsSync(src) && fs.statSync(src).isFile()) {
      copyFileWithRetry(src, path.join(productOutput, name));
    }
  }

  pruneStaleDesktopArtifacts(productOutput, ver);

  const stagedUnpacked = path.join(stagingOutput, "win-unpacked");
  if (!fs.existsSync(stagedUnpacked)) return;

  if (installerOnly) {
    console.log("run-electron-package: installer-only — skip full win-unpacked promote (Fast path)");
    const seedExe = path.join(targetUnpacked, "Stealth Browser Console.exe");
    if (!fs.existsSync(seedExe)) {
      try {
        copyDir(stagedUnpacked, targetUnpacked);
        console.log("run-electron-package: seeded win-unpacked for next Fast prepackaged");
      } catch (e) {
        console.warn(`run-electron-package: seed win-unpacked skipped (${e && e.message})`);
      }
    } else {
      // Keep warm tree's shell icon current — otherwise next --prepackaged re-ships Electron atom.
      try {
        const srcIco = path.join(stagedUnpacked, "resources", "app.ico");
        const dstIco = path.join(targetUnpacked, "resources", "app.ico");
        if (fs.existsSync(srcIco)) {
          fs.mkdirSync(path.dirname(dstIco), { recursive: true });
          fs.copyFileSync(srcIco, dstIco);
        }
        const srcExe = path.join(stagedUnpacked, "Stealth Browser Console.exe");
        if (fs.existsSync(srcExe)) {
          fs.copyFileSync(srcExe, seedExe);
          console.log("run-electron-package: refreshed warm exe + resources/app.ico (shell icon)");
        }
      } catch (e) {
        console.warn(
          `run-electron-package: warm shell-icon refresh skipped (${e && e.message}) — close packaged Stealth if EPERM`,
        );
      }
    }
    return;
  }

  try {
    copyDirBestEffort(stagedUnpacked, targetUnpacked);
    rmDir(pendingUnpacked);
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
  } catch (e) {
    const code = e && typeof e === "object" ? e.code : "";
    if (code !== "EBUSY" && code !== "EPERM") throw e;
    console.warn(
      "run-electron-package: win-unpacked is locked (packaged exe may be running). " +
        "Staged copy → dist-desktop/win-unpacked-pending (dev + running exe untouched).",
    );
    rmDir(pendingUnpacked);
    copyDir(stagedUnpacked, pendingUnpacked);
    fs.writeFileSync(
      marker,
      JSON.stringify(
        {
          version: ver,
          stagedAt: new Date().toISOString(),
          hint: "Close packaged Stealth only if you need win-unpacked replaced, then: pnpm desktop:swap-unpacked",
        },
        null,
        2,
      ),
    );
  }
}

function assertUiVersionBaked() {
  const distAssets = path.join(root, "dist", "assets");
  if (!fs.existsSync(path.join(root, "dist", "index.html")) || !fs.existsSync(distAssets)) {
    console.error("run-electron-package: FAIL — dist/ missing. Run Vite build first.");
    process.exit(1);
  }
  let hit = false;
  for (const name of fs.readdirSync(distAssets)) {
    if (!name.endsWith(".js")) continue;
    const text = fs.readFileSync(path.join(distAssets, name), "utf8");
    if (text.includes(version)) {
      hit = true;
      break;
    }
  }
  if (!hit) {
    console.error(
      `run-electron-package: FAIL — Vite dist does not contain package version ${version}. Re-run build after bumping version.`,
    );
    process.exit(1);
  }
  console.log(`run-electron-package: UI dist contains version ${version}`);
}

function refreshUnpackedAppAsar(unpackedDir) {
  const asarPath = path.join(unpackedDir, "resources", "app.asar");
  if (!fs.existsSync(asarPath)) {
    throw new Error(`run-electron-package: missing ${asarPath} for Fast prepackaged refresh`);
  }

  // Sync check via nested node (extractFile is sync in @electron/asar).
  let asarApi = null;
  try {
    asarApi = require("@electron/asar");
  } catch {
    throw new Error("run-electron-package: @electron/asar required for Fast prepackaged UI refresh");
  }

  try {
    const raw = asarApi.extractFile(asarPath, "package.json");
    const asarPkg = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
    const distIndex = path.join(root, "dist", "index.html");
    let hasShellIcon = false;
    try {
      const ico = asarApi.extractFile(asarPath, "build/icons/app.ico");
      hasShellIcon = Buffer.isBuffer(ico) ? ico.length >= 1024 : Buffer.byteLength(String(ico)) >= 1024;
    } catch {
      hasShellIcon = false;
    }
    if (
      hasShellIcon &&
      asarPkg.version === version &&
      fs.existsSync(distIndex) &&
      fs.statSync(distIndex).mtimeMs <= fs.statSync(asarPath).mtimeMs
    ) {
      const warm = path.join(os.tmpdir(), `p0003-app-warm-${Date.now()}.asar`);
      fs.copyFileSync(asarPath, warm);
      const appIcoSrc = path.join(root, "build", "icons", "app.ico");
      if (fs.existsSync(appIcoSrc)) {
        const appIcoDest = path.join(unpackedDir, "resources", "app.ico");
        fs.mkdirSync(path.dirname(appIcoDest), { recursive: true });
        fs.copyFileSync(appIcoSrc, appIcoDest);
      }
      console.log(`run-electron-package: skip asar rebuild (v${version}, dist older than asar, shell icon ok)`);
      return warm;
    }
    if (!hasShellIcon) {
      console.log("run-electron-package: app.asar missing build/icons/app.ico — forcing rebuild");
    }
  } catch {
    /* fall through to rebuild */
  }

  const tmp = path.join(os.tmpdir(), `p0003-asar-patch-${Date.now()}`);
  const tmpAsar = path.join(os.tmpdir(), `p0003-app-${Date.now()}.asar`);

  /** Rebuild asar payload from repo disk when extractAll fails (e.g. stale asarUnpack stubs). */
  function seedAsarTreeFromDisk(dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const rel of ["electron", "shared", "dist"]) {
      const src = path.join(root, rel);
      if (!fs.existsSync(src)) continue;
      const out = path.join(dest, rel);
      rmDir(out);
      copyDir(src, out);
    }
    const iconsSrc = path.join(root, "build", "icons");
    if (fs.existsSync(path.join(iconsSrc, "app.ico"))) {
      const iconsDest = path.join(dest, "build", "icons");
      rmDir(iconsDest);
      copyDir(iconsSrc, iconsDest);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    pkg.version = version;
    fs.writeFileSync(path.join(dest, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    const releaseMd = path.join(root, "RELEASE.md");
    if (fs.existsSync(releaseMd)) fs.copyFileSync(releaseMd, path.join(dest, "RELEASE.md"));
    console.log("run-electron-package: seeded app.asar tree from disk (electron/shared/dist/icons)");
  }

  try {
    asarApi.extractAll(asarPath, tmp);
  } catch (e) {
    console.warn(
      `run-electron-package: extractAll failed (${e && e.message}) — rebuilding asar from disk (prod exe left running)`,
    );
    rmDir(tmp);
    seedAsarTreeFromDisk(tmp);
  }
  const distDest = path.join(tmp, "dist");
  rmDir(distDest);
  copyDir(path.join(root, "dist"), distDest);
  // Always seed shell icons — BrowserWindow reads build/icons/app.ico from asar root.
  // Historical Fast trees omitted this path → blank title-bar / taskbar glyph.
  const iconsSrc = path.join(root, "build", "icons");
  if (fs.existsSync(path.join(iconsSrc, "app.ico"))) {
    const iconsDest = path.join(tmp, "build", "icons");
    fs.mkdirSync(path.dirname(iconsDest), { recursive: true });
    rmDir(iconsDest);
    copyDir(iconsSrc, iconsDest);
    console.log("run-electron-package: seeded build/icons into app.asar");
  } else {
    console.warn("run-electron-package: build/icons/app.ico missing — title-bar icon will be blank");
  }
  const pkgFile = path.join(tmp, "package.json");
  if (fs.existsSync(pkgFile)) {
    const asarPkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    if (asarPkg.version !== version) {
      asarPkg.version = version;
      fs.writeFileSync(pkgFile, `${JSON.stringify(asarPkg, null, 2)}\n`);
      console.log(`run-electron-package: patched app.asar package.json → ${version}`);
    }
  }
  // UI-only Fast: refresh dist. Main/shared need DESKTOP_RELEASE_REFRESH_MAIN=1 (or full pack).
  if (process.env.DESKTOP_RELEASE_REFRESH_MAIN === "1") {
    for (const rel of ["electron", "shared"]) {
      const src = path.join(root, rel);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(tmp, rel);
      rmDir(dest);
      copyDir(src, dest);
    }
    console.log("run-electron-package: refreshed electron+shared inside app.asar");
  }
  // @electron/asar createPackage is async — run via nested node so callers stay sync.
  const create = spawnSync(
    node,
    [
      "-e",
      `require("@electron/asar").createPackage(${JSON.stringify(tmp)}, ${JSON.stringify(tmpAsar)}).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });`,
    ],
    winSpawnOpts({ cwd: root, stdio: "inherit" }),
  );
  if ((create.status ?? 1) !== 0) {
    rmDir(tmp);
    throw new Error(`run-electron-package: createPackage failed (${tmpAsar})`);
  }
  rmDir(tmp);
  if (!fs.existsSync(tmpAsar) || fs.statSync(tmpAsar).size < 1024) {
    throw new Error(`run-electron-package: createPackage produced empty asar (${tmpAsar})`);
  }
  fs.mkdirSync(path.dirname(asarPath), { recursive: true });
  try {
    if (fs.existsSync(asarPath)) fs.unlinkSync(asarPath);
  } catch (e) {
    console.warn(`run-electron-package: could not unlink old asar (${e && e.message}) — overwrite`);
  }
  fs.copyFileSync(tmpAsar, asarPath);
  console.log(`run-electron-package: rebuilt app.asar (dist UI, ${(fs.statSync(asarPath).size / (1024 * 1024)).toFixed(1)} MB)`);

  // Outside-asar copy for NativeImage (Windows can be flaky reading .ico from asar).
  const appIcoSrc = path.join(root, "build", "icons", "app.ico");
  if (fs.existsSync(appIcoSrc)) {
    const appIcoDest = path.join(unpackedDir, "resources", "app.ico");
    fs.mkdirSync(path.dirname(appIcoDest), { recursive: true });
    fs.copyFileSync(appIcoSrc, appIcoDest);
    console.log("run-electron-package: wrote resources/app.ico (BrowserWindow fallback)");
  }

  const tokenSrc = path.join(root, "build", "updater-gh-token");
  if (fs.existsSync(tokenSrc)) {
    const tokenDest = path.join(unpackedDir, "resources", "updater-gh-token");
    try {
      if (fs.existsSync(tokenDest)) {
        const dstSt = fs.statSync(tokenDest);
        if (dstSt.isDirectory()) rmDir(tokenDest);
        else fs.unlinkSync(tokenDest);
      }
      fs.mkdirSync(path.dirname(tokenDest), { recursive: true });
      const st = fs.statSync(tokenSrc);
      if (st.isDirectory()) copyDir(tokenSrc, tokenDest);
      else copyFileWithRetry(tokenSrc, tokenDest);
    } catch (e) {
      console.warn(`run-electron-package: updater-gh-token refresh skipped (${e && e.message})`);
    }
  }
  return tmpAsar;
}

function removeStaleReleaseAssets(tag, ver) {
  const existing = spawnSync("gh", ["release", "view", tag, "--json", "assets"], {
    encoding: "utf8",
    shell: false,
    cwd: root,
  });
  if (existing.status !== 0) return;
  let assets = [];
  try {
    assets = JSON.parse(existing.stdout).assets || [];
  } catch {
    return;
  }
  const keep = new Set([
    `Stealth-Browser-Console-Setup-${ver}.exe`,
    `Stealth-Browser-Console-Setup-${ver}.exe.blockmap`,
    `Stealth-Browser-Console-Portable-${ver}.exe`,
    "latest.yml",
  ]);
  for (const asset of assets) {
    if (keep.has(asset.name)) continue;
    const stale =
      /^Stealth-Browser-Console-Setup-.*\.(exe|blockmap)$/i.test(asset.name) ||
      /^Stealth-Browser-Console-Portable-.*\.exe$/i.test(asset.name);
    if (!stale) continue;
    const id = asset.id || asset.apiUrl?.split("/").pop();
    if (!id) continue;
    console.log(`run-electron-package: remove stale release asset ${asset.name}`);
    spawnSync("gh", ["api", "-X", "DELETE", `repos/tuanhoangfx/Stealth-Browser-Console/releases/assets/${id}`], {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
  }
}

function uploadReleaseAssets(tag, ver, files) {
  const present = files.filter((f) => fs.existsSync(f));
  if (present.length === 0) return;
  removeStaleReleaseAssets(tag, ver);
  console.log(`\n==> gh release upload ${tag} (${present.length} assets)`);
  const res = spawnSync("gh", ["release", "upload", tag, ...present, "--clobber"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function ensureGitHubRelease(tag, ver) {
  const view = spawnSync("gh", ["release", "view", tag], {
    cwd: root,
    stdio: "ignore",
    shell: false,
  });
  if (view.status === 0) return;
  console.log(`\n==> gh release create ${tag}`);
  const res = spawnSync(
    "gh",
    ["release", "create", tag, "--title", ver, "--notes", `Desktop release ${tag}. See CHANGELOG.md.`],
    { cwd: root, stdio: "inherit", shell: false },
  );
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function collectPublishArtifacts(outputDir, ver, withPortableFlag) {
  const files = [];
  const setup = path.join(outputDir, `Stealth-Browser-Console-Setup-${ver}.exe`);
  const blockmap = `${setup}.blockmap`;
  const latest = path.join(outputDir, "latest.yml");
  if (fs.existsSync(setup)) files.push(setup);
  if (fs.existsSync(blockmap)) files.push(blockmap);
  if (fs.existsSync(latest)) files.push(latest);
  if (withPortableFlag) {
    const portable = path.join(outputDir, `Stealth-Browser-Console-Portable-${ver}.exe`);
    if (fs.existsSync(portable)) files.push(portable);
  }
  return files;
}

runNodeScript("scripts/sync-app-icon.cjs");

if (!skipBuild) {
  runNodeScript("scripts/run-build.mjs");
} else if (!fs.existsSync(path.join(root, "dist", "index.html"))) {
  console.log("run-electron-package: --skip-build but dist/ missing — building");
  runNodeScript("scripts/run-build.mjs");
} else {
  console.log("run-electron-package: skip run-build.mjs (--skip-build; release-desktop owns Vite)");
}

assertUiVersionBaked();

if (process.platform === "win32" && !fastMode) {
  const ensureVs = spawnSync(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "ensure-vs-build-tools.ps1")],
    winSpawnOpts({ cwd: root, stdio: "inherit" }),
  );
  if ((ensureVs.status ?? 1) !== 0) process.exit(ensureVs.status ?? 1);
  runNodeScript("scripts/ensure-better-sqlite3.mjs");
} else if (fastMode) {
  console.log("run-electron-package: skip VS/native rebuild (Fast)");
}

runNodeScript("scripts/write-updater-auth.mjs");

const unpackedLocal = path.join(productOutput, "win-unpacked");
const canPrepackaged =
  !targetDir &&
  !withPortable &&
  installerOnly &&
  process.env.DESKTOP_RELEASE_REUSE_UNPACKED !== "0" &&
  fs.existsSync(path.join(unpackedLocal, "Stealth Browser Console.exe")) &&
  fs.existsSync(path.join(unpackedLocal, "resources", "app.asar"));

if (!canPrepackaged) {
  runNodeScript("scripts/verify-cloakbrowser-esm-deps.mjs");
  runNodeScript("scripts/stage-packaged-node-modules.mjs");
} else {
  console.log("run-electron-package: skip cloak stage (Fast prepackaged reuses unpacked native tree)");
}

const stagingOutput = path.join(os.tmpdir(), `p0003-eb-${Date.now()}`);
rmDir(stagingOutput);

const winTargets = withPortable ? ["nsis", "portable"] : ["nsis"];
// electron-builder publish per target caused duplicate GitHub releases (nsis + portable).
// Package locally with --publish never; upload once via gh CLI below.
const builderPublish = publish === "always" ? "never" : publish;

const skipSign = process.env.DESKTOP_RELEASE_SIGN !== "1" && fastMode;
const builderEnv = ensureWorkingPnpmOnPath({ ...process.env });
if (skipSign) {
  // electron-builder 26: win.sign=false disables signtool (store certs still found otherwise).
  builderEnv.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  delete builderEnv.CSC_LINK;
  delete builderEnv.WIN_CSC_LINK;
  delete builderEnv.CSC_KEY_PASSWORD;
  delete builderEnv.WIN_CSC_KEY_PASSWORD;
  delete builderEnv.CSC_NAME;
  delete builderEnv.WIN_CSC_NAME;
  console.log("run-electron-package: skip code signing (set DESKTOP_RELEASE_SIGN=1 to enable)");
}

const builderArgs = [];
let asarWarmBackup = "";
if (canPrepackaged) {
  console.log(`run-electron-package: Fast prepackaged NSIS from ${unpackedLocal}`);
  asarWarmBackup = refreshUnpackedAppAsar(unpackedLocal);
  builderArgs.push("--prepackaged", unpackedLocal, "--win", "nsis", "--x64", "--publish", builderPublish);
} else {
  builderArgs.push(
    ...(targetDir ? ["--dir"] : ["--win", ...winTargets, "--x64"]),
    "--publish",
    builderPublish,
  );
}
builderArgs.push(`--config.directories.output=${stagingOutput}`);
if (skipSign) {
  // eb 26.15+: signExecutable=false skips Authenticode only.
  // Do NOT set signAndEditExecutable=false — that also skips rcedit icon/metadata
  // and leaves the default Electron atom on the exe (title-bar may still work via asar icon).
  builderArgs.push("--config.win.signExecutable=false");
}
if (fastMode && publish !== "always") {
  // store = no LZMA — package-only Fast ~45s. Publish keeps default compression (smaller feed).
  builderArgs.push("--config.compression=store");
  console.log("run-electron-package: Fast package-only → compression=store");
}

console.log(
  `run-electron-package: stage=${stagingOutput} target=${canPrepackaged ? "prepackaged-nsis" : targetDir ? "dir" : winTargets.join("+")} builder-publish=${builderPublish}${publish === "always" ? " (gh upload after pack)" : ""}${withPortable ? " (portable adds ~3–5 min)" : ""} version=${version}`,
);

const result = spawnSync(
  node,
  [findElectronBuilder(), ...builderArgs],
  winSpawnOpts({ cwd: root, stdio: "inherit", env: builderEnv }),
);
if (asarWarmBackup) {
  const asarPath = path.join(unpackedLocal, "resources", "app.asar");
  try {
    if (!fs.existsSync(asarPath) || fs.statSync(asarPath).size < 1024) {
      fs.mkdirSync(path.dirname(asarPath), { recursive: true });
      fs.copyFileSync(asarWarmBackup, asarPath);
      console.log("run-electron-package: restored warm app.asar after prepackaged NSIS");
    }
  } catch (e) {
    console.warn(`run-electron-package: warm asar restore failed (${e && e.message})`);
  }
  try {
    fs.unlinkSync(asarWarmBackup);
  } catch {
    /* ignore */
  }
}
if ((result.status ?? 1) !== 0) {
  rmDir(stagingOutput);
  process.exit(result.status ?? 1);
}

// Hard gate: never ship Electron default atom / missing BrowserWindow icon assets.
runNodeScript("scripts/smoke-packaged-shell-icon.mjs", ["--staging", stagingOutput]);

promoteStagingToProductOutput(stagingOutput, version);
rmDir(stagingOutput);

if (!canPrepackaged) {
  runNodeScript("scripts/verify-packaged-unpacked.mjs");
  runNodeScript("scripts/smoke-packaged-cloakbrowser-import.cjs");
  runNodeScript("scripts/smoke-asar-ps1-resolve.mjs");
} else {
  console.log("run-electron-package: skip cloak/ps1 smokes (Fast prepackaged); shell-icon smoke already ran");
}

const tag = `v${version}`;

const setup = path.join(productOutput, `Stealth-Browser-Console-Setup-${version}.exe`);
const portable = withPortable
  ? path.join(productOutput, `Stealth-Browser-Console-Portable-${version}.exe`)
  : null;

if (fs.existsSync(setup)) {
  const mb = (fs.statSync(setup).size / (1024 * 1024)).toFixed(1);
  console.log(`\nDesktop installer:\n  ${setup}\n  (${mb} MB)`);
}
if (portable && fs.existsSync(portable)) {
  const mb = (fs.statSync(portable).size / (1024 * 1024)).toFixed(1);
  console.log(`Portable (no admin):\n  ${portable}\n  (${mb} MB)\n`);
} else if (fs.existsSync(setup)) {
  console.log("");
}

if (publish === "always") {
  const uploadFiles = collectPublishArtifacts(productOutput, version, withPortable);
  ensureGitHubRelease(tag, version);
  uploadReleaseAssets(tag, version, uploadFiles);
  runNodeScript("scripts/dedupe-github-releases.mjs", ["--tag", tag]);

  const verifyArgs = ["--tag", tag];
  if (withPortable) verifyArgs.push("--require-portable");
  runNodeScript("scripts/verify-github-release-assets.mjs", verifyArgs);
}

process.exit(0);
