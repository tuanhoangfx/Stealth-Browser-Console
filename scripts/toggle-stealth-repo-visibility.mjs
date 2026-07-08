#!/usr/bin/env node
/**
 * Toggle P0003 GitHub repo visibility (public ↔ private) and sync tool.manifest.json SSOT.
 *
 * Usage:
 *   node scripts/toggle-stealth-repo-visibility.mjs --public
 *   node scripts/toggle-stealth-repo-visibility.mjs --private
 *   node scripts/toggle-stealth-repo-visibility.mjs --status
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "tool.manifest.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function gh(args) {
  const res = spawnSync("gh", args, { encoding: "utf8", shell: process.platform === "win32" });
  if (res.status !== 0) {
    throw new Error(String(res.stderr || res.stdout || `gh ${args.join(" ")} failed`).trim());
  }
  return String(res.stdout || "").trim();
}

function parseTarget(argv) {
  if (argv.includes("--public")) return "public";
  if (argv.includes("--private")) return "private";
  if (argv.includes("--status")) return "status";
  return "";
}

function repoSlug(manifest) {
  const slug = String(manifest?.github?.repo || "").trim();
  if (!slug) throw new Error("tool.manifest.json missing github.repo");
  return slug;
}

function fetchVisibility(repo) {
  const raw = gh(["repo", "view", repo, "--json", "visibility,isPrivate"]);
  const meta = JSON.parse(raw);
  return {
    visibility: meta.visibility === "PUBLIC" || meta.isPrivate === false ? "public" : "private",
    isPrivate: Boolean(meta.isPrivate),
  };
}

function syncManifestVisibility(visibility) {
  const manifest = readJson(manifestPath);
  manifest.github = {
    ...manifest.github,
    visibility,
    visibilityUpdatedAt: new Date().toISOString(),
  };
  manifest.manifestUpdatedAt = manifest.github.visibilityUpdatedAt;
  writeJson(manifestPath, manifest);
  console.log(`toggle-stealth-repo-visibility: manifest github.visibility=${visibility}`);
}

function main() {
  const target = parseTarget(process.argv);
  if (!target) {
    console.error("Usage: node scripts/toggle-stealth-repo-visibility.mjs --public|--private|--status");
    process.exit(1);
  }

  const manifest = readJson(manifestPath);
  const repo = repoSlug(manifest);
  const current = fetchVisibility(repo);

  if (target === "status") {
    console.log(JSON.stringify({ repo, ...current, manifest: manifest.github?.visibility ?? null }, null, 2));
    return;
  }

  if (current.visibility === target) {
    console.log(`toggle-stealth-repo-visibility: already ${target}`);
    syncManifestVisibility(target);
    return;
  }

  gh(["api", `repos/${repo}`, "-X", "PATCH", "-f", `visibility=${target}`]);
  const after = fetchVisibility(repo);
  if (after.visibility !== target) {
    throw new Error(`GitHub visibility is ${after.visibility}, expected ${target}`);
  }

  syncManifestVisibility(target);
  console.log(`toggle-stealth-repo-visibility: ${repo} → ${target}`);
  console.log(
    target === "public"
      ? "Auto-update feed: public /releases/latest/download/latest.yml"
      : "Auto-update feed: private — packaged builds need STEALTH_UPDATER_GH_TOKEN at build time",
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
