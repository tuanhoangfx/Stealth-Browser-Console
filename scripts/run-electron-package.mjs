#!/usr/bin/env node
/**
 * Icon sync + production build + electron-builder (Windows NSIS x64 by default).
 * Stages in %TEMP% first — avoids Windows EPERM when renaming win-unpacked inside the repo.
 *
 * Flags:
 *   --publish never|always
 *   --target dir
 *   --with-portable   also build portable exe (slower; ~doubles pack+sign+upload)
 *   --skip-build      reuse dist/ when index.html exists
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNodeExe, winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = resolveNodeExe();
const productOutput = path.join(root, "dist-desktop");

const publish =
  process.argv.includes("--publish") && process.argv[process.argv.indexOf("--publish") + 1]
    ? process.argv[process.argv.indexOf("--publish") + 1]
    : "never";
const targetDir = process.argv.includes("--target") && process.argv[process.argv.indexOf("--target") + 1] === "dir";
const withPortable = process.argv.includes("--with-portable");
const skipBuild = process.argv.includes("--skip-build");

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

function pruneStaleDesktopArtifacts(outputDir, version) {
  if (!fs.existsSync(outputDir)) return;
  for (const name of fs.readdirSync(outputDir)) {
    const full = path.join(outputDir, name);
    if (!fs.statSync(full).isFile()) continue;
    if (name === "latest.yml") continue;
    const staleSetup =
      /^Stealth-Browser-Console-Setup-/.test(name) && !name.includes(`-${version}.`);
    const stalePortable =
      /^Stealth-Browser-Console-Portable-/.test(name) && !name.includes(`-${version}.`);
    if (staleSetup || stalePortable) {
      fs.unlinkSync(full);
      console.log(`run-electron-package: removed stale artifact ${name}`);
    }
  }
}

function promoteStagingToProductOutput(stagingOutput, productOutput, version) {
  fs.mkdirSync(productOutput, { recursive: true });
  const pendingUnpacked = path.join(productOutput, "win-unpacked-pending");
  const targetUnpacked = path.join(productOutput, "win-unpacked");
  const marker = path.join(productOutput, "PENDING_UNPACKED.json");

  const setupExe = `Stealth-Browser-Console-Setup-${version}.exe`;
  const setupBlockmap = `${setupExe}.blockmap`;

  for (const name of [setupExe, setupBlockmap, "latest.yml"]) {
    const src = path.join(stagingOutput, name);
    if (fs.existsSync(src) && fs.statSync(src).isFile()) {
      copyFileWithRetry(src, path.join(productOutput, name));
    }
  }

  pruneStaleDesktopArtifacts(productOutput, version);

  const stagedUnpacked = path.join(stagingOutput, "win-unpacked");
  if (!fs.existsSync(stagedUnpacked)) return;

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
          version,
          stagedAt: new Date().toISOString(),
          hint: "Close packaged Stealth only if you need win-unpacked replaced, then: pnpm desktop:swap-unpacked",
        },
        null,
        2,
      ),
    );
  }
}

function distFresh() {
  const index = path.join(root, "dist", "index.html");
  if (!fs.existsSync(index)) return false;
  const built = fs.statSync(index).mtimeMs;
  const viteConfig = path.join(root, "vite.config.ts");
  const srcApp = path.join(root, "src", "App.tsx");
  const newestSrc = Math.max(fs.statSync(viteConfig).mtimeMs, fs.statSync(srcApp).mtimeMs);
  return built >= newestSrc;
}

function removeStaleReleaseAssets(tag, version) {
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
    `Stealth-Browser-Console-Setup-${version}.exe`,
    `Stealth-Browser-Console-Setup-${version}.exe.blockmap`,
    `Stealth-Browser-Console-Portable-${version}.exe`,
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

function uploadReleaseAssets(tag, version, files) {
  const present = files.filter((f) => fs.existsSync(f));
  if (present.length === 0) return;
  removeStaleReleaseAssets(tag, version);
  console.log(`\n==> gh release upload ${tag} (${present.length} assets)`);
  const res = spawnSync("gh", ["release", "upload", tag, ...present, "--clobber"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function uploadMissingAssets(tag, files, version) {
  uploadReleaseAssets(tag, version, files);
}

function ensureGitHubRelease(tag, version) {
  const view = spawnSync("gh", ["release", "view", tag], {
    cwd: root,
    stdio: "ignore",
    shell: false,
  });
  if (view.status === 0) return;
  console.log(`\n==> gh release create ${tag}`);
  const res = spawnSync(
    "gh",
    ["release", "create", tag, "--title", version, "--notes", `Desktop release ${tag}. See CHANGELOG.md.`],
    { cwd: root, stdio: "inherit", shell: false },
  );
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function collectPublishArtifacts(outputDir, version, withPortableFlag) {
  const files = [];
  const setup = path.join(outputDir, `Stealth-Browser-Console-Setup-${version}.exe`);
  const blockmap = `${setup}.blockmap`;
  const latest = path.join(outputDir, "latest.yml");
  if (fs.existsSync(setup)) files.push(setup);
  if (fs.existsSync(blockmap)) files.push(blockmap);
  if (fs.existsSync(latest)) files.push(latest);
  if (withPortableFlag) {
    const portable = path.join(outputDir, `Stealth-Browser-Console-Portable-${version}.exe`);
    if (fs.existsSync(portable)) files.push(portable);
  }
  return files;
}

runNodeScript("scripts/sync-app-icon.cjs");

if (!skipBuild || !distFresh()) {
  runNodeScript("scripts/run-build.mjs");
} else {
  console.log("run-electron-package: skip run-build.mjs (dist/ fresh, --skip-build)");
}

if (process.platform === "win32") {
  const ensureVs = spawnSync(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "ensure-vs-build-tools.ps1")],
    winSpawnOpts({ cwd: root, stdio: "inherit" }),
  );
  if ((ensureVs.status ?? 1) !== 0) process.exit(ensureVs.status ?? 1);
  runNodeScript("scripts/ensure-better-sqlite3.mjs");
}

runNodeScript("scripts/write-updater-auth.mjs");
runNodeScript("scripts/stage-packaged-node-modules.mjs");

const stagingOutput = path.join(os.tmpdir(), `p0003-eb-${Date.now()}`);
rmDir(stagingOutput);

const winTargets = withPortable ? ["nsis", "portable"] : ["nsis"];
// electron-builder publish per target caused duplicate GitHub releases (nsis + portable).
// Package locally with --publish never; upload once via gh CLI below.
const builderPublish = publish === "always" ? "never" : publish;
const builderArgs = [
  ...(targetDir ? ["--dir"] : ["--win", ...winTargets, "--x64"]),
  "--publish",
  builderPublish,
  `--config.directories.output=${stagingOutput}`,
];

console.log(
  `run-electron-package: targets=${targetDir ? "dir" : winTargets.join("+")} builder-publish=${builderPublish}${publish === "always" ? " (gh upload after pack)" : ""}${withPortable ? " (portable adds ~3–5 min)" : ""}`,
);

const result = spawnSync(node, [findElectronBuilder(), ...builderArgs], winSpawnOpts({ cwd: root, stdio: "inherit" }));
if ((result.status ?? 1) !== 0) {
  rmDir(stagingOutput);
  process.exit(result.status ?? 1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

promoteStagingToProductOutput(stagingOutput, productOutput, version);
rmDir(stagingOutput);

runNodeScript("scripts/verify-packaged-unpacked.mjs");

const tag = `v${version}`;

const setup = path.join(productOutput, `Stealth-Browser-Console-Setup-${version}.exe`);
const portable = withPortable
  ? path.join(productOutput, `Stealth-Browser-Console-Portable-${version}.exe`)
  : null;
const latestYml = path.join(productOutput, "latest.yml");

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
  uploadMissingAssets(tag, uploadFiles, version);
  runNodeScript("scripts/dedupe-github-releases.mjs", ["--tag", tag]);

  const verifyArgs = ["--tag", tag];
  if (withPortable) verifyArgs.push("--require-portable");
  runNodeScript("scripts/verify-github-release-assets.mjs", verifyArgs);
}

process.exit(0);
