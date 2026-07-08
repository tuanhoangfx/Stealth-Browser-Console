/**
 * Unit smoke — rotate corrupt DB then openDatabase creates a clean file.
 * Run: node --test scripts/test-db-corrupt-rotate.mjs
 * (uses sql.js only — STEALTH_DB_BACKEND=sql.js)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  openDatabase,
  closeDatabase,
  getDb,
  rotateCorruptDatabaseFile,
} = require("../electron/db/init.cjs");

test("rotateCorruptDatabaseFile moves broken DB aside", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-db-rotate-"));
  const file = path.join(dir, "stealth-console.db");
  fs.writeFileSync(file, Buffer.from("not-a-sqlite-database"));
  fs.writeFileSync(`${file}-wal`, "x");
  const result = rotateCorruptDatabaseFile(file);
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(`${file}-wal`), false);
  assert.ok(result.backup && fs.existsSync(result.backup));
});

test("openDatabase rotates corrupt file instead of keeping broken sql.js handle", async () => {
  process.env.STEALTH_DB_BACKEND = "sql.js";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-db-open-"));
  const dataDir = path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "stealth-console.db");
  fs.writeFileSync(file, Buffer.from("definitely-corrupt-bytes"));

  closeDatabase();
  const db = await openDatabase(root);
  assert.ok(db);
  // Fresh schema must accept a write
  getDb().prepare(
    "INSERT OR IGNORE INTO profile_groups (id, name, sort_order) VALUES (?, ?, ?)",
  ).run("default", "Default", 0);
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM profile_groups").get();
  assert.ok(Number(row.c) >= 1);
  closeDatabase();

  const backups = fs.readdirSync(dataDir).filter((n) => n.includes(".corrupt."));
  assert.ok(backups.length >= 1, "expected corrupt backup filename");
  assert.ok(fs.existsSync(file));
});
