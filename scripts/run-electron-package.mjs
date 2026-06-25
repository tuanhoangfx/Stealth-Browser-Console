#!/usr/bin/env node
/**
 * Icon sync + production build + electron-builder (Windows NSIS x64).
 * Stages in %TEMP% first — avoids Windows EPERM when renaming win-unpacked inside the repo.
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
    else fs.copyFileSync(from, to);
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

runNodeScript("scripts/sync-app-icon.cjs");
runNodeScript("scripts/run-build.mjs");

if (process.platform === "win32") {
  const ensureVs = spawnSync(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "ensure-vs-build-tools.ps1")],
    winSpawnOpts({ cwd: root, stdio: "inherit" }),
  );
  if ((ensureVs.status ?? 1) !== 0) process.exit(ensureVs.status ?? 1);
  runNodeScript("scripts/ensure-better-sqlite3.mjs");
}

const stagingOutput = path.join(os.tmpdir(), `p0003-eb-${Date.now()}`);
rmDir(stagingOutput);

const builderArgs = [
  ...(targetDir ? ["--dir"] : ["--win", "nsis", "portable", "--x64"]),
  "--publish",
  publish,
  `--config.directories.output=${stagingOutput}`,
];

const result = spawnSync(node, [findElectronBuilder(), ...builderArgs], winSpawnOpts({ cwd: root, stdio: "inherit" }));
if ((result.status ?? 1) !== 0) {
  rmDir(stagingOutput);
  process.exit(result.status ?? 1);
}

copyDirBestEffort(stagingOutput, productOutput);
rmDir(stagingOutput);

const setup = fs
  .readdirSync(productOutput)
  .find((name) => name.startsWith("Stealth-Browser-Console-Setup-") && name.endsWith(".exe"));
const portable = fs
  .readdirSync(productOutput)
  .find((name) => name.startsWith("Stealth-Browser-Console-Portable-") && name.endsWith(".exe"));
if (setup) {
  const full = path.join(productOutput, setup);
  const mb = (fs.statSync(full).size / (1024 * 1024)).toFixed(1);
  console.log(`\nDesktop installer:\n  ${full}\n  (${mb} MB)`);
}
if (portable) {
  const full = path.join(productOutput, portable);
  const mb = (fs.statSync(full).size / (1024 * 1024)).toFixed(1);
  console.log(`Portable (no admin):\n  ${full}\n  (${mb} MB)\n`);
} else if (setup) {
  console.log("");
}

process.exit(0);
