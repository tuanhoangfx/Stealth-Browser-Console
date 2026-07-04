const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  removeStaleProfileArtifacts,
  PROFILE_LOCK_FILES,
  waitForProfileUnlock,
  writeSidecarPid,
  readSidecarPid,
  removeSidecarPid,
  SIDECAR_PID_FILE,
} = require("./profile-user-data-repair.cjs");

function testRemoveStaleProfileArtifacts() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-profile-repair-"));
  try {
    for (const name of PROFILE_LOCK_FILES) {
      fs.writeFileSync(path.join(dir, name), "lock");
    }
    fs.writeFileSync(path.join(dir, "DevToolsActivePort"), "9222\n");
    removeStaleProfileArtifacts(dir);
    for (const name of [...PROFILE_LOCK_FILES, "DevToolsActivePort"]) {
      assert.equal(fs.existsSync(path.join(dir, name)), false, `expected removed: ${name}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testWaitForProfileUnlock() {
  if (process.platform !== "win32") return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-profile-unlock-"));
  const lockFile = path.join(dir, "lockfile");
  let handle = null;
  try {
    handle = fs.openSync(lockFile, "w");
    setTimeout(() => {
      try {
        if (handle != null) fs.closeSync(handle);
      } catch {
        // ignore late close
      }
      handle = null;
    }, 140);
    const result = await waitForProfileUnlock(dir, { timeoutMs: 1500, intervalMs: 40 });
    assert.equal(result.released, true, "expected profile unlock to release after handle closes");
    assert.equal(fs.existsSync(lockFile), false, "expected stale lockfile removed after unlock");
  } finally {
    try {
      if (handle != null) fs.closeSync(handle);
    } catch {
      // ignore
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testSidecarPid() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-sidecar-pid-"));
  try {
    assert.equal(readSidecarPid(dir), null, "no sidecar before write");
    writeSidecarPid(dir, { pid: 12345, debugPort: 9222 });
    const data = readSidecarPid(dir);
    assert.equal(data.pid, 12345);
    assert.equal(data.debugPort, 9222);
    assert.equal(typeof data.launchedAt, "number");
    assert.ok(fs.existsSync(path.join(dir, SIDECAR_PID_FILE)));
    removeSidecarPid(dir);
    assert.equal(readSidecarPid(dir), null, "sidecar removed");
    assert.equal(fs.existsSync(path.join(dir, SIDECAR_PID_FILE)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  testRemoveStaleProfileArtifacts();
  testSidecarPid();
  await testWaitForProfileUnlock();
  console.log("profile-user-data-repair.test.cjs OK");
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
