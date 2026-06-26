#!/usr/bin/env node
/**
 * Remove duplicate GitHub Releases that share the same tag (electron-builder nsis+portable bug).
 * Keeps the release with the most assets (tie-break: largest total byte size).
 *
 * Usage:
 *   node scripts/dedupe-github-releases.mjs [--tag vX.Y.Z] [--repo owner/name] [--dry-run]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { readJson } = require("../../scripts/lib/version-sync-lib.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { tag: "", repo: "", dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag" && argv[i + 1]) opts.tag = argv[++i];
    else if (a === "--repo" && argv[i + 1]) opts.repo = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
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

async function fetchAllReleases(repo, token) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) throw new Error(`releases HTTP ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

function scoreRelease(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const bytes = assets.reduce((sum, a) => sum + Number(a.size || 0), 0);
  return { count: assets.length, bytes };
}

async function deleteRelease(repo, id, token, dryRun) {
  if (dryRun) {
    console.log(`dry-run: would delete release id=${id}`);
    return;
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`delete release ${id} HTTP ${res.status}`);
  console.log(`deleted duplicate release id=${id}`);
}

async function main() {
  const opts = parseArgs(process.argv);
  const manifest = readJson(path.join(root, "tool.manifest.json")) || {};
  const repo = opts.repo || String(manifest.github?.repo || "").trim();
  if (!repo) {
    console.error("dedupe-github-releases: need --repo or tool.manifest.json github.repo");
    process.exit(1);
  }

  const token = ghToken();
  const releases = await fetchAllReleases(repo, token);
  const byTag = new Map();

  for (const release of releases) {
    const tag = String(release.tag_name || "");
    if (!tag) continue;
    if (opts.tag && tag !== opts.tag) continue;
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(release);
  }

  let removed = 0;
  for (const [tag, group] of byTag) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      const sa = scoreRelease(a);
      const sb = scoreRelease(b);
      if (sb.count !== sa.count) return sb.count - sa.count;
      return sb.bytes - sa.bytes;
    });
    const keep = ranked[0];
    const sa = scoreRelease(keep);
    console.log(`tag ${tag}: keep id=${keep.id} (${sa.count} assets, ${sa.bytes} bytes)`);
    for (const dup of ranked.slice(1)) {
      const sb = scoreRelease(dup);
      console.log(`tag ${tag}: drop id=${dup.id} (${sb.count} assets, ${sb.bytes} bytes)`);
      await deleteRelease(repo, dup.id, token, opts.dryRun);
      removed += 1;
    }
  }

  if (removed === 0) console.log("dedupe-github-releases: no duplicates");
  else console.log(`dedupe-github-releases: removed ${removed} duplicate(s)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
