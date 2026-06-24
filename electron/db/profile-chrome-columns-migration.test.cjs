const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("dropLegacyProfileChromeColumns", () => {
  it("removes show_profile_badge, profile_tab_groups, tab_group_color", async () => {
    const initSqlJs = require("sql.js/dist/sql-wasm.js");
    const wasmPath = path.join(
      path.dirname(require.resolve("sql.js/package.json")),
      "dist",
      "sql-wasm.wasm",
    );
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const db = new SQL.Database();
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    db.exec(schema);
    db.exec(`
      ALTER TABLE profiles ADD COLUMN show_profile_badge INTEGER DEFAULT 0;
      ALTER TABLE profiles ADD COLUMN profile_tab_groups INTEGER DEFAULT 0;
      ALTER TABLE profiles ADD COLUMN tab_group_color TEXT;
    `);

    const { dropLegacyProfileChromeColumns } = require("./init-drop-legacy-chrome.cjs");
    const adapter = {
      prepare(sql) {
        return {
          all() {
            const stmt = db.prepare(sql);
            const rows = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            stmt.free();
            return rows;
          },
          get(...params) {
            const stmt = db.prepare(sql);
            if (params.length) stmt.bind(params);
            const row = stmt.step() ? stmt.getAsObject() : undefined;
            stmt.free();
            return row;
          },
          run(...params) {
            db.run(sql, params);
          },
        };
      },
      exec(sql) {
        db.exec(sql);
      },
    };

    dropLegacyProfileChromeColumns(adapter);

    const cols = adapter.prepare("PRAGMA table_info(profiles)").all().map((r) => r.name);
    assert.ok(!cols.includes("show_profile_badge"));
    assert.ok(!cols.includes("profile_tab_groups"));
    assert.ok(!cols.includes("tab_group_color"));
    assert.equal(
      adapter.prepare("SELECT value FROM settings WHERE key = ?").get("profile_chrome_columns_dropped_v1").value,
      "1",
    );
  });
});
