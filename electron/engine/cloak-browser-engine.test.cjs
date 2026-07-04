const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildProfileMarkerArgs, buildStealthChromeArgs, chromeExtensionArgs } = require("./cloak-browser-engine.cjs");
const { unpackedExtensionId } = require("../lib/profile-chrome-preferences.cjs");

describe("chromeExtensionArgs", () => {
  it("uses extension ids for disable-extensions-except and paths for load-extension", () => {
    const dir = path.join("C:", "cache", "e0001");
    const [exceptFlag, loadFlag] = chromeExtensionArgs([dir]);
    const id = unpackedExtensionId(dir);
    assert.equal(exceptFlag, `--disable-extensions-except=${id}`);
    assert.equal(loadFlag, `--load-extension=${path.resolve(dir).replace(/\\/g, "/")}`);
  });
});

describe("native extension launch mode", () => {
  it("defaults to native (no managed flags required)", () => {
    const prev = process.env.STEALTH_EXTENSION_MODE;
    delete process.env.STEALTH_EXTENSION_MODE;
    delete require.cache[require.resolve("../lib/extension-launch-mode.cjs")];
    const { nativeExtensionsEnabled } = require("../lib/extension-launch-mode.cjs");
    assert.equal(nativeExtensionsEnabled(), true);
    if (prev === undefined) delete process.env.STEALTH_EXTENSION_MODE;
    else process.env.STEALTH_EXTENSION_MODE = prev;
  });
});

describe("profile launch markers", () => {
  it("adds profile id and user data tag near the front of chrome args", () => {
    const profile = { id: "abc-123", fingerprintSeed: 424242 };
    const markers = buildProfileMarkerArgs(profile, "C:\\Users\\me\\AppData\\Roaming\\stealth-browser-console-dev");
    assert.deepEqual(markers, [
      "--stealth-profile-id=abc-123",
      "--stealth-user-data-tag=stealth-browser-console-dev",
    ]);

    const args = buildStealthChromeArgs(profile, "C:\\Users\\me\\AppData\\Roaming\\stealth-browser-console-dev");
    assert.equal(args[0], "--fingerprint=424242");
    assert.equal(args[1], "--stealth-profile-id=abc-123");
    assert.equal(args[2], "--stealth-user-data-tag=stealth-browser-console-dev");
  });
});
