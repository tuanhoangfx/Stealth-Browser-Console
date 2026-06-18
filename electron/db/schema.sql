-- profile_groups
CREATE TABLE IF NOT EXISTS profile_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_id TEXT REFERENCES profile_groups(id),
  proxy TEXT,
  fingerprint_seed INTEGER NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'closed',
  -- device / fingerprint surface (cloakbrowser-honored)
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
  show_profile_badge INTEGER DEFAULT 1,
  profile_tab_groups INTEGER DEFAULT 0,
  tab_group_color TEXT,
  last_opened_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- run history
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  workflow TEXT DEFAULT 'open-url',
  target_url TEXT,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  screenshot_path TEXT,
  error TEXT,
  logs_json TEXT
);

-- app settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO profile_groups (id, name, sort_order) VALUES ('default', 'Default', 0);

-- Indexes — cần khi catalog lớn (vài nghìn → 10k+ profile). exec mỗi lần mở DB.
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);
CREATE INDEX IF NOT EXISTS idx_profiles_group_id ON profiles(group_id);
CREATE INDEX IF NOT EXISTS idx_profiles_fingerprint_seed ON profiles(fingerprint_seed);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
CREATE INDEX IF NOT EXISTS idx_runs_profile_id ON runs(profile_id);
