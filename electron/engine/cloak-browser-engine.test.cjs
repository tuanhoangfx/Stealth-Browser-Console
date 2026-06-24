const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromeExtensionArgs } = require("./cloak-browser-engine.cjs");
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
