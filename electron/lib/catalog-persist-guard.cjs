"use strict";

const fs = require("node:fs");

/** Profiles on disk when this process opened the catalog — shrink-flush guard baseline. */
let catalogProfileBaseline = 0;

const SHRINK_GUARD_MIN_BASELINE = 50;
const SHRINK_GUARD_MAX_MEMORY = 1;

function setCatalogProfileBaseline(count) {
  const n = Number(count);
  catalogProfileBaseline = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function getCatalogProfileBaseline() {
  return catalogProfileBaseline;
}

function countProfilesInSqlJsDatabase(database) {
  try {
    const row = database.exec("SELECT COUNT(*) AS c FROM profiles")[0]?.values?.[0]?.[0];
    return Number(row) || 0;
  } catch {
    return 0;
  }
}

/**
 * Block sql.js full export when in-memory catalog collapsed but we opened with a large baseline.
 * Prevents a running instance from overwriting a restored multi-thousand catalog with Stealth Demo.
 */
function shouldBlockCatalogShrinkFlush(database, dbFilePath) {
  const memoryCount = countProfilesInSqlJsDatabase(database);
  const baseline = catalogProfileBaseline;
  if (baseline < SHRINK_GUARD_MIN_BASELINE) return false;
  if (memoryCount > SHRINK_GUARD_MAX_MEMORY) return false;

  console.error(
    `[catalog-guard] blocked shrink flush (memory=${memoryCount}, baseline=${baseline}) — quit and reopen Stealth Browser Console`,
  );
  return true;
}

module.exports = {
  SHRINK_GUARD_MIN_BASELINE,
  setCatalogProfileBaseline,
  getCatalogProfileBaseline,
  countProfilesInSqlJsDatabase,
  shouldBlockCatalogShrinkFlush,
};
