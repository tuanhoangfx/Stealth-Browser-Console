const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COOKIE_BRIDGE_STORE_ID,
} = require("./cookie-bridge-store.cjs");
const {
  SURFSHARK_STORE_ID,
  DEFAULT_EXTENSION_TOGGLES,
  normalizeExtensionToggles,
  isStoreExtensionAllowed,
  anyExtensionToggleEnabled,
  allExtensionTogglesEnabled,
} = require("./extension-toggles.cjs");

test("default toggles enable E0001 only", () => {
  assert.equal(DEFAULT_EXTENSION_TOGGLES.e0001, true);
  assert.equal(DEFAULT_EXTENSION_TOGGLES.surfshark, false);
  assert.equal(DEFAULT_EXTENSION_TOGGLES.webStore, false);
});

test("normalizeExtensionToggles coerces booleans", () => {
  assert.deepEqual(normalizeExtensionToggles({ e0001: false, surfshark: true }), {
    e0001: false,
    surfshark: true,
    webStore: false,
  });
});

test("isLocalExtensionAllowed is shelved off", () => {
  const { isLocalExtensionAllowed } = require("./extension-toggles.cjs");
  assert.equal(isLocalExtensionAllowed({ e0001: true, surfshark: true, webStore: true }), false);
});

test("isStoreExtensionAllowed respects per-kind toggles", () => {
  const toggles = { e0001: true, surfshark: false, webStore: false };
  assert.equal(isStoreExtensionAllowed(COOKIE_BRIDGE_STORE_ID, toggles), true);
  assert.equal(isStoreExtensionAllowed(SURFSHARK_STORE_ID, toggles), false);
  assert.equal(isStoreExtensionAllowed("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", toggles), false);
});

test("anyExtensionToggleEnabled and allExtensionTogglesEnabled", () => {
  const partial = { e0001: true, surfshark: false, webStore: false };
  assert.equal(anyExtensionToggleEnabled(partial), true);
  assert.equal(allExtensionTogglesEnabled(partial), false);
  const all = { e0001: true, surfshark: true, webStore: true };
  assert.equal(allExtensionTogglesEnabled(all), true);
});

test("resolveEffectiveExtensionToggles merges profile overrides", () => {
  const { resolveEffectiveExtensionToggles } = require("./extension-toggles.cjs");
  const global = { e0001: true, surfshark: false, webStore: false };
  assert.deepEqual(resolveEffectiveExtensionToggles(global, { surfshark: true }), {
    e0001: true,
    surfshark: true,
    webStore: false,
  });
});
