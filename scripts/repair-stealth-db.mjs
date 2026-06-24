#!/usr/bin/env node
/** Repair corrupt stealth-console.db via sql.js re-export (works outside Electron). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const userData =
  process.env.STEALTH_USER_DATA ||
  path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console");
const dbFile = path.join(userData, "data", "stealth-console.db");

async function main() {
  if (!fs.existsSync(dbFile)) {
    console.error(`repair-stealth-db: missing ${dbFile}`);
    process.exit(1);
  }
  const initSqlJs = require("sql.js/dist/sql-wasm.js");
  const wasmPath = path.join(path.dirname(require.resolve("sql.js/package.json")), "dist", "sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const backup = `${dbFile}.repair.bak`;
  fs.copyFileSync(dbFile, backup);
  const source = new SQL.Database(fs.readFileSync(dbFile));
  const rebuilt = source.export();
  source.close();
  fs.writeFileSync(dbFile, Buffer.from(rebuilt));
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbFile}${suffix}`;
    try {
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    } catch {
      /* ignore */
    }
  }
  const verify = new SQL.Database(fs.readFileSync(dbFile));
  const count = verify.exec("SELECT COUNT(*) FROM profiles")[0]?.values?.[0]?.[0] ?? "?";
  verify.close();
  console.log(`repair-stealth-db: ok profiles=${count} bytes=${rebuilt.byteLength} backup=${backup}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
