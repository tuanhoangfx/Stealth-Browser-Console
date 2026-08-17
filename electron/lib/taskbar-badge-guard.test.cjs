"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  guardableRows,
  selectGuardBatch,
  startTaskbarBadgeGuard,
} = require("./taskbar-badge-guard.cjs");

describe("selectGuardBatch", () => {
  it("walks the list round-robin across cycles", () => {
    const rows = ["a", "b", "c", "d", "e"];
    const first = selectGuardBatch(rows, 0, 2);
    assert.deepEqual(first.batch, ["a", "b"]);
    const second = selectGuardBatch(rows, first.nextCursor, 2);
    assert.deepEqual(second.batch, ["c", "d"]);
    const third = selectGuardBatch(rows, second.nextCursor, 2);
    assert.deepEqual(third.batch, ["e", "a"]);
  });

  it("never repeats a row inside one batch", () => {
    const rows = ["a", "b"];
    const { batch } = selectGuardBatch(rows, 1, 10);
    assert.deepEqual(batch, ["b", "a"]);
  });

  it("handles an empty list", () => {
    assert.deepEqual(selectGuardBatch([], 3, 4), { batch: [], nextCursor: 0 });
  });
});

describe("guardableRows", () => {
  it("drops headless, agent pool and dirless rows", () => {
    const rows = guardableRows([
      { id: "1", name: "0009", userDataDir: "C:/p/1" },
      { id: "2", name: "0010", userDataDir: "C:/p/2", headless: true },
      { id: "3", name: "9993", userDataDir: "C:/p/3" },
      { id: "4", name: "0011", userDataDir: "" },
    ]);
    assert.deepEqual(
      rows.map((r) => r.name),
      ["0009"],
    );
  });
});

describe("startTaskbarBadgeGuard", () => {
  it("re-stamps live windows as reinforce, batch by batch", () => {
    let tick = () => {};
    const calls = [];
    const stop = startTaskbarBadgeGuard({
      listRunning: () => [
        { id: "1", name: "0009", userDataDir: "C:/p/1" },
        { id: "2", name: "0010", userDataDir: "C:/p/2" },
        { id: "3", name: "9999", userDataDir: "C:/p/3" },
      ],
      schedule: (dir, label, code, opts) => calls.push({ dir, label, code, opts }),
      formatLabel: (profile) => profile.name,
      batchSize: 1,
      setIntervalFn: (fn) => {
        tick = fn;
        return { unref() {} };
      },
      clearIntervalFn: () => {},
    });

    tick();
    tick();
    assert.deepEqual(
      calls.map((c) => c.code),
      ["0009", "0010"],
    );
    assert.equal(calls[0].opts.isReinforce, true);
    assert.equal(calls[0].opts.force, true);
    stop();
  });

  it("survives a throwing listRunning", () => {
    let tick = () => {};
    const stop = startTaskbarBadgeGuard({
      listRunning: () => {
        throw new Error("db down");
      },
      schedule: () => assert.fail("should not schedule"),
      formatLabel: (p) => p.name,
      setIntervalFn: (fn) => {
        tick = fn;
        return { unref() {} };
      },
      clearIntervalFn: () => {},
    });
    assert.doesNotThrow(() => tick());
    stop();
  });
});
