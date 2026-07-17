const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  prepareProfileForLaunch,
  shouldSkipOrphanProbe,
} = require("./session-manager.cjs");

function tmpProfileDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prep-launch-"));
  fs.mkdirSync(path.join(dir, "Default"), { recursive: true });
  return dir;
}

// Guard the sub-500ms open regression: a cleanly-closed profile must NOT trigger
// the ~3143ms `Get-CimInstance Win32_Process` WMI scan. The clean path only does
// fs.existsSync + process.kill(0), so it returns near-instantly. A generous 1500ms
// threshold reliably catches reintroduction of the 3s scan without CI flakiness.
const WMI_REGRESSION_MS = 1500;

test("prepareProfileForLaunch skips WMI on a cleanly-closed profile", async (t) => {
  await t.test("clean dir (no lock, no sidecar) returns fast without repair", async () => {
    const dir = tmpProfileDir();
    try {
      const started = Date.now();
      const result = await prepareProfileForLaunch(dir);
      const elapsed = Date.now() - started;
      assert.deepEqual(result, { repaired: false });
      assert.ok(elapsed < WMI_REGRESSION_MS, `clean prepare took ${elapsed}ms (WMI scan regression?)`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  await t.test("dead sidecar pid still skips WMI (no live process)", async () => {
    const dir = tmpProfileDir();
    try {
      // A pid that is virtually certain to be dead → process.kill(pid,0) throws
      // → clean path, no WMI scan.
      fs.writeFileSync(
        path.join(dir, "stealth-pid.json"),
        JSON.stringify({ pid: 2147483000, debugPort: 0 }),
        "utf8",
      );
      const started = Date.now();
      const result = await prepareProfileForLaunch(dir);
      const elapsed = Date.now() - started;
      assert.deepEqual(result, { repaired: false });
      assert.ok(elapsed < WMI_REGRESSION_MS, `dead-sidecar prepare took ${elapsed}ms (WMI scan regression?)`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("shouldSkipOrphanProbe skips only when the dir is clean", () => {
  const dir = tmpProfileDir();
  try {
    assert.equal(shouldSkipOrphanProbe(dir, "closed"), true, "clean closed profile → skip probe");
    assert.equal(shouldSkipOrphanProbe(dir, "running"), false, "running status → always probe");
    fs.writeFileSync(path.join(dir, "SingletonLock"), "x", "utf8");
    assert.equal(shouldSkipOrphanProbe(dir, "closed"), false, "lock file present → probe");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
