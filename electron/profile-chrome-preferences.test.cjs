const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { unpackedExtensionId, pinToolbarExtension, unpinExtensionFromProfile } = require("./lib/profile-chrome-preferences.cjs");

describe("profile-chrome-preferences", () => {
  it("computes stable unpacked extension id", () => {
    const dir = path.join("C:", "tmp", "identity-toolbar", "abc");
    const a = unpackedExtensionId(dir);
    const b = unpackedExtensionId(dir);
    assert.equal(a, b);
    assert.match(a, /^[a-p]{32}$/);
  });

  it("pins extension in Preferences before launch", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-pin-"));
    const userDataDir = path.join(root, "profiles", "p1");
    const extDir = path.join(root, "identity-toolbar", "p1");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "manifest.json"), "{}", "utf8");

    const extId = pinToolbarExtension(userDataDir, extDir);
    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    assert.ok(prefs.extensions.pinned_extensions.includes(extId));
    assert.ok(prefs.extensions.toolbar.pinned_extension_ids.includes(extId));
    assert.equal(prefs.extensions.settings[extId].state, 1);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("unpins extension from Preferences by unpacked path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-unpin-"));
    const userDataDir = path.join(root, "profiles", "p1");
    const extDir = path.join(root, "local-ext");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "manifest.json"), "{}", "utf8");
    const extId = pinToolbarExtension(userDataDir, extDir);
    const result = unpinExtensionFromProfile(userDataDir, { unpackedPath: extDir });
    assert.equal(result.changed, true);
    assert.ok(result.ids.includes(extId));
    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    assert.equal(prefs.extensions.settings?.[extId], undefined);
    assert.equal((prefs.extensions.pinned_extensions || []).includes(extId), false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
