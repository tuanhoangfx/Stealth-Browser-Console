const test = require("node:test");
const assert = require("node:assert/strict");

const MODULE_PATH = "./app-settings.cjs";

function loadFresh() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

test("extension toggles default to E0001 and E0002", () => {
  const mod = loadFresh();
  assert.deepEqual(mod.getExtensionToggles(), { e0001: true, e0002: true, surfshark: false, webStore: false });
});

test("getProfileExtensionsEnabled true when E0001 default on", () => {
  const mod = loadFresh();
  assert.equal(mod.getProfileExtensionsEnabled(), true);
});

test("EXTENSION_TOGGLES_KEY is exported", () => {
  const mod = loadFresh();
  assert.equal(mod.EXTENSION_TOGGLES_KEY, "extension_toggles_v1");
});
