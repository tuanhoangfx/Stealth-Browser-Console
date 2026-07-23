const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isAgentPoolProfileCode,
  shouldSkipTaskbarBadge,
  readTaskbarHintPid,
  isRetryableTaskbarFailure,
} = require("./profile-taskbar-native.cjs");
const { writeSidecarPid, removeSidecarPid } = require("./profile-user-data-repair.cjs");

describe("profile-taskbar-native skip rules", () => {
  it("agent pool 9990–9999 skipped", () => {
    assert.equal(isAgentPoolProfileCode("9990"), true);
    assert.equal(isAgentPoolProfileCode("9999"), true);
    assert.equal(isAgentPoolProfileCode("9989"), false);
    assert.equal(isAgentPoolProfileCode("0125"), false);
  });

  it("shouldSkipTaskbarBadge — headless or agent pool", () => {
    assert.equal(shouldSkipTaskbarBadge("0125", { headless: true }), true);
    assert.equal(shouldSkipTaskbarBadge("9990", {}), true);
    assert.equal(shouldSkipTaskbarBadge("0125", {}), false);
  });
});

describe("readTaskbarHintPid", () => {
  it("prefers live hinted pid over sidecar", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-hint-"));
    try {
      writeSidecarPid(dir, { pid: 2222, debugPort: 0 });
      assert.equal(readTaskbarHintPid(dir, process.pid), process.pid);
    } finally {
      removeSidecarPid(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads live sidecar when hint missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-hint-"));
    try {
      writeSidecarPid(dir, { pid: process.pid, debugPort: 0 });
      assert.equal(readTaskbarHintPid(dir, 0), process.pid);
    } finally {
      removeSidecarPid(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips dead hinted pid and reads live sidecar", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-hint-"));
    try {
      writeSidecarPid(dir, { pid: process.pid, debugPort: 0 });
      assert.equal(readTaskbarHintPid(dir, 2_147_000_000), process.pid);
    } finally {
      removeSidecarPid(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("isRetryableTaskbarFailure", () => {
  it("retries not-running and NOHWND, not OK_ICON", () => {
    assert.equal(isRetryableTaskbarFailure({ ok: true, detail: "OK_ICON" }), false);
    assert.equal(isRetryableTaskbarFailure({ ok: false, reason: "not-running" }), true);
    assert.equal(isRetryableTaskbarFailure({ ok: false, reason: "NOHWND" }), true);
    assert.equal(isRetryableTaskbarFailure({ ok: false, reason: "taskbar-apply-worker-request-timeout" }), true);
    assert.equal(isRetryableTaskbarFailure({ ok: false, reason: "empty-title" }), false);
  });
});

describe("HOT_ICO_SIZES", () => {
  it("keeps hot ICO to 48/32/16 for fast cold render", () => {
    const { HOT_ICO_SIZES } = require("./profile-taskbar-native.cjs");
    assert.deepEqual([...HOT_ICO_SIZES], [48, 32, 16]);
  });
});
