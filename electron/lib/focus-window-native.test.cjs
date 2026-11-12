const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const powershellExec = require("./powershell-exec.cjs");
const {
  getOrphanUser32Api,
  findMainWindowForPidsNative,
  hasMainWindowForPidNative,
  focusProfileBrowserWindow,
} = require("./profile-browser-orphan.cjs");
const { listLiveCloakWindows } = require("./list-live-cloak-windows.cjs");
const { waitForBrowserMainWindow } = require("./profile-taskbar-native.cjs");

test("getOrphanUser32Api loads native user32 bindings on win32", { skip: process.platform !== "win32" }, () => {
  const api = getOrphanUser32Api();
  assert.ok(api, "expected native user32 koffi API");
  assert.equal(typeof api.enumDesktopWindowsWithVisitor, "function");
  assert.equal(typeof api.SetForegroundWindow, "function");
  assert.equal(typeof api.MoveWindow, "function");
  assert.equal(findMainWindowForPidsNative([]), 0);
  assert.equal(hasMainWindowForPidNative(-1), false);
  assert.equal(hasMainWindowForPidNative(99999999), false);
});

test("focusProfileBrowserWindow returns not-running in <50ms without spawning PowerShell", { skip: process.platform !== "win32" }, async () => {
  let psCalled = 0;
  const origAsync = powershellExec.runPowerShellCommandAsync;
  powershellExec.runPowerShellCommandAsync = async (...args) => {
    psCalled++;
    return origAsync(...args);
  };
  try {
    const fakeDir = path.join(os.tmpdir(), `stealth-nonexistent-profile-${Date.now()}`);
    const t0 = performance.now();
    const res = await focusProfileBrowserWindow(fakeDir);
    const elapsedMs = performance.now() - t0;
    assert.deepEqual(res, { ok: false, reason: "not-running" });
    assert.equal(psCalled, 0, "must not spawn PowerShell when native koffi API is loaded");
    assert.ok(elapsedMs < 150, `expected fast native scan (<150ms), took ${elapsedMs.toFixed(1)}ms`);
  } finally {
    powershellExec.runPowerShellCommandAsync = origAsync;
  }
});

test("listLiveCloakWindows scans natively without spawning PowerShell and read-only HWND lookup works", { skip: process.platform !== "win32" }, () => {
  let psSyncCalled = 0;
  const origSync = powershellExec.runPowerShellCommand;
  powershellExec.runPowerShellCommand = (...args) => {
    psSyncCalled++;
    return origSync(...args);
  };
  try {
    const t0 = performance.now();
    const rows = listLiveCloakWindows();
    const elapsedMs = performance.now() - t0;
    assert.ok(Array.isArray(rows));
    assert.equal(psSyncCalled, 0, "listLiveCloakWindows must not spawn synchronous PowerShell");
    assert.ok(elapsedMs < 150, `expected <150ms native scan, took ${elapsedMs.toFixed(1)}ms`);
    if (rows.length > 0) {
      const firstOnlyRows = listLiveCloakWindows({ firstOnly: true });
      assert.equal(firstOnlyRows.length, 1);
      assert.ok(firstOnlyRows[0].dir.length > 0);
      assert.ok(firstOnlyRows[0].browserPid > 0);
      const hwnd = findMainWindowForPidsNative([firstOnlyRows[0].browserPid]);
      assert.equal(typeof hwnd, "number");
    }
  } finally {
    powershellExec.runPowerShellCommand = origSync;
  }
});

test("waitForBrowserMainWindow exits early on dead PID without spawning PowerShell", { skip: process.platform !== "win32" }, async () => {
  const t0 = performance.now();
  const ok = await waitForBrowserMainWindow(99999999, { timeoutMs: 1500, intervalMs: 25 });
  const elapsedMs = performance.now() - t0;
  assert.equal(ok, false);
  assert.ok(elapsedMs < 200, `expected immediate exit on dead PID (<200ms), took ${elapsedMs.toFixed(1)}ms`);
});
