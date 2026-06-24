/** Exported for unit test — drops legacy MV3 chrome UI columns from profiles. */
function dropLegacyProfileChromeColumns(database) {
  const flag = database.prepare("SELECT value FROM settings WHERE key = ?").get("profile_chrome_columns_dropped_v1");
  if (flag?.value === "1") return;

  const existing = new Set();
  const pragmaStmt = database.prepare("PRAGMA table_info(profiles)");
  if (typeof pragmaStmt.all === "function") {
    for (const row of pragmaStmt.all()) existing.add(row.name);
  } else {
    try {
      while (pragmaStmt.step()) existing.add(pragmaStmt.getAsObject().name);
    } finally {
      pragmaStmt.free();
    }
  }

  const legacyCols = ["show_profile_badge", "profile_tab_groups", "tab_group_color"];
  if (!legacyCols.some((name) => existing.has(name))) {
    database
      .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
      .run("profile_chrome_columns_dropped_v1", "1");
    return;
  }

  database.exec(`
    CREATE TABLE profiles__drop_legacy_chrome (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_id TEXT REFERENCES profile_groups(id),
      proxy TEXT,
      fingerprint_seed INTEGER NOT NULL,
      note TEXT,
      status TEXT DEFAULT 'closed',
      platform TEXT DEFAULT 'windows',
      timezone TEXT,
      locale TEXT,
      user_agent TEXT,
      viewport_w INTEGER DEFAULT 0,
      viewport_h INTEGER DEFAULT 0,
      color_scheme TEXT,
      device_preset TEXT DEFAULT 'custom',
      headless INTEGER DEFAULT 0,
      humanize INTEGER DEFAULT 1,
      window_mode TEXT DEFAULT 'host-maximized',
      startup_url TEXT,
      last_opened_at INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO profiles__drop_legacy_chrome (
      id, name, group_id, proxy, fingerprint_seed, note, status,
      platform, timezone, locale, user_agent, viewport_w, viewport_h, color_scheme, device_preset,
      headless, humanize, window_mode, startup_url, last_opened_at, created_at, updated_at
    )
    SELECT
      id, name, group_id, proxy, fingerprint_seed, note, status,
      platform, timezone, locale, user_agent, viewport_w, viewport_h, color_scheme, device_preset,
      headless, humanize, window_mode, startup_url, last_opened_at, created_at, updated_at
    FROM profiles;

    DROP TABLE profiles;
    ALTER TABLE profiles__drop_legacy_chrome RENAME TO profiles;

    CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);
    CREATE INDEX IF NOT EXISTS idx_profiles_group_id ON profiles(group_id);
    CREATE INDEX IF NOT EXISTS idx_profiles_fingerprint_seed ON profiles(fingerprint_seed);
    CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
  `);

  database
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
    .run("profile_chrome_columns_dropped_v1", "1");
}

module.exports = { dropLegacyProfileChromeColumns };
