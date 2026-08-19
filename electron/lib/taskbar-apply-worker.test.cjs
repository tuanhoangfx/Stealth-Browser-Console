"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { enqueueExclusive } = require("./taskbar-apply-worker.cjs");

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
