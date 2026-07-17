"use strict";

const fs = require("node:fs");
const path = require("node:path");

const KNOWN_GOOD_NAME = "stealth-console.db.known-good.bak";
const MIN_PROFILES_TO_PIN = 50;

/**
 * Pin a known-good catalog copy after healthy open — cheap insurance before agent kill / corrupt rotate.
 */
function pinKnownGoodCatalogCopy(userDataPath, profileCount) {
  const count = Number(profileCount) || 0;
  if (count < MIN_PROFILES_TO_PIN) return { ok: false, reason: "too-few-profiles" };

  const dataDir = path.join(String(userDataPath), "data");
  const dbFile = path.join(dataDir, "stealth-console.db");
  const dest = path.join(dataDir, KNOWN_GOOD_NAME);
  if (!fs.existsSync(dbFile)) return { ok: false, reason: "missing-db" };

  try {
    fs.copyFileSync(dbFile, dest);
    return { ok: true, path: dest, profiles: count };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

module.exports = { KNOWN_GOOD_NAME, MIN_PROFILES_TO_PIN, pinKnownGoodCatalogCopy };
