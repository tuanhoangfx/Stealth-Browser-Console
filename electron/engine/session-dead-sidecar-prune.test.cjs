const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

function clearCaches() {
  const targets = [
    "./session-manager.cjs",
    "./cloak-browser-engine.cjs",
    "../db/profile-service.cjs",
    "../lib/net-port.cjs",
    "../lib/profile-browser-orphan.cjs",
    "../lib/profile-user-data-repair.cjs",
    "../lib/profile-window-title.cjs",
    "../lib/profile-taskbar-native.cjs",
    "../lib/agent-smoke-mode.cjs",
    "../lib/omnibox-search-guard.cjs",
  ];
  for (const rel of targets) {
    try {
      delete require.cache[require.resolve(rel)];
    } catch {
      /* ignore */
    }
  }
}

function loadWithMocks(rootDir) {
  clearCaches();
  const state = {
    sidecars: new Map(),
    alivePids: new Set(),
    nativeHeadedPids: new Map(),
    removedSidecars: [],
    statusChanges: [],
  };

  const installMock = (rel, exportsObj) => {
    const abs = require.resolve(rel);
    require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: exportsObj };
  };

  installMock("./cloak-browser-engine.cjs", {
    profileDataDir: (root, id) => path.join(root, "profiles", String(id)),
    openPureHeadedProfile: async (profile, root, opts = {}) => {
      const dir = path.join(root, "profiles", String(profile.id));
      fs.mkdirSync(dir, { recursive: true });
      const pid = 55001;
      state.alivePids.add(pid);
      state.sidecars.set(dir, { pid, debugPort: Number(opts.debugPort) || 0, headless: false });
      return { pid, userDataDir: dir, debugPort: Number(opts.debugPort) || 0, pureHeaded: true };
    },
    openProfile: async () => {
      throw new Error("not expected");
    },
    applyHumanizeToContext: async () => true,
    closeContext: async () => {},
  });

  installMock("../db/profile-service.cjs", {
    touchLastOpened: () => {},
    setProfileStatus: (id, status, meta) => {
      state.statusChanges.push({ id, status, meta });
      return { id, status, ...(meta || {}) };
    },
    getProfile: (id) => ({ id, name: String(id) }),
    resolveProfileLaunchUrl: (url) => url || "https://example.com/",
    listActiveProfileIds: () => [],
  });

  installMock("../lib/net-port.cjs", {
    getFreePort: async () => 62001,
    fetchCdpVersion: async () => null,
    waitForCdp: async () => true,
  });

  installMock("../lib/profile-browser-orphan.cjs", {
    PROFILE_LOCK_FILES: ["SingletonLock", "lockfile"],
    focusProfileBrowserWindow: async () => ({ ok: true }),
    hasProfileBrowserProcess: async () => false,
    killOrphanProfileBrowser: async () => {},
    listProfileBrowserPids: async () => [],
    readDevToolsActivePort: () => 0,
    resolveBrowserPidByDebugPort: async () => 0,
    findLiveHeadedBrowserPidNative: (dir) => state.nativeHeadedPids.get(dir) || 0,
    reapUntrackedHeadlessBrowsersNative: () => ({ scanned: 0, killed: 0, rootTrees: 0 }),
  });

  installMock("../lib/profile-user-data-repair.cjs", {
    repairProfileUserDataDir: async () => ({ repaired: false }),
    purgeProfileUserDataDir: async () => ({ purged: true }),
    removeStaleProfileLocks: () => {},
    writeSidecarPid: (dir, payload) => {
      state.sidecars.set(dir, payload);
    },
    readSidecarPid: (dir) => state.sidecars.get(dir) || null,
    removeSidecarPid: (dir) => {
      state.removedSidecars.push(dir);
      state.sidecars.delete(dir);
    },
    waitForProfileUnlock: async () => true,
  });

  installMock("../lib/profile-window-title.cjs", {
    applyProfileWindowTitle: async () => {},
    formatProfileWindowLabel: (p) => String(p?.name || p?.id || "0000"),
    scheduleProfileTaskbarBadgeApply: () => {},
    scheduleMissingBadgeSweep: () => {},
  });

  installMock("../lib/profile-taskbar-native.cjs", {
    ensureBadgeIcoFast: async () => {},
    startBrowserPidSidecarPoll: () => ({ cancel: () => {} }),
  });

  installMock("../lib/agent-smoke-mode.cjs", {
    isAgentSmokeLaunch: () => false,
  });

  installMock("../lib/omnibox-search-guard.cjs", {
    bindOmniboxSearchGuard: () => {},
  });

  const { SessionManager, isSidecarPidDefinitelyDead } = require("./session-manager.cjs");
  return { SessionManager, isSidecarPidDefinitelyDead, state, clearCaches };
}

