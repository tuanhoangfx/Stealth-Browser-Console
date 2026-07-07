#!/usr/bin/env node
/**
 * Remove smoke pager seed profiles from isolated dev SQLite (99001–99021 + note marker).
 * Idempotent — safe after reload-and-verify gate. Web-mock seed is in-memory only (no cleanup).
 */
const { openDatabase, closeDatabase } = require("../../electron/db/init.cjs");
const profileService = require("../../electron/db/profile-service.cjs");
const { resolveStealthUserDataRoot } = require("../../electron/lib/user-data-root.cjs");
const { isSmokePagerProfile } = require("./smoke-pager-profile-range.cjs");

async function main() {
  process.env.STEALTH_DEV_ISOLATED = process.env.STEALTH_DEV_ISOLATED ?? "1";
  const root = resolveStealthUserDataRoot({ packaged: false });
  await openDatabase(root);
  const smokeProfiles = profileService.listProfiles().filter(isSmokePagerProfile);
  if (smokeProfiles.length === 0) {
    console.log("cleanup-smoke-profiles-pager: ok (nothing to remove)");
    closeDatabase();
    return;
  }
  const ids = smokeProfiles.map((row) => row.id);
  const result = profileService.deleteProfiles(ids);
  const after = profileService.countProfiles();
  console.log(
    `cleanup-smoke-profiles-pager: removed ${result.count ?? smokeProfiles.length}, total=${after}`,
  );
  closeDatabase();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
