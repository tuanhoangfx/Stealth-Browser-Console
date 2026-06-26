#!/usr/bin/env node
/**
 * Pin current desktop build as known-good rollback target.
 * Copies installer (or win-unpacked) → dist-desktop/known-good/ + updates config/known-good.json.
 *
 * Usage:
 *   node scripts/snapshot-known-good.mjs
 *   node scripts/snapshot-known-good.mjs --label 2026-06-26-stable
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "config", "known-good.json");
const labelArg = process.argv.includes("--label")
  ? process.argv[process.argv.indexOf("--label") + 1]
  : "";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sha512File(file) {
  const hash = createHash("sha512");
  hash.update(fs.readFileSync(file));
  return hash.digest("base64");
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

function gitHead() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function gitDirty() {
  const r = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  return Boolean(r.stdout?.trim());
}

const pkg = readJson(path.join(root, "package.json"));
const version = pkg.version;
const distDesktop = path.join(root, "dist-desktop");
const backupRoot = path.join(distDesktop, "known-good");
const installerName = `Stealth-Browser-Console-Setup-${version}.exe`;
const installerSrc = path.join(distDesktop, installerName);
const unpackedSrc = path.join(distDesktop, "win-unpacked");
const cfg = fs.existsSync(configPath) ? readJson(configPath) : { schemaVersion: 1 };

fs.mkdirSync(backupRoot, { recursive: true });

let sha512 = null;

if (fs.existsSync(installerSrc)) {
  const backupInstaller = path.join(backupRoot, installerName);
  fs.copyFileSync(installerSrc, backupInstaller);
  sha512 = sha512File(backupInstaller);
  console.log(`snapshot-known-good: copied installer → ${path.relative(root, backupInstaller)}`);
} else {
  console.warn(`snapshot-known-good: no installer at ${path.relative(root, installerSrc)}`);
}

if (fs.existsSync(unpackedSrc)) {
  const backupUnpacked = path.join(backupRoot, "win-unpacked");
  fs.rmSync(backupUnpacked, { recursive: true, force: true });
  copyDir(unpackedSrc, backupUnpacked);
  console.log(`snapshot-known-good: copied win-unpacked → ${path.relative(root, backupUnpacked)}`);
} else {
  console.warn("snapshot-known-good: no dist-desktop/win-unpacked — run pnpm desktop:dist first");
}

const head = gitHead();
const dirty = gitDirty();
if (dirty) {
  console.warn("snapshot-known-good: working tree is DIRTY — commit+tag before relying on git rollback");
}

const next = {
  ...cfg,
  schemaVersion: 1,
  label: labelArg || cfg.label || `stable-${version}`,
  version,
  gitCommit: dirty ? null : head,
  gitTag: cfg.gitTag || `v${version}-stable`,
  backup: {
    dir: "dist-desktop/known-good",
    installer: installerName,
    winUnpacked: "win-unpacked",
    sha512,
    capturedAt: new Date().toISOString(),
  },
};

writeJson(configPath, next);
console.log(`snapshot-known-good: wrote ${path.relative(root, configPath)}`);
console.log(JSON.stringify({ version, gitCommit: next.gitCommit, gitDirty: dirty, sha512: sha512 ? `${sha512.slice(0, 16)}…` : null }, null, 2));

if (!fs.existsSync(installerSrc) && !fs.existsSync(unpackedSrc)) {
  process.exit(1);
}
