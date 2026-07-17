"use strict";

const path = require("node:path");
const os = require("node:os");
const { openDatabase, getDb, closeDatabase } = require("../electron/db/init.cjs");

function resolveUserDataRoot() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "stealth-browser-console");
}

async function main() {
  await openDatabase(resolveUserDataRoot());
  const rows = getDb()
    .prepare(
      `SELECT id, account_email AS accountEmail, account_id AS accountId, created_at AS createdAt,
              synced_at AS syncedAt, attempts, last_error AS lastError, skip_cloud AS skipCloud,
              snapshot_json AS snapshotJson
       FROM stealth_sync_outbox
       ORDER BY created_at DESC
       LIMIT 30`,
    )
    .all()
    .map((row) => ({
      ...row,
      snapshot: JSON.parse(row.snapshotJson || "{}"),
    }));

  console.log(JSON.stringify({ userDataRoot: resolveUserDataRoot(), count: rows.length, rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      closeDatabase();
    } catch {
      // ignore close errors for diagnostics
    }
  });
