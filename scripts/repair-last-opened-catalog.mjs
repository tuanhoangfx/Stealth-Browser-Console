#!/usr/bin/env node
/**
 * Repair prod `last_opened_at` from profile_events + newer dev isolated DB.
 * Safe to run while Setup.exe is closed (sql.js or better-sqlite3).
 *
 * Usage: node scripts/repair-last-opened-catalog.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PROD_DIR, roamingAppData } = require(path.join(root, "electron/lib/user-data-root.cjs"));
const {
  openDatabase,
  closeDatabase,
  getDb,
  getDbBackend,
  getNativeDb,
  isDatabaseReady,
  checkpointDatabase,
} = require(path.join(root, "electron/db/init.cjs"));
const {
  runStartupLastOpenedMaintenance,
  flushScheduledLastOpenedCheckpoint,
} = require(path.join(root, "electron/db/last-opened-durability.cjs"));

const prodRoot = path.join(roamingAppData(), PROD_DIR);

async function main() {
  await openDatabase(prodRoot);
  const before = getDb()
    .prepare("SELECT COUNT(*) AS c FROM profiles WHERE last_opened_at > ?")
    .get(Date.now() - 24 * 60 * 60 * 1000);

  const stats = await runStartupLastOpenedMaintenance({
    userDataPath: prodRoot,
    getDb,
    getDbBackend,
    getNativeDb,
    isDatabaseReady,
  });

  flushScheduledLastOpenedCheckpoint(checkpointDatabase);

  const recent = getDb()
    .prepare("SELECT COUNT(*) AS c FROM profiles WHERE last_opened_at > ?")
    .get(Date.now() - 24 * 60 * 60 * 1000);

  console.log(
    JSON.stringify(
      {
        prodRoot,
        recentWithin24hBefore: Number(before?.c) || 0,
        recentWithin24hAfter: Number(recent?.c) || 0,
        ...stats,
      },
      null,
      2,
    ),
  );
  closeDatabase();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
