/**
 * Periodic taskbar badge guard.
 *
 * The open-path reinforce chain stops ~16s after launch, but Chromium re-stamps its own
 * window icon at unpredictable later moments (profile avatar swap, window re-create).
 * A window sitting idle never navigates, so nothing re-triggers the badge and it stays
 * plain until the next manual apply. The guard re-stamps live windows in small
 * round-robin batches so one slow cycle never blocks the persistent PowerShell worker.
 */
const { extractProfileCode } = require("./profile-code.cjs");
const { shouldSkipTaskbarBadge } = require("./profile-taskbar-native.cjs");

const DEFAULT_INTERVAL_MS = 120_000;
const DEFAULT_BATCH_SIZE = 6;

/**
 * @param {Array<T>} rows
 * @param {number} cursor
 * @param {number} batchSize
 * @returns {{ batch: T[], nextCursor: number }}
 * @template T
 */
function selectGuardBatch(rows, cursor, batchSize) {
  const list = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE);
  if (!list.length) return { batch: [], nextCursor: 0 };
  const start = Number.isInteger(cursor) && cursor >= 0 ? cursor % list.length : 0;
  const batch = [];
  for (let i = 0; i < Math.min(size, list.length); i += 1) {
    batch.push(list[(start + i) % list.length]);
  }
  return { batch, nextCursor: (start + batch.length) % list.length };
}

/** Rows the guard may re-stamp — headed, on-disk profiles outside the agent pool. */
function guardableRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row?.userDataDir) return false;
    if (row.headless) return false;
    return !shouldSkipTaskbarBadge(extractProfileCode(row.name, row.id), { headless: row.headless });
  });
}

/**
 * @param {{
 *   listRunning: () => Array<{ id: string, name: string, userDataDir: string, headless?: boolean }>,
 *   schedule: (userDataDir: string, label: string, code: string, opts: object) => void,
 *   formatLabel: (profile: { id: string, name: string }) => string,
 *   intervalMs?: number,
 *   batchSize?: number,
 *   setIntervalFn?: typeof setInterval,
 *   clearIntervalFn?: typeof clearInterval,
 * }} deps
 * @returns {() => void} stop
 */
function startTaskbarBadgeGuard({
  listRunning,
  schedule,
  formatLabel,
  intervalMs = DEFAULT_INTERVAL_MS,
  batchSize = DEFAULT_BATCH_SIZE,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let cursor = 0;

  const tick = () => {
    let rows = [];
    try {
      rows = guardableRows(listRunning());
    } catch (error) {
      console.warn("[taskbar-badge] guard list:", error instanceof Error ? error.message : error);
      return;
    }
    if (!rows.length) {
      cursor = 0;
      return;
    }
    const { batch, nextCursor } = selectGuardBatch(rows, cursor, batchSize);
    cursor = nextCursor;
    for (const row of batch) {
      const code = extractProfileCode(row.name, row.id);
      try {
        schedule(row.userDataDir, formatLabel({ id: row.id, name: row.name }), code, {
          headless: Boolean(row.headless),
          force: true,
          isReinforce: true,
        });
      } catch (error) {
        console.warn("[taskbar-badge] guard apply:", error instanceof Error ? error.message : error);
      }
    }
  };

  const timer = setIntervalFn(tick, Math.max(15_000, Number(intervalMs) || DEFAULT_INTERVAL_MS));
  if (typeof timer?.unref === "function") timer.unref();
  return () => clearIntervalFn(timer);
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  DEFAULT_BATCH_SIZE,
  guardableRows,
  selectGuardBatch,
  startTaskbarBadgeGuard,
};
