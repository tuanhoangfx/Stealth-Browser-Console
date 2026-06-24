const Database = require("better-sqlite3");
const path = require("node:path");
const os = require("node:os");

const dbFile =
  process.env.STEALTH_DB_FILE ||
  path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console", "data", "stealth-console.db");

try {
  const db = new Database(dbFile, { readonly: true });
  const row = db.prepare("SELECT COUNT(*) AS c FROM profiles").get();
  console.log(`OK profiles=${row.c} backend=better-sqlite3`);
  db.close();
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
