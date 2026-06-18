const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("./init.cjs");
const profileService = require("./profile-service.cjs");

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-db-test-"));
  try {
    await openDatabase(tmpRoot);
    const created = profileService.createProfile({ name: "Smoke Profile", note: "test" });
    if (!created?.id) throw new Error("createProfile failed");
    const listed = profileService.listProfiles();
    if (listed.length !== 1) throw new Error(`expected 1 profile, got ${listed.length}`);
    profileService.updateProfile(created.id, { status: "running" });
    const updated = profileService.getProfile(created.id);
    if (updated?.status !== "running") throw new Error("updateProfile failed");

    const withUrl = profileService.updateProfile(created.id, { startupUrl: "google.com" });
    if (withUrl?.startupUrl !== "https://google.com/") throw new Error("startupUrl coerce/save failed");
    const rejected = profileService.updateProfile(created.id, { startupUrl: "adobe" });
    if (rejected?.startupUrl !== "https://google.com/") {
      throw new Error("bare keyword should not overwrite startup URL");
    }
    const cleared = profileService.updateProfile(created.id, { startupUrl: "" });
    if (cleared?.startupUrl !== "https://www.google.com/") {
      throw new Error("empty startup should default to Google home");
    }
    const touched = profileService.touchLastOpened(created.id);
    if (!touched?.lastOpenedAt) throw new Error("touchLastOpened failed");
    const blank = profileService.updateProfile(created.id, { startupUrl: "about:blank" });
    if (blank?.startupUrl !== "about:blank") throw new Error("about:blank save failed");
    profileService.insertRun({
      id: "run-1",
      profileId: created.id,
      workflow: "open-url",
      targetUrl: "https://example.com",
      status: "success",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 100,
      logsJson: "[]"
    });
    const runs = profileService.listRuns(10);
    if (runs.length !== 1) throw new Error("insertRun/listRuns failed");
    console.log("profile-service.test: ok");
  } finally {
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