describe("SessionManager dead stealth-pid.json auto-pruning", () => {
  it("isSidecarPidDefinitelyDead distinguishes live, dead-with-native-child, and dead-orphan PIDs", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-sidecar-dead-"));
    try {
      const { isSidecarPidDefinitelyDead } = loadWithMocks(tmp);
      const dir = path.join(tmp, "profiles", "p1");
      assert.equal(isSidecarPidDefinitelyDead(dir), false);

      assert.equal(
        isSidecarPidDefinitelyDead(dir, {
          readSidecarPidFn: () => ({ pid: 1234, headless: false }),
          isPidAliveFn: () => true,
          findLiveHeadedFn: () => 0,
        }),
        false,
      );

      assert.equal(
        isSidecarPidDefinitelyDead(dir, {
          readSidecarPidFn: () => ({ pid: 1234, headless: false }),
          isPidAliveFn: () => false,
          findLiveHeadedFn: () => 5678,
        }),
        false,
      );

      assert.equal(
        isSidecarPidDefinitelyDead(dir, {
          readSidecarPidFn: () => ({ pid: 1234, headless: false }),
          isPidAliveFn: () => false,
          findLiveHeadedFn: () => 0,
        }),
        true,
      );
    } finally {
      clearCaches();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("SessionManager prunes dead-PID headed session cleanly across listRunning and isRunning once past launch grace", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-prune-sm-"));
    const realDateNow = Date.now;
    let clockOffset = 0;
    Date.now = () => realDateNow() + clockOffset;
    const prevSmoke = process.env.STEALTH_AGENT_SMOKE;
    process.env.STEALTH_AGENT_SMOKE = "0";
    let sm = null;
    try {
      const { SessionManager, state } = loadWithMocks(tmp);
      sm = new SessionManager();
      sm.setUserDataRoot(tmp);

      // Launch headed pure/fast-spawn session whose PID in stealth-pid.json is nonexistent on OS
      const deadPid = 99999999;
      state.alivePids.add(deadPid);
      const res = await sm.launch({
        id: "0928-dead",
        name: "0928",
        proxy: "",
        humanize: false,
        headless: false,
      });
      assert.equal(res.ok, true);
      const dir = res.userDataDir;
      state.sidecars.set(dir, { pid: deadPid, debugPort: 53470, headless: false });

      // Inside launch grace: keep alive
      assert.equal(sm.listRunning().length, 1);
      assert.equal(sm.isRunning("0928-dead"), true);

      // Advance clock 60s past LAUNCH_GRACE_MS (45s) with dead PID (`ESRCH`)
      clockOffset = 60_000;
      const afterPrune = sm.listRunning();
      assert.equal(afterPrune.length, 0);
      assert.equal(sm.isRunning("0928-dead"), false);
      assert.equal(sm.isUserInteractiveSession("0928-dead"), false);
      assert.equal(state.removedSidecars.includes(dir), true);
      assert.ok(
        state.statusChanges.some((c) => c.id === "0928-dead" && c.status === "closed"),
        "expected closed status transition emitted",
      );
    } finally {
      Date.now = realDateNow;
      if (sm) await sm.closeAll().catch(() => {});
      if (prevSmoke === undefined) delete process.env.STEALTH_AGENT_SMOKE;
      else process.env.STEALTH_AGENT_SMOKE = prevSmoke;
      clearCaches();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
