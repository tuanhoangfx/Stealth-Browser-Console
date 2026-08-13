#!/usr/bin/env node
/**
 * Electron-node worker: prune catalog orphans (DB rows without profiles/{id} folder).
 * Invoked by prune-catalog-orphans.mjs via spawnElectronNode.
 */
const fs = require("fs");
const path = require("path");
const { openDatabase, closeDatabase, getDb } = require("../../electron/db/init.cjs");
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

async function main() {
  const apply = process.argv.includes("--apply");
  // Packaged/prod catalog — never isolated -dev for this prune.
  process.env.STEALTH_DEV_ISOLATED = "0";
  const root =
    process.env.STEALTH_USER_DATA ||
    resolveStealthUserDataRoot({ packaged: true });
  const diskPath = profilesDir(root);
  const diskIds = listDiskIds(diskPath);

  await openDatabase(root);
  const rows = profileService.listProfilesLite();
  const orphanIds = rows.filter((p) => !diskIds.has(String(p.id))).map((p) => String(p.id));
  const keepIds = rows.filter((p) => diskIds.has(String(p.id))).map((p) => String(p.id));
  const diskOnly = [...diskIds].filter((id) => !rows.some((p) => String(p.id) === id));

  const report = {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    userData: root,
    profilesDir: diskPath,
    dbRows: rows.length,
    diskFolders: diskIds.size,
    keep: keepIds.length,
    orphanDbRows: orphanIds.length,
    diskOnlyFolders: diskOnly.length,
    diskOnlySample: diskOnly.slice(0, 20),
  };
  console.log(JSON.stringify(report, null, 2));

  if (!apply) {
    closeDatabase();
    return;
  }

  if (orphanIds.length === 0) {
    console.log("prune-catalog-orphans: nothing to delete");
    closeDatabase();
    return;
  }

  // Safety: bulk stub prune (catalog >> disk) needs --force. Disk cleanup once wiped 4543 names.
  const force = process.argv.includes("--force");
  if (orphanIds.length > Math.max(50, keepIds.length) && !force) {
    console.error(
      `prune-catalog-orphans: refusing to delete ${orphanIds.length} orphan rows (keep=${keepIds.length}). ` +
        `Pass --force if you intentionally want a disk-matched catalog only.`,
    );
    closeDatabase();
    process.exit(3);
  }

  // Wrapper getDb() may not expose better-sqlite3 .transaction — loop is fine for one-shot prune.
  const delRuns = getDb().prepare("DELETE FROM runs WHERE profile_id = ?");
  let runsDeleted = 0;
  for (const id of orphanIds) {
    runsDeleted += delRuns.run(id).changes ?? 0;
  }

  const result = profileService.deleteProfiles(orphanIds);
  const after = profileService.countProfiles();
  console.log(
    JSON.stringify(
      {
        ok: true,
        deletedProfiles: result.count ?? orphanIds.length,
        runsDeleted,
        dbRowsAfter: after,
        diskOnlyFolders: diskOnly.length,
      },
      null,
      2,
    ),
  );
  closeDatabase();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  try {
    closeDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
