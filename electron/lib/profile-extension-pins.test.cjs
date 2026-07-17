const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureProfileExtensionPins } = require("./profile-extension-pins.cjs");

// The launch path (prepareNativeExtensionsForLaunch) reuses `plan` from
// ensureProfileExtensionPins instead of running prepareProfileExtensions a
// second time. Lock the returned shape so that contract can't silently drop.
test("ensureProfileExtensionPins exposes a reusable plan field", async (t) => {
  await t.test("returns plan:null when profile id is missing (no DB access)", async () => {
    const res = await ensureProfileExtensionPins(null, "C:/root");
    assert.deepEqual(res, { installed: [], plan: null });
  });

  await t.test("returns plan:null when userDataRoot is missing", async () => {
    const res = await ensureProfileExtensionPins({ id: "abc" }, "");
    assert.deepEqual(res, { installed: [], plan: null });
  });
});
