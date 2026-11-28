"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

test("ensureAgentWorkerDaemonRunning prefers non-blocking startHiddenDetachedProcessAsync when available", async () => {
  const prevSplit = process.env.STEALTH_ENABLE_SPLIT_WORKER_6004;
  process.env.STEALTH_ENABLE_SPLIT_WORKER_6004 = "1";

  const winShellPath = path.resolve(__dirname, "..", "..", "..", "scripts", "lib", "win-shell-env.cjs");
  const proxyPath = require.resolve("./agent-worker-proxy.cjs");
  const origWinShell = require(winShellPath);

  let asyncCalled = 0;
  let syncCalled = 0;
  const mockWinShell = {
    ...origWinShell,
    startHiddenDetachedProcessAsync: async () => {
      asyncCalled += 1;
      return 43210;
    },
    startHiddenDetachedProcess: () => {
      syncCalled += 1;
      return 43210;
    },
  };

  delete require.cache[proxyPath];
  require.cache[winShellPath] = {
    id: winShellPath,
    filename: winShellPath,
    loaded: true,
    exports: mockWinShell,
  };

  try {
    const { ensureAgentWorkerDaemonRunning } = require(proxyPath);
    const ok = await ensureAgentWorkerDaemonRunning(59999, { maxWaitAttempts: 1 });
    assert.equal(ok, false);
    assert.equal(asyncCalled, 1);
    assert.equal(syncCalled, 0);

    // Verify concurrent ensureAgentWorkerDaemonRunning calls coalesce onto singleflight
    const [okA, okB, okC] = await Promise.all([
      ensureAgentWorkerDaemonRunning(59999, { maxWaitAttempts: 0 }),
      ensureAgentWorkerDaemonRunning(59999, { maxWaitAttempts: 0 }),
      ensureAgentWorkerDaemonRunning(59999, { maxWaitAttempts: 0 }),
    ]);
    assert.equal(okA, false);
    assert.equal(okB, false);
    assert.equal(okC, false);
    assert.equal(asyncCalled, 1);
  } finally {
    delete require.cache[proxyPath];
    delete require.cache[winShellPath];
    if (prevSplit === undefined) delete process.env.STEALTH_ENABLE_SPLIT_WORKER_6004;
    else process.env.STEALTH_ENABLE_SPLIT_WORKER_6004 = prevSplit;
  }
});

test("shouldOffloadAgentRequestToWorker keeps read-only GET /api/profiles on :6003 and offloads launch/cdp", () => {
  const prevSplit = process.env.STEALTH_ENABLE_SPLIT_WORKER_6004;
  const prevWorker = process.env.STEALTH_AGENT_WORKER;
  process.env.STEALTH_ENABLE_SPLIT_WORKER_6004 = "1";
  delete process.env.STEALTH_AGENT_WORKER;
  try {
    const { shouldOffloadAgentRequestToWorker } = require("./agent-worker-proxy.cjs");
    assert.equal(
      shouldOffloadAgentRequestToWorker({
        apiPort: 6003,
        agentSmoke: true,
        method: "GET",
        urlPath: "/api/profiles",
        params: [],
        body: null,
        sessionManager: null,
      }),
      false,
    );
    assert.equal(
      shouldOffloadAgentRequestToWorker({
        apiPort: 6003,
        agentSmoke: true,
        method: "GET",
        urlPath: "/api/profiles/abc/cdp",
        params: ["/api/profiles/abc/cdp", "abc", "cdp"],
        body: null,
        sessionManager: null,
      }),
      true,
    );
    assert.equal(
      shouldOffloadAgentRequestToWorker({
        apiPort: 6003,
        agentSmoke: true,
        method: "POST",
        urlPath: "/api/profiles/open",
        params: [],
        body: { id: "abc" },
        sessionManager: null,
      }),
      true,
    );
  } finally {
    if (prevSplit === undefined) delete process.env.STEALTH_ENABLE_SPLIT_WORKER_6004;
    else process.env.STEALTH_ENABLE_SPLIT_WORKER_6004 = prevSplit;
    if (prevWorker === undefined) delete process.env.STEALTH_AGENT_WORKER;
    else process.env.STEALTH_AGENT_WORKER = prevWorker;
  }
});
