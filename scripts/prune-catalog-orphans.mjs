#!/usr/bin/env node
/**
 * Prune P0003 catalog rows whose profiles/{id} folder is missing on disk.
 * DB-only via profileService.deleteProfiles — does NOT purge disk folders.
 *
 * Usage:
 *   node scripts/prune-catalog-orphans.mjs --dry-run
 *   node scripts/prune-catalog-orphans.mjs --apply
 *
 * Close packaged Stealth (:6003) before --apply. Escape close: STEALTH_ALLOW_CLOSE_PROD=1
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnElectronNode } from "./lib/spawn-electron-node.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;

if (!apply && !process.argv.includes("--dry-run")) {
  console.log("prune-catalog-orphans: pass --dry-run or --apply");
  process.exit(2);
}

const worker = path.join(root, "scripts", "lib", "prune-catalog-orphans-worker.cjs");
const result = spawnElectronNode(worker, apply ? ["--apply"] : ["--dry-run"], {
  cwd: root,
  env: {
    STEALTH_DEV_ISOLATED: "0",
    STEALTH_USER_DATA:
      process.env.STEALTH_USER_DATA ||
      path.join(process.env.APPDATA || "", "stealth-browser-console"),
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
