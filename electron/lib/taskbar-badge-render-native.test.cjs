const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const powershellExec = require("./powershell-exec.cjs");
const { getGdiBadgeRenderApi } = require("./taskbar-badge-render-native.cjs");
const {
  resolveChromiumExe,
  ensureBadgeIco,
  ensureBadgeIcoFast,
  badgeCachePath,
  applyNativeProfileTaskbarChrome,
  warmTaskbarApplyRuntime,
} = require("./profile-taskbar-native.cjs");
const { runTaskbarApplyWorker } = require("./taskbar-apply-worker.cjs");

test("getGdiBadgeRenderApi loads native GDI+ bindings on win32", { skip: process.platform !== "win32" }, () => {
  const api = getGdiBadgeRenderApi();
  assert.ok(api, "expected native GDI+ badge renderer API");
  assert.ok(api.token > 0);
  assert.equal(typeof api.GdipCreateBitmapFromScan0, "function");
  assert.equal(typeof api.GdipDrawString, "function");
});

test("ensureBadgeIcoFast and ensureBadgeIco render valid Vista ICOs natively with 0 PowerShell spawns", { skip: process.platform !== "win32" }, async () => {
  const chromeExe = resolveChromiumExe();
  if (!chromeExe) return;

  let psFileCalls = 0;
  const origRunFile = powershellExec.runPowerShellFile;
  powershellExec.runPowerShellFile = async (...args) => {
    psFileCalls += 1;
    return origRunFile(...args);
  };

  const codeA = "9871";
  const codeB = "9872";
  const hotA = badgeCachePath(codeA, { hot: true });
  const fullA = badgeCachePath(codeA, { hot: false });
  const hotB = badgeCachePath(codeB, { hot: true });
  for (const p of [hotA, fullA, hotB]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }

  try {
    const outHotA = await ensureBadgeIcoFast(codeA);
    assert.equal(outHotA, hotA);
    assert.ok(fs.existsSync(hotA));
    const hotBuf = fs.readFileSync(hotA);
    assert.equal(hotBuf.readUInt16LE(0), 0);
    assert.equal(hotBuf.readUInt16LE(2), 1); // ICO type = 1
    assert.equal(hotBuf.readUInt16LE(4), 3); // 48, 32, 16 frames

    // Second profile code uses warm in-memory base icon cache (<50ms)
    const tWarm = performance.now();
    const outHotB = await ensureBadgeIcoFast(codeB);
    const warmMs = performance.now() - tWarm;
    assert.equal(outHotB, hotB);
    assert.ok(fs.existsSync(hotB));
    assert.ok(warmMs < 100, `expected warm native ICO render <100ms, got ${warmMs.toFixed(1)}ms`);

    const outFullA = await ensureBadgeIco(codeA);
    assert.equal(outFullA, fullA);
    const fullBuf = fs.readFileSync(fullA);
    assert.equal(fullBuf.readUInt16LE(4), 9); // all 9 BADGE_ICO_SIZES frames
    assert.equal(psFileCalls, 0, "must not spawn render-taskbar-badge.ps1");
  } finally {
    powershellExec.runPowerShellFile = origRunFile;
    for (const p of [hotA, fullA, hotB]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
});

test("runTaskbarApplyWorker and applyNativeProfileTaskbarChrome execute via koffi with 0 PowerShell spawns", { skip: process.platform !== "win32" }, async () => {
  await warmTaskbarApplyRuntime();
  const warmResp = await runTaskbarApplyWorker({ warm: true });
  assert.equal(warmResp.result, "OK_WARM");
  assert.equal(warmResp.via, "koffi");

  const fakeDir = path.join(os.tmpdir(), `stealth-nohwnd-test-${Date.now()}`);
  const applyRes = await applyNativeProfileTaskbarChrome(fakeDir, "0987 — Test", "0987", {
    pidWaitMs: 0,
    hwndWaitMs: 0,
  });
  assert.equal(applyRes.ok, false);
  assert.equal(applyRes.via, "koffi");
});
