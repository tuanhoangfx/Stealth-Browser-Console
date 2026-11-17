const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

function clearSessionManagerCaches() {
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
    "playwright-core",
  ];
  for (const rel of targets) {
    try {
      const id = require.resolve(rel);
      delete require.cache[id];
    } catch {
      /* ignore */
    }
  }
}

function makeFakeContext(id = "ctx-1") {
  const emitter = new EventEmitter();
  const fakePage = new EventEmitter();
  fakePage.isClosed = () => false;
  fakePage.url = () => "about:blank";
  fakePage.bringToFront = async () => {};
  emitter.pages = () => [fakePage];
  emitter.browser = () => null;
  emitter.close = async () => {
    emitter.emit("close");
  };
  emitter.__id = id;
  return emitter;
}

function loadSessionManagerWithMocks(rootDir) {
  clearSessionManagerCaches();

  const state = {
    fastSpawnCalls: [],
    openProfileCalls: [],
    cdpConnectCalls: [],
    humanizeCalls: [],
    omniboxGuardCalls: [],
    closeContextCalls: [],
    killCalls: [],
    aliveProcesses: new Set(),
    sidecarWrites: [],
  };

  let nextPort = 61001;
  const fakeCtx = makeFakeContext("lazy-cdp-ctx");

  const installMock = (rel, exportsObj) => {
    const abs = require.resolve(rel);
    require.cache[abs] = {
      id: abs,
      filename: abs,
      loaded: true,
      exports: exportsObj,
    };
  };

  installMock("./cloak-browser-engine.cjs", {
    profileDataDir: (root, id) => path.join(root, "profiles", String(id)),
    openPureHeadedProfile: async (profile, root, opts = {}) => {
      const dir = path.join(root, "profiles", String(profile.id));
      fs.mkdirSync(dir, { recursive: true });
      const debugPort = Number(opts.debugPort) || 0;
      const pid = 40000 + state.fastSpawnCalls.length + 1;
      state.aliveProcesses.add(dir);
      state.fastSpawnCalls.push({ profileId: profile.id, debugPort, launchUrl: opts.launchUrl || "" });
      return { pid, userDataDir: dir, debugPort, pureHeaded: debugPort === 0 };
    },
    openProfile: async (profile, root, opts = {}) => {
      const dir = path.join(root, "profiles", String(profile.id));
      fs.mkdirSync(dir, { recursive: true });
      const ctx = makeFakeContext(`openProfile-${profile.id}`);
      state.openProfileCalls.push({ profileId: profile.id, debugPort: opts.debugPort || 0 });
      return { context: ctx, userDataDir: dir, debugPort: opts.debugPort || 0 };
    },
    applyHumanizeToContext: async (ctx, opts) => {
      state.humanizeCalls.push({ ctxId: ctx.__id, humanize: opts?.humanize });
      return true;
    },
    closeContext: async (ctx) => {
      state.closeContextCalls.push({ ctxId: ctx?.__id });
      const idx = state.fastSpawnCalls.length;
      if (idx > 0) {
        // Simulate Chrome closing cleanly during Browser.close flush
        state.aliveProcesses.clear();
      }
      if (ctx?.close) await ctx.close();
    },
  });

  installMock("../db/profile-service.cjs", {
    touchLastOpened: () => {},
    setProfileStatus: (id, status, meta) => ({ id, status, ...(meta || {}) }),
    getProfile: (id) => ({ id, name: String(id) }),
    resolveProfileLaunchUrl: (url) => url || "https://example.com/",
    listActiveProfileIds: () => [],
  });

  installMock("../lib/net-port.cjs", {
    getFreePort: async () => nextPort++,
    fetchCdpVersion: async () => null,
    waitForCdp: async () => true,
  });

  installMock("../lib/profile-browser-orphan.cjs", {
    PROFILE_LOCK_FILES: ["SingletonLock", "lockfile"],
    focusProfileBrowserWindow: async () => ({ ok: true }),
    hasProfileBrowserProcess: async (dir) => state.aliveProcesses.has(dir),
    killOrphanProfileBrowser: async (dir) => {
      state.killCalls.push(dir);
      state.aliveProcesses.delete(dir);
    },
    listProfileBrowserPids: async () => [],
    readDevToolsActivePort: () => 0,
    resolveBrowserPidByDebugPort: async () => 0,
    findLiveHeadedBrowserPidNative: () => 0,
    reapUntrackedHeadlessBrowsersNative: () => ({ scanned: 0, killed: 0, rootTrees: 0 }),
  });

  installMock("../lib/profile-user-data-repair.cjs", {
    repairProfileUserDataDir: async () => ({ repaired: false }),
    purgeProfileUserDataDir: async () => ({ purged: true }),
    removeStaleProfileLocks: () => {},
    writeSidecarPid: (dir, payload) => {
      state.sidecarWrites.push({ dir, ...payload });
    },
    readSidecarPid: () => null,
    removeSidecarPid: () => {},
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
    startBrowserPidSidecarPoll: () => {},
  });

  installMock("../lib/agent-smoke-mode.cjs", {
    isAgentSmokeLaunch: () => false,
  });

  installMock("../lib/omnibox-search-guard.cjs", {
    bindOmniboxSearchGuard: (ctx) => {
      state.omniboxGuardCalls.push(ctx.__id);
    },
  });

  installMock("playwright-core", {
    chromium: {
      connectOverCDP: async (endpoint) => {
        state.cdpConnectCalls.push(endpoint);
        return {
          contexts: () => [fakeCtx],
          close: async () => {},
        };
      },
    },
  });

  const { SessionManager } = require("./session-manager.cjs");
  const sm = new SessionManager({ userDataRoot: rootDir });
  return { sm, state, fakeCtx };
}

