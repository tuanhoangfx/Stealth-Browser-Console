#!/usr/bin/env node
/** Hash electron main sources — bump patch + kill stale dev when changed (Rules: version sync + reload). */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stampDir = path.join(root, ".dev");
const stampFile = path.join(stampDir, "electron.sha");

function walkCjs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkCjs(abs, out);
    else if (entry.name.endsWith(".cjs")) out.push(abs);
  }
  return out;
}

function hashElectron() {
  const files = walkCjs(path.join(root, "electron")).sort();
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file.slice(root.length));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

function bumpPatchVersion() {
  const pkgPath = path.join(root, "package.json");
  const manifestPath = path.join(root, "tool.manifest.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const parts = String(pkg.version || "0.0.0").split(".").map(Number);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  const next = parts.join(".");
  pkg.version = next;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.release) manifest.release.version = next;
    manifest.manifestUpdatedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  const changelogPath = path.join(root, "CHANGELOG.md");
  if (fs.existsSync(changelogPath)) {
    const block = [
      "",
      `## ${new Date().toISOString().slice(0, 10)} — v${next} — Electron dev reload`,
      "",
      `- Version: \`${next}\``,
      `- Timestamp: ${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 5)} (UTC+7)`,
      "- Type: Patch",
      "- Status: Dev",
      "",
      "### Changes",
      "",
      "- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).",
      "",
    ].join("\n");
    const raw = fs.readFileSync(changelogPath, "utf8");
    const idx = raw.indexOf("\n## ");
    const head = raw.slice(0, raw.indexOf("\n", raw.indexOf("# ")) + 1);
    const rest = idx >= 0 ? raw.slice(idx) : raw.slice(head.length);
    fs.writeFileSync(changelogPath, `${head}${block}${rest}`, "utf8");
  }

  console.log(`electron-dev-gate: bumped version → v${next}`);
  return next;
}

function killDevPort() {
  const kill = path.join(root, "scripts", "kill-port.cjs");
  if (!fs.existsSync(kill)) return;
  spawnSync(process.execPath, [kill, "5175"], winSpawnOpts({ cwd: root, stdio: "inherit" }));
}

function main() {
  const force = process.env.STEALTH_DEV_FORCE_RELOAD === "1";
  const nextHash = hashElectron();
  const prev = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, "utf8").trim() : "";
  if (!force && prev === nextHash) {
    console.log("electron-dev-gate: unchanged — skip bump/reload");
    return;
  }
  fs.mkdirSync(stampDir, { recursive: true });
  fs.writeFileSync(stampFile, `${nextHash}\n`, "utf8");
  bumpPatchVersion();
  spawnSync(process.execPath, [path.join(root, "scripts", "sync-app-version.mjs")], winSpawnOpts({
    cwd: root,
    stdio: "inherit",
  }));
  killDevPort();
  console.log("electron-dev-gate: electron sources changed — version bumped, port 5175 freed");
}

main();
