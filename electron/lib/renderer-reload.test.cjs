const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isRendererReloadShortcut } = require("./renderer-reload.cjs");

test("Shift+F5 / F5 / Ctrl+R are renderer reload shortcuts", () => {
  assert.equal(isRendererReloadShortcut({ type: "keyDown", key: "F5", shift: true }), true);
  assert.equal(isRendererReloadShortcut({ type: "keyDown", key: "f5" }), true);
  assert.equal(isRendererReloadShortcut({ type: "keyDown", key: "R", control: true }), true);
  assert.equal(isRendererReloadShortcut({ type: "keyDown", key: "R", meta: true }), true);
});

test("typing and other chords are not reload", () => {
  assert.equal(isRendererReloadShortcut({ type: "keyUp", key: "F5" }), false);
  assert.equal(isRendererReloadShortcut({ type: "keyDown", key: "R" }), false);
  assert.equal(isRendererReloadShortcut({ type: "keyDown", key: "F12" }), false);
});
