#!/usr/bin/env node
/**
 * Catalog ↔ disk reconcile (report + optional import of disk-only folders).
 * Does NOT delete catalog stubs — those names are intentional until user prunes with --force.
 */
const fs = require("fs");
const path = require("path");
const { openDatabase, closeDatabase } = require("../../electron/db/init.cjs");
const profileService = require("../../electron/db/profile-service.cjs");
const { resolveStealthUserDataRoot } = require("../../electron/lib/user-data-root.cjs");
const { resolveProfilesRoot } = require("../../electron/lib/profiles-location.cjs");

function profilesDir(root) {
  const configured = process.env.STEALTH_PROFILES_DIR;
  if (configured && fs.existsSync(configured)) return configured;
  return resolveProfilesRoot(root);
}

function listDiskIds(dir) {
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
  );
}

function nextNumericName() {
  const rows = profileService.listProfilesLite();
  let max = 0;
  for (const p of rows) {
    const n = Number(String(p.name || "").replace(/\D/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(4, "0");
}

async function main() {
  const importDiskOnly = process.argv.includes("--import-disk-only");
  process.env.STEALTH_DEV_ISOLATED = "0";
  const root =
    process.env.STEALTH_USER_DATA ||
    resolveStealthUserDataRoot({ packaged: true });
  const diskPath = profilesDir(root);
  const diskIds = listDiskIds(diskPath);

  await openDatabase(root);
  const rows = profileService.listProfilesLite();
  const dbIds = new Set(rows.map((p) => String(p.id)));
  const onDisk = rows.filter((p) => diskIds.has(String(p.id))).length;
  const catalogOnly = rows.length - onDisk;
  const diskOnly = [...diskIds].filter((id) => !dbIds.has(id));

  const report = {
    ok: true,
    mode: importDiskOnly ? "import-disk-only" : "report",
    userData: root,
    profilesDir: diskPath,
    dbRows: rows.length,
    diskFolders: diskIds.size,
    onDisk,
    catalogOnlyStubs: catalogOnly,
    diskOnlyFolders: diskOnly.length,
    diskOnlySample: diskOnly.slice(0, 20),
    note:
      "catalogOnlyStubs = names in SQLite without Chromium folder yet. Launch creates the folder. " +
      "Do NOT prune them unless you intentionally want a disk-matched catalog (--apply --force).",
  };
  console.log(JSON.stringify(report, null, 2));

  if (!importDiskOnly) {
    closeDatabase();
    return;
  }

  let imported = 0;
  for (const id of diskOnly) {
    if (profileService.getProfile(id)) continue;
    const name = nextNumericName();
    // createProfile always allocates a new UUID — insert retaining folder id.
    const now = new Date().toISOString();
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const { getDb } = require("../../electron/db/init.cjs");
    getDb()
      .prepare(
        `INSERT INTO profiles
           (id, name, group_id, proxy, fingerprint_seed, note, status,
            platform, timezone, locale, user_agent, viewport_w, viewport_h, color_scheme, device_preset,
            headless, humanize, window_mode, startup_url, extension_overrides,
            created_at, updated_at)
         VALUES (?, ?, 'default', NULL, ?, 'Imported from disk folder', 'closed',
                 'windows', NULL, NULL, NULL, 0, 0, '', 'custom',
                 0, 1, 'host-maximized', '', NULL, ?, ?)`,
      )
      .run(id, name, seed, now, now);
    imported += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        imported,
        dbRowsAfter: profileService.countProfiles(),
      },
      null,
      2,
    ),
  );
  closeDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
