const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  setShutdownReason,
  consumeShutdownReason,
  writeShutdownLog,
  writeBootLog,
  readLifecycleLog,
  logPath,
} = require("./shutdown-log.cjs");

test("setShutdownReason is consumed once on write", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-shutdown-"));
  setShutdownReason("window-all-closed");
  writeShutdownLog(dir, { runningProfiles: 2, version: "6.1.1" });
  assert.equal(consumeShutdownReason(), "unknown");
  const file = logPath(dir);
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const row = JSON.parse(lines[0]);
  assert.equal(row.kind, "shutdown");
  assert.equal(row.reason, "window-all-closed");
  assert.equal(row.runningProfiles, 2);
});

test("writeBootLog appends boot row", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-shutdown-"));
  writeBootLog(dir, { version: "6.1.1", packaged: true });
  const row = JSON.parse(fs.readFileSync(logPath(dir), "utf8").trim());
  assert.equal(row.kind, "boot");
  assert.equal(row.packaged, true);
});

test("readLifecycleLog returns parsed tail", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-shutdown-"));
  writeBootLog(dir, { version: "1.0.0" });
  setShutdownReason("menu-quit");
  const { setShutdownDetails } = require("./shutdown-log.cjs");
  setShutdownDetails({ updateVersion: "6.1.1", updateState: "downloaded" });
  writeShutdownLog(dir, { runningProfiles: 1 });
  const rows = readLifecycleLog(dir, 10);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].updateVersion, "6.1.1");
});
