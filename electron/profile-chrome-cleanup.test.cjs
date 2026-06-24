const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pinToolbarExtension } = require("./lib/profile-chrome-preferences.cjs");
const {
  purgeProfileIdentityToolbar,
  purgeIdentityToolbarRoot,
  purgeBrokenExtensionPrefs,
  collectIdentityExtensionIds,
  collectBrokenExtensionIds,
  isIdentityExtensionMeta,
  isBrokenExtensionPath,
} = require("./lib/profile-chrome-cleanup.cjs");

describe("profile-chrome-cleanup", () => {
  it("purges persisted identity-toolbar extension from Chrome prefs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-purge-"));
    const userDataDir = path.join(root, "profiles", "p1");
    const extDir = path.join(root, "identity-toolbar", "p1");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "manifest.json"), "{}", "utf8");

    const extId = pinToolbarExtension(userDataDir, extDir);
    const prefsBefore = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    assert.ok(collectIdentityExtensionIds(prefsBefore).includes(extId));

    const result = purgeProfileIdentityToolbar(userDataDir, root, "p1");
    assert.ok(result.removed >= 1);
    assert.equal(fs.existsSync(extDir), false);

    const prefsAfter = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    assert.deepEqual(collectIdentityExtensionIds(prefsAfter), []);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("detects identity extension by manifest name heuristic", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-purge-heur-"));
    const userDataDir = path.join(root, "profiles", "p2");
    const extDir = path.join(root, "identity-toolbar", "p2");
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
    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    const settings = prefs.extensions.settings[extId];
    settings.manifest = { name: "uuid-only-name" };
    assert.ok(isIdentityExtensionMeta(settings));

    const result = purgeProfileIdentityToolbar(userDataDir, root, "p2");
    assert.ok(result.removed >= 1);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("removes identity-toolbar root in one shot", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-purge-root-"));
    const bundle = path.join(root, "identity-toolbar", "abc");
    fs.mkdirSync(bundle, { recursive: true });
    fs.writeFileSync(path.join(bundle, "manifest.json"), "{}", "utf8");

    assert.equal(purgeIdentityToolbarRoot(root), true);
    assert.equal(fs.existsSync(path.join(root, "identity-toolbar")), false);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("purges stale .cloakbrowser extension prefs without manifest", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-broken-ext-"));
    const userDataDir = path.join(root, "profiles", "p3");
    const goodDir = path.join(root, "extensions", "e0001");
    fs.mkdirSync(goodDir, { recursive: true });
    fs.writeFileSync(path.join(goodDir, "manifest.json"), JSON.stringify({ name: "E0001 Cookie Bridge" }), "utf8");

    const goodId = pinToolbarExtension(userDataDir, goodDir);
    const prefsFile = path.join(userDataDir, "Default", "Preferences");
    const prefs = JSON.parse(fs.readFileSync(prefsFile, "utf8"));
    const stalePath = path.join(os.homedir(), ".cloakbrowser", "chromium-test", "ofghkhkfcknohmfldabedhpjjabimig");
    prefs.extensions.settings.stale123 = {
      path: stalePath,
      state: 1,
      manifest: { name: "stale" },
    };
    prefs.extensions.pinned_extensions = ["stale123", goodId];
    fs.writeFileSync(prefsFile, JSON.stringify(prefs), "utf8");

    assert.ok(isBrokenExtensionPath(stalePath));
    assert.ok(collectBrokenExtensionIds(prefs).includes("stale123"));

    const result = purgeBrokenExtensionPrefs(userDataDir);
    assert.ok(result.removed >= 1);

    const prefsAfter = JSON.parse(fs.readFileSync(prefsFile, "utf8"));
    assert.equal(prefsAfter.extensions.settings.stale123, undefined);
    assert.ok(prefsAfter.extensions.pinned_extensions.includes(goodId));

    fs.rmSync(root, { recursive: true, force: true });
  });
});
