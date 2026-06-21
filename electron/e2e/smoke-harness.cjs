const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const {
  validateCreateProfilePayload,
  validateOpenUrlPayload,
  validateTargetUrl
} = require("../ipc-contracts.cjs");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-e2e-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  try {
    await openDatabase(tmpRoot);

  // IPC contracts
  assert(validateTargetUrl("https://example.com") === "https://example.com/", "validateTargetUrl");
  assert(validateCreateProfilePayload({ name: "E2E" }).name === "E2E", "validateCreateProfilePayload");
  const openPayload = validateOpenUrlPayload({ profileId: "p1", targetUrl: "https://example.com" });
  assert(openPayload.profileId === "p1" && openPayload.screenshot === true, "validateOpenUrlPayload");

  // Profile CRUD
  const created = profileService.createProfile({ name: "E2E Profile", note: "smoke" });
  assert(created?.id, "createProfile");
  profileService.updateProfile(created.id, { status: "running", fingerprintSeed: 424242 });
  const updated = profileService.getProfile(created.id);
  assert(updated?.status === "running" && updated.fingerprintSeed === 424242, "updateProfile fingerprint");

  // Groups
  const group = profileService.createGroup("QA Group");
  assert(group?.id, "createGroup");
  profileService.updateGroup(group.id, "QA Updated");
  profileService.updateProfile(created.id, { groupId: group.id });
  const grouped = profileService.getProfile(created.id);
  assert(grouped?.groupId === group.id, "assign group");

  // Runs
  profileService.insertRun({
    id: "run-e2e-1",
    profileId: created.id,
    workflow: "open-url",
    targetUrl: "https://example.com",
    status: "success",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 120,
    logsJson: JSON.stringify([{ level: "info", message: "ok", time: new Date().toISOString() }])
  });
  const runs = profileService.listRuns(10);
  assert(runs.length === 1 && runs[0].targetUrl === "https://example.com", "insertRun/listRuns");

  // Export / import roundtrip
  const bundle = profileService.exportProfilesBundle();
  assert(Array.isArray(bundle.profiles) && bundle.profiles.length >= 1, "exportProfilesBundle");
  profileService.deleteProfile(created.id);
  assert(profileService.listProfiles().length === 0, "deleteProfile");
  const imported = profileService.importProfilesBundle(bundle, { merge: true });
  assert(imported.imported >= 1 && profileService.listProfiles().length >= 1, "importProfilesBundle");

  // Cleanup group (must be empty of profiles first — move to default)
  const reimported = profileService.getProfile(created.id);
  if (reimported) profileService.updateProfile(reimported.id, { groupId: "default" });
  profileService.deleteGroup(group.id);

  // Seed profiles
  profileService.ensureSeedProfiles();
  assert(profileService.listProfiles().length >= 1, "ensureSeedProfiles");

    console.log("electron-e2e-smoke: ok");
  } finally {
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
