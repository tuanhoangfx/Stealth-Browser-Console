"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKPOINT_DEBOUNCE_MS = 2_500;
const STARTUP_MAINTENANCE_DELAY_MS = 3_000;

let checkpointTimer = null;

/** Coalesce burst profile opens — one TRUNCATE WAL flush instead of per-open cost. */
function scheduleLastOpenedCheckpoint(checkpointDatabase) {
  if (!checkpointDatabase) return;
  if (checkpointTimer) return;
  checkpointTimer = setTimeout(() => {
    checkpointTimer = null;
    try {
      checkpointDatabase({ truncate: true });
    } catch (error) {
      console.warn(
        "[last-opened] checkpoint:",
        error instanceof Error ? error.message : error,
      );
    }
  }, CHECKPOINT_DEBOUNCE_MS);
}

function cancelScheduledLastOpenedCheckpoint() {
  if (!checkpointTimer) return;
  clearTimeout(checkpointTimer);
  checkpointTimer = null;
}

/** Flush pending debounced checkpoint — call on graceful quit. */
function flushScheduledLastOpenedCheckpoint(checkpointDatabase) {
  cancelScheduledLastOpenedCheckpoint();
  if (!checkpointDatabase) return;
  try {
    checkpointDatabase({ truncate: true });
  } catch (error) {
    console.warn(
      "[last-opened] flush checkpoint:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Repair stale `last_opened_at` from durable `profile_events` (launch/opening).
 * Single indexed SQL — runs once after startup, not on directory render.
 */
function reconcileLastOpenedFromProfileEvents(getDb, isDatabaseReady) {
  if (!isDatabaseReady?.()) return { reconciled: 0 };
  try {
    const nowMs = Date.now() + 60_000;
    const result = getDb()
      .prepare(
        `WITH latest AS (
           SELECT profile_id AS id,
                  MAX(CAST((julianday(created_at) - 2440587.5) * 86400000 AS INTEGER)) AS ts
           FROM profile_events
           WHERE event_type IN ('launch', 'opening')
             AND created_at IS NOT NULL
             AND TRIM(created_at) != ''
           GROUP BY profile_id
         )
         UPDATE profiles
         SET last_opened_at = latest.ts
         FROM latest
         WHERE profiles.id = latest.id
           AND latest.ts > 0
           AND latest.ts <= ?
           AND (profiles.last_opened_at IS NULL
                OR profiles.last_opened_at = 0
                OR profiles.last_opened_at < latest.ts)`,
      )
      .run(nowMs);
    return { reconciled: Number(result?.changes) || 0 };
  } catch (error) {
    console.warn(
      "[last-opened] reconcile:",
      error instanceof Error ? error.message : error,
    );
    return { reconciled: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveProdCatalogDbPath(userDataPath) {
  return path.join(String(userDataPath || ""), "data", "stealth-console.db");
}

function resolveSiblingDevDbPath(userDataPath, siblingDbPath = "") {
  const explicit = String(siblingDbPath || "").trim();
  if (explicit) return explicit;
  const { DEV_DIR, roamingAppData } = require("../lib/user-data-root.cjs");
  return path.join(roamingAppData(), DEV_DIR, "data", "stealth-console.db");
}

function applySiblingLastOpenedRows(getDb, rows) {
  const update = getDb().prepare(
    `UPDATE profiles
     SET last_opened_at = ?
     WHERE id = ?
       AND (last_opened_at IS NULL OR last_opened_at = 0 OR last_opened_at < ?)`,
  );
  let merged = 0;
  for (const [id, ts] of rows) {
    const next = Number(ts);
    if (!id || !Number.isFinite(next) || next <= 0) continue;
    const result = update.run(next, String(id), next);
    merged += Number(result?.changes) || 0;
  }
  return merged;
}

async function readSiblingLastOpenedRows(devDbPath) {
  const initSqlJs = require("sql.js/dist/sql-wasm.js");
  const wasmFile = path.join(
    path.dirname(require.resolve("sql.js/package.json")),
    "dist",
    "sql-wasm.wasm",
  );
  const SQL = await initSqlJs({ locateFile: () => wasmFile });
  const devDb = new SQL.Database(fs.readFileSync(devDbPath));
  try {
    return (
      devDb.exec(
        "SELECT id, last_opened_at FROM profiles WHERE last_opened_at IS NOT NULL AND last_opened_at > 0",
      )[0]?.values ?? []
    );
  } finally {
    devDb.close();
  }
}

function toSqliteRoUri(filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, "/");
  return `file:${normalized}?mode=ro`;
}

function mergeNewerLastOpenedFromSiblingUserDataNative(getNativeDb, devDbPath) {
  const native = getNativeDb?.();
  if (!native) return { merged: 0, skipped: "no-native-db" };

  const attachUri = toSqliteRoUri(devDbPath).replace(/'/g, "''");
  try {
    native.exec(`ATTACH DATABASE '${attachUri}' AS dev_last_opened`);
    const result = native
      .prepare(
        `UPDATE main.profiles
         SET last_opened_at = (
           SELECT d.last_opened_at
           FROM dev_last_opened.profiles AS d
           WHERE d.id = main.profiles.id
             AND d.last_opened_at IS NOT NULL
             AND d.last_opened_at > 0
             AND d.last_opened_at > COALESCE(main.profiles.last_opened_at, 0)
           LIMIT 1
         )
         WHERE EXISTS (
           SELECT 1
           FROM dev_last_opened.profiles AS d
           WHERE d.id = main.profiles.id
             AND d.last_opened_at > COALESCE(main.profiles.last_opened_at, 0)
         )`,
      )
      .run();
    native.exec("DETACH DATABASE dev_last_opened");
    return { merged: Number(result?.changes) || 0 };
  } catch (error) {
    try {
      native.exec("DETACH DATABASE dev_last_opened");
    } catch {
      // ignore
    }
    console.warn(
      "[last-opened] sibling merge:",
      error instanceof Error ? error.message : error,
    );
    return { merged: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * When dev uses isolated userData, merge newer `last_opened_at` into prod catalog.
 * One ATTACH + UPDATE at startup — zero cost on profile launch or table render.
 */
async function mergeNewerLastOpenedFromSiblingUserData({
  userDataPath,
  getDb,
  getDbBackend,
  getNativeDb,
  isDatabaseReady,
  siblingDbPath = "",
}) {
  if (!isDatabaseReady?.()) return { merged: 0, skipped: "db-not-ready" };

  const rootName = path.basename(String(userDataPath || ""));
  if (rootName.endsWith("-dev")) return { merged: 0, skipped: "dev-session" };

  const devDb = resolveSiblingDevDbPath(userDataPath, siblingDbPath);
  if (!fs.existsSync(devDb)) return { merged: 0, skipped: "no-sibling" };

  const prodDb = resolveProdCatalogDbPath(userDataPath);
  if (path.resolve(devDb) === path.resolve(prodDb)) {
    return { merged: 0, skipped: "same-db" };
  }

  if (getDbBackend?.() === "better-sqlite3") {
    return mergeNewerLastOpenedFromSiblingUserDataNative(getNativeDb, devDb);
  }

  try {
    const rows = await readSiblingLastOpenedRows(devDb);
    return { merged: applySiblingLastOpenedRows(getDb, rows) };
  } catch (error) {
    console.warn(
      "[last-opened] sibling merge (sql.js):",
      error instanceof Error ? error.message : error,
    );
    return { merged: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runStartupLastOpenedMaintenance(deps) {
  const reconciled = reconcileLastOpenedFromProfileEvents(deps.getDb, deps.isDatabaseReady);
  let sibling = { merged: 0, skipped: "not-run" };
  try {
    sibling = await mergeNewerLastOpenedFromSiblingUserData(deps);
  } catch (error) {
    console.warn(
      "[last-opened] sibling merge:",
      error instanceof Error ? error.message : error,
    );
    sibling = { merged: 0, error: error instanceof Error ? error.message : String(error) };
  }
  return {
    reconciled: reconciled.reconciled,
    merged: sibling.merged,
    siblingSkipped: sibling.skipped || sibling.error || reconciled.error || null,
  };
}

function scheduleStartupLastOpenedMaintenance(deps) {
  setTimeout(() => {
    void runStartupLastOpenedMaintenance(deps)
      .then((stats) => {
        console.info(
          `[last-opened] startup maintenance reconciled=${stats.reconciled} siblingMerged=${stats.merged}${stats.siblingSkipped ? ` skipped=${stats.siblingSkipped}` : ""}`,
        );
      })
      .catch((error) => {
        console.warn(
          "[last-opened] startup maintenance:",
          error instanceof Error ? error.message : error,
        );
      });
  }, STARTUP_MAINTENANCE_DELAY_MS);
}

/** Flush WAL to main db before update/reinstall — sync, no session teardown wait. */
function flushCatalogForUpdate() {
  try {
    const { checkpointDatabase } = require("./db/init.cjs");
    flushScheduledLastOpenedCheckpoint(checkpointDatabase);
  } catch (error) {
    console.warn(
      "[last-opened] pre-update checkpoint:",
      error instanceof Error ? error.message : error,
    );
  }
}

module.exports = {
  CHECKPOINT_DEBOUNCE_MS,
  STARTUP_MAINTENANCE_DELAY_MS,
  scheduleLastOpenedCheckpoint,
  cancelScheduledLastOpenedCheckpoint,
  flushScheduledLastOpenedCheckpoint,
  reconcileLastOpenedFromProfileEvents,
  mergeNewerLastOpenedFromSiblingUserData,
  runStartupLastOpenedMaintenance,
  scheduleStartupLastOpenedMaintenance,
  flushCatalogForUpdate,
};
