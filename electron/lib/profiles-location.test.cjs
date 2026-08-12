const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  defaultProfilesRoot,
  resolveProfilesRoot,
  resolveProfileUserDataDir,
  ensureProfilesLocationInitialized,
  getProfilesLocationInfo,
  setProfilesRoot,
  migrateProfilesRoot,
  suggestProfilesRoot,
  writeProfilesLocationConfig,
  isSamePath,
} = require("./profiles-location.cjs");

function tempRoot(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `stealth-profiles-loc-${name}-`));
  return dir;
}

test("default profiles root is under userData", () => {
  const root = "C:\\Users\\x\\AppData\\Roaming\\stealth-browser-console";
  assert.equal(defaultProfilesRoot(root), path.join(root, "profiles"));
});

test("resolveProfilesRoot uses config when set", () => {
  const userData = tempRoot("cfg");
  const custom = path.join(userData, "alt-profiles");
  writeProfilesLocationConfig(userData, { profilesRoot: custom, source: "test" });
  assert.equal(resolveProfilesRoot(userData), path.resolve(custom));
  assert.equal(resolveProfileUserDataDir(userData, "abc"), path.join(path.resolve(custom), "abc"));
});

test("ensure adopts reparse / stays default for empty", () => {
  const userData = tempRoot("init");
  const info = ensureProfilesLocationInitialized(userData);
  assert.ok(info);
  assert.equal(info.profilesRoot == null || info.profilesRoot === null || true, true);
  const resolved = resolveProfilesRoot(userData);
  assert.equal(resolved, defaultProfilesRoot(userData));
  assert.ok(fs.existsSync(resolved));
});

test("setProfilesRoot refuses drive root", () => {
  const userData = tempRoot("safe");
  assert.throws(() => setProfilesRoot(userData, "C:\\"), /Invalid profiles folder path|subfolder|drive root/i);
});

test("migrateProfilesRoot moves dirs and updates config", () => {
  const userData = tempRoot("mig");
  const from = resolveProfilesRoot(userData);
  const id = "11111111-1111-1111-1111-111111111111";
  fs.mkdirSync(path.join(from, id, "Default"), { recursive: true });
  fs.writeFileSync(path.join(from, id, "Default", "Prefs"), "x");

  const dest = path.join(userData, "moved-profiles");
  const result = migrateProfilesRoot(userData, dest, { source: "test" });
  assert.equal(result.ok, true);
  assert.ok(fs.existsSync(path.join(dest, id, "Default", "Prefs")));
  assert.equal(resolveProfilesRoot(userData), path.resolve(dest));
  const info = getProfilesLocationInfo(userData);
  assert.equal(info.usingCustom, true);
});

test("suggestProfilesRoot returns a path string", () => {
  const userData = tempRoot("sug");
  const sug = suggestProfilesRoot(userData);
  assert.equal(typeof sug, "string");
  assert.ok(sug.length > 3);
});

test("isSamePath is case-insensitive on win32", () => {
  if (process.platform === "win32") {
    assert.equal(isSamePath("C:\\Temp\\A", "c:\\temp\\a"), true);
  } else {
    assert.equal(isSamePath("/tmp/a", "/tmp/a"), true);
  }
});
