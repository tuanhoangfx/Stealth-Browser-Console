try {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  db.close();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
