"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { enqueueExclusive, enqueuePooled, WORKER_POOL_SIZE } = require("./taskbar-apply-worker.cjs");

describe("enqueueExclusive", () => {
  it("runs overlapping jobs one after another", async () => {
    const order = [];
    const slow = enqueueExclusive(async () => {
      order.push("slow-start");
      await new Promise((r) => setTimeout(r, 40));
      order.push("slow-end");
      return "slow";
    });
    const fast = enqueueExclusive(async () => {
      order.push("fast");
      return "fast";
    });
    assert.deepEqual(await Promise.all([slow, fast]), ["slow", "fast"]);
    assert.deepEqual(order, ["slow-start", "slow-end", "fast"]);
  });

  it("does not drop a later job when the earlier one rejects", async () => {
    const first = enqueueExclusive(async () => {
      throw new Error("boom");
    });
    const second = enqueueExclusive(async () => "ok");
    await assert.rejects(first, /boom/);
    assert.equal(await second, "ok");
  });
});

describe("enqueuePooled", () => {
  it("exposes a pool larger than one worker", () => {
    assert.equal(WORKER_POOL_SIZE, 6);
  });

  it("runs up to pool-size jobs overlapping", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const jobs = Array.from({ length: WORKER_POOL_SIZE }, () =>
      enqueuePooled(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent -= 1;
        return "ok";
      }),
    );
    assert.deepEqual(await Promise.all(jobs), Array(WORKER_POOL_SIZE).fill("ok"));
    assert.equal(maxConcurrent, WORKER_POOL_SIZE);
  });
});
