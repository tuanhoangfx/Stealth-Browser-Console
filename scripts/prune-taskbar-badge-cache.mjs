/**
 * Prune stale taskbar badge ICO/PNG from prior styles (v3-digit-halo-*, v4-digits-only-*, etc.).
 * Usage: node scripts/prune-taskbar-badge-cache.mjs [--json]
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { pruneStaleBadgeCache, BADGE_STYLE } = require("../electron/lib/profile-taskbar-native.cjs");

const json = process.argv.includes("--json");
const result = pruneStaleBadgeCache();

if (json) {
  console.log(JSON.stringify({ ok: true, style: BADGE_STYLE, ...result }));
} else {
  console.log(`prune-taskbar-badge-cache: removed ${result.removed} file(s) (style=${BADGE_STYLE})`);
}
