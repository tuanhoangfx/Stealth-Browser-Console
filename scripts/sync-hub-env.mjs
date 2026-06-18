#!/usr/bin/env node
/** Copy VITE_HUB_SUPABASE_* from P0020 or P0004 sibling .env.local into P0001 .env.local */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dst = path.join(root, ".env.local");
const sources = [
  path.join(root, "../P0020-Data-Box/.env.local"),
  path.join(root, "../P0004-Tool-Hub/.env.local")
];

const AUTH_COMMENT_BLOCK = [
  "# --- Hub workspace login (off by default) ---",
  "# Uncomment to re-enable sign-in modal + Anonymous mode:",
  "# VITE_GPM_HUB_AUTH=1",
  "# Optional — require login (no auto Anonymous):",
  "# VITE_GPM_AUTH_OPTIONAL=0"
];

function parseHubVars(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^VITE_HUB_SUPABASE_/.test(line.trim()));
}

function readPreservedGpmVars(filePath) {
  const kept = [];
  if (!fs.existsSync(filePath)) return kept;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (/^VITE_GPM_/.test(t) && !/^VITE_HUB_SUPABASE_/.test(t)) {
      kept.push(t);
    }
  }
  return [...new Set(kept)];
}

let lines = [];
for (const src of sources) {
  const found = parseHubVars(src);
  if (found.length) {
    lines = found;
    break;
  }
}

const preserved = readPreservedGpmVars(dst);

const sections = [
  "# Synced by scripts/sync-hub-env.mjs — Hub Supabase keys + auth toggles",
  ""
];

if (lines.length) {
  sections.push(...lines);
} else {
  sections.push("# (no VITE_HUB_SUPABASE_* found in P0020/P0004 .env.local)");
}

if (preserved.length) {
  sections.push("", ...preserved);
}

sections.push("", ...AUTH_COMMENT_BLOCK, "");

fs.writeFileSync(dst, sections.join("\n"));

if (lines.length) {
  console.log(`sync-hub-env: wrote ${lines.length} Hub key(s) to .env.local`);
} else {
  console.log("sync-hub-env: no VITE_HUB_SUPABASE_* found in P0020/P0004 .env.local");
}
if (preserved.length) {
  console.log(`sync-hub-env: preserved ${preserved.length} VITE_GPM_* var(s)`);
}
