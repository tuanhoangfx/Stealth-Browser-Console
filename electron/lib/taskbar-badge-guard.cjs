/**
 * Periodic taskbar badge guard.
 *
 * The open-path reinforce chain stops ~60s after launch, but Chromium re-stamps its own
 * window icon at unpredictable later moments (profile avatar swap, window re-create).
 * A window sitting idle never navigates, so nothing re-triggers the badge and it stays
 * plain until the next manual apply. The guard re-stamps the neediest live windows
 * (never-OK first, then oldest OK) so burst-open misses recover within one interval.
 */
const { extractProfileCode } = require("./profile-code.cjs");
const { shouldSkipTaskbarBadge } = require("./profile-taskbar-native.cjs");

const DEFAULT_INTERVAL_MS = 20_000;
const DEFAULT_BATCH_SIZE = 16;

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
 * Prefer windows that never got OK_ICON, then the oldest stamp.
 * @param {Array<{ userDataDir: string }>} rows
 * @param {(dir: string) => number} lastOkAt
 * @param {number} batchSize
 */
function selectNeediestGuardBatch(rows, lastOkAt, batchSize) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const size = Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE);
  const okAt = typeof lastOkAt === "function" ? lastOkAt : () => 0;
  list.sort((a, b) => {
    const aOk = Number(okAt(a?.userDataDir)) || 0;
    const bOk = Number(okAt(b?.userDataDir)) || 0;
    if (aOk !== bOk) return aOk - bOk;
    return String(a?.userDataDir || "").localeCompare(String(b?.userDataDir || ""));
  });
  return { batch: list.slice(0, Math.min(size, list.length)), nextCursor: 0 };
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
  lastOkAt,
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
    const picked = lastOkAt
      ? selectNeediestGuardBatch(rows, lastOkAt, batchSize)
      : selectGuardBatch(rows, cursor, batchSize);
    const batch = picked.batch;
    cursor = picked.nextCursor;
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
  selectNeediestGuardBatch,
  startTaskbarBadgeGuard,
};
