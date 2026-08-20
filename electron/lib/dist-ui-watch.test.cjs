const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isDistWatchName } = require("./dist-ui-watch.cjs");

test("dist-watch only reacts to index.html (not mid-build hashed assets)", () => {
  assert.equal(isDistWatchName("index.html"), true);
  assert.equal(isDistWatchName("assets\\index.html"), true);
  assert.equal(isDistWatchName("assets/index-B-mKAWKm.js"), false);
  assert.equal(isDistWatchName("index-_y-ehsiW.css"), false);
  assert.equal(isDistWatchName(""), false);
});
