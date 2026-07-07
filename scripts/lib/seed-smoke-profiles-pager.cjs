#!/usr/bin/env node
/**
 * Ensure isolated dev catalog has enough profiles to surface Hub-UI pager (> page size 20).
 * Safe to run repeatedly — skips when count already sufficient.
 */
const { openDatabase, closeDatabase } = require("../../electron/db/init.cjs");
const profileService = require("../../electron/db/profile-service.cjs");
const { resolveStealthUserDataRoot } = require("../../electron/lib/user-data-root.cjs");
const {
  SMOKE_PAGER_MIN_PROFILES,
  SMOKE_RANGE_START,
} = require("./smoke-pager-profile-range.cjs");

async function main() {
  process.env.STEALTH_DEV_ISOLATED = process.env.STEALTH_DEV_ISOLATED ?? "1";
  const root = resolveStealthUserDataRoot({ packaged: false });
  await openDatabase(root);
  profileService.ensureSeedProfiles();
  const before = profileService.countProfiles();
  if (before >= SMOKE_PAGER_MIN_PROFILES) {
    console.log(`seed-smoke-profiles-pager: ok (${before} profiles)`);
    closeDatabase();
    return;
  }
  const needed = SMOKE_PAGER_MIN_PROFILES - before;
  const end = SMOKE_RANGE_START + needed - 1;
  const result = profileService.createProfilesBulkByRange({
    start: SMOKE_RANGE_START,
    end,
    defaults: { note: "smoke pager seed — safe to delete" },
  });
  const after = profileService.countProfiles();
  console.log(
    `seed-smoke-profiles-pager: created ${result.created}, skipped ${result.skippedExisting}, total=${after}`,
  );
  closeDatabase();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