describe("SessionManager Fast-Spawn + Lazy CDP + Graceful Close", () => {
  it("routes Standard non-auth-proxy launch to Fast-Spawn with debugPort > 0 and upgrades lazily via ensureConnectedContext", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-fastcdp-"));
    const prevSmoke = process.env.STEALTH_AGENT_SMOKE;
    process.env.STEALTH_AGENT_SMOKE = "0";
    try {
      const { sm, state, fakeCtx } = loadSessionManagerWithMocks(rootDir);
      const res = await sm.launch({
        id: "p-std",
        name: "9997",
        proxy: "",
        humanize: true,
        headless: false,
      });

      assert.equal(res.ok, true);
      assert.equal(res.pureHeaded, false);
      assert.equal(res.fastSpawnCdp, true);
      assert.ok(res.debugPort > 0, "must allocate and return debugPort for CDP");
      assert.equal(state.fastSpawnCalls.length, 1);
      assert.equal(state.openProfileCalls.length, 0);
      assert.equal(state.sidecarWrites[0].debugPort, res.debugPort);
      assert.equal(sm.getContext("p-std"), null, "context remains lazy until needed");

      // Lazy upgrade via ensureConnectedContext connects over CDP and applies humanize + omnibox guard
      const ctx = await sm.ensureConnectedContext("p-std");
      assert.equal(ctx, fakeCtx);
      assert.deepEqual(state.cdpConnectCalls, [`http://127.0.0.1:${res.debugPort}`]);
      assert.equal(state.omniboxGuardCalls.includes("lazy-cdp-ctx"), true);
      assert.equal(state.humanizeCalls[0].humanize, true);

      await sm.close("p-std");
    } finally {
      if (prevSmoke === undefined) delete process.env.STEALTH_AGENT_SMOKE;
      else process.env.STEALTH_AGENT_SMOKE = prevSmoke;
      clearSessionManagerCaches();
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps Pure Window (pureHeaded: true) at debugPort === 0 and routes Windows auth proxy via Fast-Spawn + CDP", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-pure-auth-"));
    const prevSmoke = process.env.STEALTH_AGENT_SMOKE;
    process.env.STEALTH_AGENT_SMOKE = "0";
    try {
      const { sm, state } = loadSessionManagerWithMocks(rootDir);

      // Pure Window (explicit opt-out of CDP)
      const pureRes = await sm.launch({
        id: "p-pure",
        name: "9998",
        proxy: "",
        pureHeaded: true,
        headless: false,
      });
      assert.equal(pureRes.debugPort, 0);
      assert.equal(pureRes.pureHeaded, true);
      assert.equal(pureRes.fastSpawnCdp, false);

      // Auth proxy on Windows x64 Chromium 146.0.7680.177.5 uses native inline proxy auth + Fast-Spawn CDP
      const authRes = await sm.launch({
        id: "p-auth",
        name: "9999",
        proxy: "14.249.5.164:32350:user1:pass1",
        headless: false,
      });
      assert.equal(authRes.ok, true);
      if (process.platform === "win32") {
        assert.equal(authRes.fastSpawnCdp, true);
        assert.ok(authRes.debugPort > 0);
        assert.equal(state.openProfileCalls.length, 0);
      } else {
        assert.equal(state.openProfileCalls.length, 1);
      }

      await sm.close("p-pure");
      await sm.close("p-auth");
    } finally {
      if (prevSmoke === undefined) delete process.env.STEALTH_AGENT_SMOKE;
      else process.env.STEALTH_AGENT_SMOKE = prevSmoke;
      clearSessionManagerCaches();
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("performs graceful CDP closeContext before orphan kill when closing a focusOnly Fast-Spawn session", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-graceful-"));
    const prevSmoke = process.env.STEALTH_AGENT_SMOKE;
    process.env.STEALTH_AGENT_SMOKE = "0";
    try {
      const { sm, state } = loadSessionManagerWithMocks(rootDir);
      const res = await sm.launch({
        id: "p-close",
        name: "9996",
        proxy: "",
        headless: false,
      });
      assert.ok(res.debugPort > 0);
      assert.equal(sm.getContext("p-close"), null);

      await sm.close("p-close");
      assert.deepEqual(state.cdpConnectCalls, [`http://127.0.0.1:${res.debugPort}`]);
      assert.equal(state.closeContextCalls.length, 1, "must invoke closeContext to flush SQLite WAL cookies");
      assert.equal(state.killCalls.length, 0, "clean CDP exit skips force-kill");
    } finally {
      if (prevSmoke === undefined) delete process.env.STEALTH_AGENT_SMOKE;
      else process.env.STEALTH_AGENT_SMOKE = prevSmoke;
      clearSessionManagerCaches();
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
