#!/usr/bin/env node
/**
 * Report catalog ↔ disk presence (never deletes).
 * Same data as prune --dry-run; clearer ops message for agents/users.
 *
 *   node scripts/reconcile-catalog-disk.mjs
 *   node scripts/reconcile-catalog-disk.mjs --import-disk-only   # register orphan folders into catalog
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnElectronNode } from "./lib/spawn-electron-node.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importDiskOnly = process.argv.includes("--import-disk-only");
const worker = path.join(root, "scripts", "lib", "reconcile-catalog-disk-worker.cjs");
const args = importDiskOnly ? ["--import-disk-only"] : ["--report"];

const result = spawnElectronNode(worker, args, {
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
