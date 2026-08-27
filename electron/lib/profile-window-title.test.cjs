const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const Module = require("node:module");

describe("badge recover cadence", () => {
  it("keeps recover chain short so burst-open does not starve later stamps", () => {
    const { BADGE_RECOVER_DELAYS_MS, INFLIGHT_STALE_MS } = require("./profile-window-title.cjs");
    assert.ok(BADGE_RECOVER_DELAYS_MS.length <= 4);
    assert.ok(BADGE_RECOVER_DELAYS_MS[BADGE_RECOVER_DELAYS_MS.length - 1] <= 20_000);
    assert.ok(INFLIGHT_STALE_MS <= 12_000);
  });
});

describe("scheduleMissingBadgeSweep", () => {
  it("restamps only dirs that never got OK_ICON", async () => {
    const titlePath = require.resolve("./profile-window-title.cjs");
    const nativePath = require.resolve("./profile-taskbar-native.cjs");
    delete require.cache[titlePath];
    delete require.cache[nativePath];
    const applied = [];
    const realNative = require("./profile-taskbar-native.cjs");
    require.cache[nativePath].exports = {
      ...realNative,
      shouldSkipTaskbarBadge: () => false,
      readTaskbarHintPid: () => 7,
      waitForTaskbarHintPid: async () => 7,
      ensureBadgeIcoFast: async () => path.join(os.tmpdir(), "stealth-badge-sweep.ico"),
      applyNativeProfileTaskbarChromeWithRetry: async (dir, title, digits) => {
        applied.push(digits);
        return { ok: true, detail: "OK_ICON", via: "test" };
      },
    };
    delete require.cache[titlePath];
    const { scheduleMissingBadgeSweep } = require("./profile-window-title.cjs");
    const missing = path.join(os.tmpdir(), `stealth-sweep-miss-${Date.now()}`);
    fs.mkdirSync(missing, { recursive: true });
    try {
      scheduleMissingBadgeSweep(
        () => [
          { userDataDir: missing, label: "1103", code: "1103", browserPid: 7, headless: false },
        ],
        { delayMs: 20 },
      );
      await new Promise((r) => setTimeout(r, 80));
      assert.ok(applied.includes("1103"));
    } finally {
      delete require.cache[titlePath];
      delete require.cache[nativePath];
      fs.rmSync(missing, { recursive: true, force: true });
    }
  });
});

describe("scheduleProfileTaskbarBadgeApply reinforce race", () => {
  it("reinforce does not abort in-flight open (same digits)", async () => {
    const titlePath = require.resolve("./profile-window-title.cjs");
    const nativePath = require.resolve("./profile-taskbar-native.cjs");
    delete require.cache[titlePath];
    delete require.cache[nativePath];

    let applyCalls = 0;
    let resolveFirst;
    const firstGate = new Promise((r) => {
      resolveFirst = r;
    });

    const realNative = require("./profile-taskbar-native.cjs");
    const stub = {
      ...realNative,
      shouldSkipTaskbarBadge: () => false,
      readTaskbarHintPid: () => 4242,
      ensureBadgeIcoFast: async () => {
        const p = path.join(os.tmpdir(), "stealth-badge-test.ico");
        if (!fs.existsSync(p)) fs.writeFileSync(p, Buffer.alloc(256));
        return p;
      },
      applyNativeProfileTaskbarChromeWithRetry: async () => {
        applyCalls += 1;
        if (applyCalls === 1) {
          await firstGate;
          return { ok: true, detail: "OK_ICON", via: "worker" };
        }
        return { ok: true, detail: "OK_ICON", via: "worker" };
      },
    };
    require.cache[nativePath].exports = stub;

    delete require.cache[titlePath];
    const { scheduleProfileTaskbarBadgeApply } = require("./profile-window-title.cjs");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-badge-sched-"));
    try {
      scheduleProfileTaskbarBadgeApply(dir, "0125", "0125", { browserPid: 4242 });
      scheduleProfileTaskbarBadgeApply(dir, "0125", "0125", {
        browserPid: 4242,
        force: true,
        isReinforce: true,
      });
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(applyCalls, 1, "reinforce must not abort/restart in-flight open");
      resolveFirst();
      await new Promise((r) => setTimeout(r, 80));
      assert.equal(applyCalls, 2, "pending restamp must run after in-flight open completes");
    } finally {
      delete require.cache[titlePath];
      delete require.cache[nativePath];
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
