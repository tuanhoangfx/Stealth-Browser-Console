#!/usr/bin/env node
/**
 * Verify GitHub Release has required NSIS installer + latest.yml (portable optional).
 * Usage: node scripts/verify-github-release-assets.mjs [--tag vX.Y.Z] [--require-portable]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { readJson } = require("../../scripts/lib/version-sync-lib.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { tag: "", requirePortable: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag" && argv[i + 1]) opts.tag = argv[++i];
    else if (a === "--require-portable") opts.requirePortable = true;
  }
  return opts;
}

function ghToken() {
  const fromEnv = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  const res = spawnSync("gh", ["auth", "token"], { encoding: "utf8", shell: process.platform === "win32" });
  if (res.status !== 0) throw new Error("gh auth token failed");
  return String(res.stdout || "").trim();
}

function assertAsset(assets, pattern, label, minBytes = 1_000_000) {
  const asset = assets.find((a) => pattern.test(a.name));
  if (!asset) {
    console.error(`FAIL: ${label} missing on release`);
    process.exit(1);
  }
  if (asset.state && asset.state !== "uploaded") {
    console.error(`FAIL: ${label} state=${asset.state}`);
    process.exit(1);
  }
  if (Number(asset.size || 0) < minBytes) {
    console.error(`FAIL: ${label} too small (${asset.size} bytes)`);
    process.exit(1);
  }
  console.log(`OK ${label}: ${asset.name} (${asset.size} bytes)`);
  return asset;
}

async function main() {
  const opts = parseArgs(process.argv);
  const pkg = readJson(path.join(root, "package.json"));
  const manifest = readJson(path.join(root, "tool.manifest.json")) || {};
  const version = String(pkg?.version || "").trim();
  const repo = String(manifest.github?.repo || "").trim();
  const tag = opts.tag || (version ? `v${version}` : "");

  if (!version || !repo || !tag) {
    console.error("verify-github-release-assets: need version, github.repo, tag");
    process.exit(1);
  }

  const token = ghToken();
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    console.error(`FAIL: release ${tag} HTTP ${res.status}`);
    process.exit(1);
  }

  const release = await res.json();
  const assets = Array.isArray(release.assets) ? release.assets : [];
  console.log(`verify-github-release-assets: ${repo} ${tag} (${assets.length} assets)`);

  assertAsset(assets, /^Stealth-Browser-Console-Setup-.*\.exe$/i, "NSIS installer", 50_000_000);
  assertAsset(assets, /^Stealth-Browser-Console-Setup-.*\.exe\.blockmap$/i, "blockmap", 10_000);
  assertAsset(assets, /^latest\.yml$/i, "latest.yml", 100);

  if (opts.requirePortable) {
    assertAsset(assets, /^Stealth-Browser-Console-Portable-.*\.exe$/i, "portable", 50_000_000);
  }

  console.log("verify-github-release-assets: PASS");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
