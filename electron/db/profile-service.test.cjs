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
    const rejected = profileService.updateProfile(created.id, { startupUrl: "not a url!" });
    if (rejected?.startupUrl !== "https://google.com/") {
      throw new Error("invalid phrase should not overwrite startup URL");
    }
    const cleared = profileService.updateProfile(created.id, { startupUrl: "" });
    if (cleared?.startupUrl !== "https://www.google.com/") {
      throw new Error("empty startup should default to Google home");
    }
    const touched = profileService.touchLastOpened(created.id);
    if (!touched?.lastOpenedAt) throw new Error("touchLastOpened failed");
    const blank = profileService.updateProfile(created.id, { startupUrl: "about:blank" });
    if (blank?.startupUrl !== "about:blank") throw new Error("about:blank save failed");
    const intranet = profileService.updateProfile(created.id, { startupUrl: "check" });
    if (intranet?.startupUrl !== "http://check/") throw new Error("single-label host should coerce to http://check/");
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

    const fpNoise = profileService.createProfile({ name: "0448", note: "fp-noise" });
    profileService.updateProfile(fpNoise.id, { fingerprintSeed: 1231477890 });
    const exact = profileService.createProfile({ name: "1477", note: "exact" });
    const page = profileService.listProfilesPage({ search: "1477", limit: 50 });
    const names = page.profiles.map((p) => p.name);
    if (!names.includes("1477") || names.includes("0448")) {
      throw new Error(`numeric search expected only 1477, got: ${names.join(", ")}`);
    }

    const bulkByNames = profileService.createProfilesBulkByNames({
      names: ["0009", "0011", "0009", "Profile 1477", "notes-main"],
      defaults: { note: "bulk" },
    });
    if (bulkByNames.created !== 4 || bulkByNames.skippedExisting !== 0 || bulkByNames.duplicateInput !== 1) {
      throw new Error(`bulk create by names unexpected summary: ${JSON.stringify(bulkByNames)}`);
    }

    profileService.createProfile({ name: "Profile 0015", note: "existing-code" });
    const bulkByRange = profileService.createProfilesBulkByRange({
      start: 9,
      end: 16,
      pad: 4,
      defaults: { note: "range" },
    });
    if (bulkByRange.createdNames.includes("0015") || bulkByRange.createdNames.includes("0011")) {
      throw new Error(`bulk range should skip existing numeric codes: ${bulkByRange.createdNames.join(", ")}`);
    }
    if (!bulkByRange.createdNames.includes("0016")) {
      throw new Error(`bulk range should create 0016, got: ${bulkByRange.createdNames.join(", ")}`);
    }

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
