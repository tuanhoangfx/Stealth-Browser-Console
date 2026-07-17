"use strict";

const { getDb } = require("../db/init.cjs");
const { patchStealthSnapshotByAccountId } = require("./twofa-vault-bridge.cjs");

const DEBOUNCE_MS = 30_000;
const FLUSH_INTERVAL_MS = 12_000;
const MAX_ATTEMPTS = 8;

/** @type {Map<string, number>} */
const lastQueuedAt = new Map();
let workerTimer = null;
let flushing = false;

function enqueueStealthSync(entry) {
  const db = getDb();
  db.prepare(
    `INSERT INTO stealth_sync_outbox (id, account_email, account_id, snapshot_json, created_at, synced_at, attempts, last_error, skip_cloud)
     VALUES (@id, @accountEmail, @accountId, @snapshotJson, @createdAt, NULL, 0, @lastError, @skipCloud)`,
  ).run({
    id: entry.id,
    accountEmail: entry.accountEmail || "",
    accountId: entry.accountId || null,
    snapshotJson: JSON.stringify(entry.snapshot),
    createdAt: entry.createdAt || new Date().toISOString(),
    lastError: entry.lastError || null,
    skipCloud: entry.skipCloud ? 1 : 0,
  });

  const dedupeKey = (entry.accountId || entry.accountEmail || entry.id).toLowerCase();
  lastQueuedAt.set(dedupeKey, Date.now());
}

function listPendingOutbox(limit = 20) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, account_email AS accountEmail, account_id AS accountId, snapshot_json AS snapshotJson,
              created_at AS createdAt, attempts, skip_cloud AS skipCloud
       FROM stealth_sync_outbox
       WHERE synced_at IS NULL AND skip_cloud = 0 AND attempts < @maxAttempts
       ORDER BY created_at ASC
       LIMIT @limit`,
    )
    .all({ maxAttempts: MAX_ATTEMPTS, limit });
}

function listRecentOutbox(limit = 20) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, account_email AS accountEmail, account_id AS accountId, snapshot_json AS snapshotJson,
              created_at AS createdAt, synced_at AS syncedAt, attempts, last_error AS lastError, skip_cloud AS skipCloud
       FROM stealth_sync_outbox
       ORDER BY created_at DESC
       LIMIT @limit`,
    )
    .all({ limit })
    .map((row) => ({
      ...row,
      snapshot: JSON.parse(row.snapshotJson || "{}"),
    }));
}

function getStealthSyncDiagnostics(limit = 20) {
  const db = getDb();
  const stats =
    db
      .prepare(
        `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN synced_at IS NULL AND skip_cloud = 0 AND attempts < @maxAttempts THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN skip_cloud = 1 THEN 1 ELSE 0 END) AS skipped,
            SUM(CASE WHEN synced_at IS NOT NULL THEN 1 ELSE 0 END) AS synced,
            SUM(CASE WHEN synced_at IS NULL AND attempts > 0 THEN 1 ELSE 0 END) AS failed
         FROM stealth_sync_outbox`,
      )
      .get({ maxAttempts: MAX_ATTEMPTS }) || {};
  return {
    stats: {
      total: Number(stats.total || 0),
      pending: Number(stats.pending || 0),
      skipped: Number(stats.skipped || 0),
      synced: Number(stats.synced || 0),
      failed: Number(stats.failed || 0),
      debounceMs: DEBOUNCE_MS,
      flushIntervalMs: FLUSH_INTERVAL_MS,
      maxAttempts: MAX_ATTEMPTS,
      flushing,
    },
    recent: listRecentOutbox(limit),
  };
}

function markOutboxSynced(id) {
  getDb()
    .prepare(`UPDATE stealth_sync_outbox SET synced_at = @syncedAt, last_error = NULL WHERE id = @id`)
    .run({ id, syncedAt: new Date().toISOString() });
}

function markOutboxFailed(id, error, attempts) {
  getDb()
    .prepare(
      `UPDATE stealth_sync_outbox SET attempts = @attempts, last_error = @lastError WHERE id = @id`,
    )
    .run({
      id,
      attempts,
      lastError: String(error || "").slice(0, 500),
    });
}

function shouldSkipForDebounce(entry) {
  const key = (entry.accountId || entry.accountEmail || "").toLowerCase();
  if (!key) return false;
  const last = lastQueuedAt.get(key) || 0;
  return Date.now() - last < DEBOUNCE_MS;
}

async function flushStealthSyncOutbox() {
  if (flushing) return { ok: true, skipped: "busy" };
  flushing = true;
  try {
    const pending = listPendingOutbox();
    let synced = 0;
    for (const row of pending) {
      if (shouldSkipForDebounce(row)) continue;
      if (!row.accountId) {
        markOutboxFailed(row.id, "missing account id", row.attempts + 1);
        continue;
      }
      try {
        const snapshot = JSON.parse(row.snapshotJson || "{}");
        const result = await patchStealthSnapshotByAccountId(row.accountId, snapshot);
        if (!result.ok) {
          markOutboxFailed(row.id, result.reason || "patch failed", row.attempts + 1);
          continue;
        }
        markOutboxSynced(row.id);
        synced += 1;
      } catch (error) {
        markOutboxFailed(row.id, error instanceof Error ? error.message : String(error), row.attempts + 1);
      }
    }
    return { ok: true, synced };
  } finally {
    flushing = false;
  }
}

function startStealthSyncWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void flushStealthSyncOutbox().catch((error) => {
      console.warn("[stealth-sync] worker:", error instanceof Error ? error.message : error);
    });
  }, FLUSH_INTERVAL_MS);
  if (typeof workerTimer.unref === "function") workerTimer.unref();
}

module.exports = {
  enqueueStealthSync,
  flushStealthSyncOutbox,
  startStealthSyncWorker,
  listPendingOutbox,
  listRecentOutbox,
  getStealthSyncDiagnostics,
};
