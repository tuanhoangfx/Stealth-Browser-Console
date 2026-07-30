#!/usr/bin/env node
/**
 * Seed one recent run + profile event so workflow runtime rail smoke can verify
 * both History and Console are populated on live dev.
 */
const { randomUUID } = require("node:crypto");
const { openDatabase, closeDatabase } = require("../../electron/db/init.cjs");
const profileService = require("../../electron/db/profile-service.cjs");
const { resolveStealthUserDataRoot } = require("../../electron/lib/user-data-root.cjs");

async function main() {
  process.env.STEALTH_DEV_ISOLATED = process.env.STEALTH_DEV_ISOLATED ?? "1";
  const root = resolveStealthUserDataRoot({ packaged: false });
  await openDatabase(root);
  profileService.ensureSeedProfiles();
  const profile = profileService.listProfiles()[0];
  if (!profile?.id) throw new Error("seed-smoke-runtime-rail: no profile available");

  const runs = profileService.listRuns(50);
  const existing = runs.find((run) => run.workflow === "smoke-runtime-rail" && run.profileId === profile.id);
  if (!existing) {
    const startedAt = new Date(Date.now() - 5000).toISOString();
    const finishedAt = new Date(Date.now() - 1000).toISOString();
    profileService.insertRun({
      id: randomUUID(),
      profileId: profile.id,
      workflow: "smoke-runtime-rail",
      targetUrl: "https://example.com/runtime-rail",
      status: "success",
      startedAt,
      finishedAt,
      durationMs: 4000,
      screenshotPath: "",
      error: "",
      logsJson: JSON.stringify([
        { level: "info", message: "Smoke runtime rail seeded log", time: new Date(Date.now() - 3000).toISOString() },
      ]),
    });
    profileService.appendProfileEvent(profile.id, {
      eventType: "launch",
      level: "success",
      message: "Smoke runtime rail seeded event",
    });
    console.log(`seed-smoke-runtime-rail: inserted for ${profile.name}`);
  } else {
    console.log(`seed-smoke-runtime-rail: ok (${existing.id})`);
  }
  closeDatabase();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
