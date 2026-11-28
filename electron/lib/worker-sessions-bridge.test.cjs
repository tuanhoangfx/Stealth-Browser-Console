"use strict";
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  mergeLocalAndWorkerSessions,
  refreshWorkerSessionsSnapshot,
  getCachedWorkerSessions,
  _resetWorkerSessionsBridgeCacheForTest,
} = require("./worker-sessions-bridge.cjs");

describe("worker-sessions-bridge", () => {
  beforeEach(() => {
    _resetWorkerSessionsBridgeCacheForTest();
  });

  it("merges :6004 headless sessions while preserving :6003 headed sessions", () => {
    const local = [
      { id: "p-0010", name: "0010", headless: false },
      { id: "p-0879", name: "0879", headless: false },
    ];
    const worker = [
      { id: "p-0010", name: "0010", headless: false },
      { id: "p-0055", name: "0055", headless: true, callerId: "agent:auto-onboard-platform-accounts" },
      { id: "p-0076", name: "0076", headless: false }, // sidecar duplicate on :6004 should not become headless
      { id: "p-9993", name: "9993", shadowLane: true },
    ];
    const merged = mergeLocalAndWorkerSessions(local, worker);
    assert.equal(merged.length, 4);
    assert.equal(merged.find((s) => s.id === "p-0010")?.headless, false);
    const s0055 = merged.find((s) => s.id === "p-0055");
    assert.equal(s0055?.headless, true);
    assert.equal(s0055?.remoteWorker, true);
    assert.equal(merged.find((s) => s.id === "p-0076"), undefined);
    assert.equal(merged.find((s) => s.id === "p-9993")?.headless, true);
  });

  it("caches fetched worker sessions and serves sync reads when enabled", async () => {
    const prev = process.env.STEALTH_ENABLE_WORKER_SESSIONS_BRIDGE_IN_TEST;
    process.env.STEALTH_ENABLE_WORKER_SESSIONS_BRIDGE_IN_TEST = "1";
    try {
      let calls = 0;
      const fetched = await refreshWorkerSessionsSnapshot({
        force: true,
        fetcher: async () => {
          calls += 1;
          return [{ id: "p-4837", name: "4837", headless: true, callerId: "agent:run-outlook-daemon" }];
        },
      });
      assert.equal(calls, 1);
      assert.equal(fetched.length, 1);
      assert.equal(fetched[0].remoteWorker, true);
      const cached = getCachedWorkerSessions({ triggerRefresh: false });
      assert.equal(cached.length, 1);
      assert.equal(cached[0].id, "p-4837");
    } finally {
      if (prev === undefined) delete process.env.STEALTH_ENABLE_WORKER_SESSIONS_BRIDGE_IN_TEST;
      else process.env.STEALTH_ENABLE_WORKER_SESSIONS_BRIDGE_IN_TEST = prev;
    }
  });
});
