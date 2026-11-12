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
    if (process.platform === "win32") {
      assert.equal(
        unpackedExtensionId("E:/Dev/Extension/E0002-browser-operator"),
        "ckalnmjdalpecadefcppeohmdgocgjlj",
      );
    }
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

  it("heals poisoned empty serviceworkerevents and clears stale HMAC in Secure Preferences", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-heal-sec-"));
    const userDataDir = path.join(root, "profiles", "p0004");
    const extDir = path.join(root, "stage", "kaaadageakdandpobcofplmfbjfjabdk");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "manifest.json"), JSON.stringify({ name: "E0001 Cookie Bridge" }), "utf8");
    const extId = unpackedExtensionId(extDir);

    const secFile = path.join(userDataDir, "Default", "Secure Preferences");
    fs.mkdirSync(path.dirname(secFile), { recursive: true });
    fs.writeFileSync(
      secFile,
      JSON.stringify({
        extensions: {
          settings: {
            [extId]: {
              location: 8,
              path: extDir,
              disable_reasons: [],
              serviceworkerevents: [],
              service_worker_registration_info: { version: "1.2.5" },
            },
          },
        },
        protection: {
          macs: {
            extensions: {
              settings: {
                [extId]: "DEADMAC123456",
              },
            },
          },
        },
      }),
      "utf8",
    );

    pinToolbarExtension(userDataDir, extDir);
    const healedSec = JSON.parse(fs.readFileSync(secFile, "utf8"));
    assert.equal(healedSec.extensions.settings[extId].state, 1);
    assert.equal(healedSec.extensions.settings[extId].disable_reasons, undefined);
    assert.equal(healedSec.extensions.settings[extId].serviceworkerevents, undefined);
    assert.equal(healedSec.extensions.settings[extId].service_worker_registration_info, undefined);
    assert.equal(healedSec.protection.macs.extensions.settings[extId], undefined);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
