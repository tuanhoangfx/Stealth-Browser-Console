/**
 * Verify identity-toolbar purge removes persisted Chrome prefs (manifest name heuristic).
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pinToolbarExtension } = require("../lib/profile-chrome-preferences.cjs");
const {
  purgeAllProfilesIdentityToolbar,
  collectIdentityExtensionIds,
  isIdentityExtensionMeta,
} = require("../lib/profile-chrome-cleanup.cjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-purge-smoke-"));

try {
  const userDataDir = path.join(root, "profiles", "p1");
  const extDir = path.join(root, "identity-toolbar", "p1");
  fs.mkdirSync(extDir, { recursive: true });
  fs.writeFileSync(
    path.join(extDir, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "[1159] · Default",
      description: "Profile identity code tile (Design V2)",
    }),
    "utf8",
  );

  const extId = pinToolbarExtension(userDataDir, extDir);
  const prefsBefore = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
  const settings = prefsBefore.extensions.settings[extId];
  assert(isIdentityExtensionMeta(settings), "heuristic should detect identity extension meta");

  const bulk = purgeAllProfilesIdentityToolbar(root);
  assert(bulk.removed >= 1, "bulk purge should remove entries");
  assert(!fs.existsSync(extDir), "identity-toolbar bundle should be deleted");

  const prefsAfter = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
  const left = collectIdentityExtensionIds(prefsAfter);
  assert(left.length === 0, `prefs should have no identity extensions, got ${left.length}`);

  console.log(`identity-purge-smoke: ok removed=${bulk.removed} prefsCleaned=${bulk.prefsCleaned}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
