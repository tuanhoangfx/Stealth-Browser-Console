const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStealthSnapshot } = require("./stealth-snapshot-types.cjs");

test("buildStealthSnapshot sets mismatch when assigned and actual browsers differ", () => {
  const snapshot = buildStealthSnapshot({
    status: "logged_in",
    result_code: "inbox_ok",
    assigned_browser: "0001",
    actual_browser: "0003",
    source: "profile_close",
  });
  assert.equal(snapshot.mismatch, true);
  assert.equal(snapshot.assigned_browser, "0001");
  assert.equal(snapshot.actual_browser, "0003");
  assert.equal(snapshot.v, 1);
});

test("buildStealthSnapshot normalizes unknown status and result codes", () => {
  const snapshot = buildStealthSnapshot({
    status: "INVALID",
    result_code: "bogus",
  });
  assert.equal(snapshot.status, "unknown");
  assert.equal(snapshot.result_code, "detect_failed");
});

test("buildStealthSnapshot keeps explicit mismatch false when browsers match", () => {
  const snapshot = buildStealthSnapshot({
    assigned_browser: "0002",
    actual_browser: "0002",
    mismatch: false,
  });
  assert.equal(snapshot.mismatch, false);
});
