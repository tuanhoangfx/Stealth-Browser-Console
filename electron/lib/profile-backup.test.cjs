const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  sanitizeProfileFolderName,
  buildProfileExportFilename,
  buildFolderMap,
  filterCatalogBundle,
  resolveRestoreTargetId,
  backupProfilesState,
  restoreProfilesState,
} = require("./profile-backup.cjs");

test("sanitizeProfileFolderName strips invalid characters", () => {
  assert.equal(sanitizeProfileFolderName('bad<>name'), "bad__name");
});

test("buildProfileExportFilename uses profile name and timestamp", () => {
  const name = buildProfileExportFilename(["Stealth Demo"], "zip");
  assert.match(name, /^Stealth Demo_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/);
});

test("buildFolderMap dedupes sanitized folder names", () => {
  const map = buildFolderMap([{ id: "1", name: "0333" }, { id: "2", name: "0333" }]);
  assert.equal(map.length, 2);
  assert.notEqual(map[0].folder, map[1].folder);
});

test("filterCatalogBundle keeps only selected profile rows", () => {
  const bundle = {
    version: 2,
    profiles: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  };
  const filtered = filterCatalogBundle(bundle, ["b"]);
  assert.equal(filtered.profiles.length, 1);
  assert.equal(filtered.profiles[0].id, "b");
});

test("resolveRestoreTargetId prefers profile id", () => {
  const deps = {
    getProfileById: (id) => (id === "local-1" ? { id: "local-1" } : null),
    findProfilesByName: () => [{ id: "other" }],
  };
  assert.deepEqual(resolveRestoreTargetId({ id: "local-1", name: "0333" }, deps), { id: "local-1" });
});

test("restore into selected profile id applies folder to target not backup name", { skip: process.platform !== "win32" }, () => {
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-restore-into-"));
  const profilesDir = path.join(userDataRoot, "profiles");
  const sourceId = "uuid-0007";
  const targetId = "uuid-3000";
  fs.mkdirSync(path.join(profilesDir, sourceId), { recursive: true });
  fs.writeFileSync(path.join(profilesDir, sourceId, "cookie.txt"), "from-0007");

  const exportBundle = () => ({
    version: 2,
    matchBy: "name",
    groups: [],
    profiles: [{ id: "foreign-0007", name: "0007", groupId: "default", proxy: "", note: "" }],
  });
  const listProfiles = () => [{ id: sourceId, name: "0007", status: "closed" }];
  const findProfilesByName = (name) => (name === "0007" ? [{ id: sourceId }] : []);
  const getProfileById = (id) => {
    if (id === sourceId) return { id: sourceId, name: "0007" };
    if (id === targetId) return { id: targetId, name: "3000" };
    return null;
  };
  const importBundle = () => {
    throw new Error("catalog import should be skipped for restore-into");
  };

  const backup = backupProfilesState(userDataRoot, { exportBundle, listProfiles });
  const restored = restoreProfilesState(userDataRoot, backup.zipPath, {
    importBundle,
    findProfilesByName,
    getProfileById,
    restoreIntoProfileId: targetId,
  });
  assert.equal(restored.restored, 1);
  assert.equal(restored.restoreIntoProfileName, "3000");
  assert.ok(fs.existsSync(path.join(profilesDir, targetId, "cookie.txt")));
  assert.equal(fs.readFileSync(path.join(profilesDir, targetId, "cookie.txt"), "utf8"), "from-0007");

  fs.rmSync(userDataRoot, { recursive: true, force: true });
  try {
    fs.unlinkSync(backup.zipPath);
  } catch {
    /* ignore */
  }
});

test("backup and restore round-trip on Windows", { skip: process.platform !== "win32" }, () => {
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-backup-test-"));
  const profilesDir = path.join(userDataRoot, "profiles");
  const profileId = "local-uuid-1";
  const profileDir = path.join(profilesDir, profileId);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, "marker.txt"), "session-data");

  const exportBundle = () => ({
    version: 2,
    matchBy: "name",
    groups: [],
    profiles: [{ id: "foreign-1", name: "0333", groupId: "default", proxy: "", note: "" }],
  });
  const listProfiles = () => [{ id: profileId, name: "0333", status: "closed" }];
  const findProfilesByName = (name) => (name === "0333" ? [{ id: profileId }] : []);
  const getProfileById = (id) => (id === profileId ? { id: profileId } : null);
  const importBundle = () => ({ ok: true, imported: 1, updated: 1, created: 0, skipped: 0 });

  const backup = backupProfilesState(userDataRoot, { exportBundle, listProfiles });
  assert.ok(fs.existsSync(backup.zipPath));

  fs.rmSync(profileDir, { recursive: true, force: true });
  assert.ok(!fs.existsSync(profileDir));

  const restored = restoreProfilesState(userDataRoot, backup.zipPath, {
    importBundle,
    findProfilesByName,
    getProfileById,
  });
  assert.equal(restored.restored, 1);
  assert.equal(fs.readFileSync(path.join(profileDir, "marker.txt"), "utf8"), "session-data");

  fs.rmSync(userDataRoot, { recursive: true, force: true });
  try {
    fs.unlinkSync(backup.zipPath);
  } catch {
    /* ignore */
  }
});
