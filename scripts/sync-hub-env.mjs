#!/usr/bin/env node
/** Copy VITE_HUB_SUPABASE_* from P0020 or P0004 sibling .env.local into P0003 .env.local */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dst = path.join(root, ".env.local");
const sources = [
  path.join(root, "../P0020-Data-Box/.env.local"),
  path.join(root, "../P0004-Tool-Hub/.env.local"),
];

const AUTH_COMMENT_BLOCK = [
  "# --- Hub workspace login ---",
  "# Auto-enabled when Hub Supabase keys are present (sync-hub-env.mjs)",
  "# Set VITE_STEALTH_HUB_AUTH=0 to force local-only mode",
  "# Login required — anonymous mode disabled workspace-wide:",
  "VITE_STEALTH_AUTH_OPTIONAL=0",
];

function parseHubVars(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^VITE_HUB_SUPABASE_/.test(line.trim()));
}

function readPreservedStealthVars(filePath) {
  const kept = [];
  if (!fs.existsSync(filePath)) return kept;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (/^VITE_STEALTH_/.test(t) && !/^VITE_HUB_SUPABASE_/.test(t)) {
      kept.push(t);
    }
    if (/^VITE_GPM_/.test(t) && !/^VITE_HUB_SUPABASE_/.test(t)) {
      kept.push(t.replace(/^VITE_GPM_/, "VITE_STEALTH_"));
    }
  }
  return [...new Set(kept)];
}

function mergeStealthAuthVars(preserved, hasHubKeys) {
  const forceOff = preserved.some((line) => /^VITE_STEALTH_HUB_AUTH=(0|false)/i.test(line.trim()));
  if (forceOff) {
    return [
      ...preserved.filter((line) => !/^VITE_STEALTH_HUB_AUTH=/i.test(line.trim())),
      "VITE_STEALTH_HUB_AUTH=0",
    ];
  }

  const withoutAuth = preserved.filter((line) => !/^VITE_STEALTH_HUB_AUTH=/i.test(line.trim()));
  const explicitOn = preserved.some((line) => /^VITE_STEALTH_HUB_AUTH=(1|true)/i.test(line.trim()));

  if (explicitOn || hasHubKeys) {
    return [...withoutAuth, "VITE_STEALTH_HUB_AUTH=1", "VITE_STEALTH_AUTH_OPTIONAL=0"];
  }
  return withoutAuth;
}

let lines = [];
for (const src of sources) {
  const found = parseHubVars(src);
  if (found.length) {
    lines = found;
    break;
  }
}

const preserved = readPreservedStealthVars(dst);
const stealthVars = mergeStealthAuthVars(preserved, lines.length > 0);

const sections = [
  "# Synced by scripts/sync-hub-env.mjs — Hub Supabase keys + auth toggles",
  "",
];

if (lines.length) {
  sections.push(...lines);
} else {
  sections.push("# (no VITE_HUB_SUPABASE_* found in P0020/P0004 .env.local)");
}

if (stealthVars.length) {
  sections.push("", ...stealthVars);
}

sections.push("", ...AUTH_COMMENT_BLOCK, "");

fs.writeFileSync(dst, sections.join("\n"));

if (lines.length) {
  console.log(`sync-hub-env: wrote ${lines.length} Hub key(s) to .env.local`);
} else {
  console.log("sync-hub-env: no VITE_HUB_SUPABASE_* found in P0020/P0004 .env.local");
}
if (stealthVars.length) {
  console.log(`sync-hub-env: wrote ${stealthVars.length} VITE_STEALTH_* var(s)`);
}
