const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { pickCloseTargets, MAX_RUNNING_STEALTH_PROFILES, resolveMaxRunningProfiles } = require("./running-profile-cap.cjs");

describe("running-profile-cap", () => {
  it("does nothing when at or under cap", () => {
    const running = [
      { id: "a", name: "0059" },
      { id: "b", name: "9990" },
    ];
    assert.deepEqual(pickCloseTargets(running, { max: 8 }), []);
  });

  it("closes browse profiles first and keeps reserved", () => {
    const running = [
      { id: "p59", name: "0059" },
      { id: "p90", name: "9990" },
      { id: "b1", name: "0015" },
      { id: "b2", name: "1103" },
      { id: "b3", name: "0006" },
    ];
    const closed = pickCloseTargets(running, { max: 2 });
    assert.deepEqual(
      closed.map((r) => r.name).sort(),
      ["0006", "0015", "1103"],
    );
  });

  it("never closes keepName even when over cap", () => {
    const running = Array.from({ length: 10 }, (_, i) => ({
      id: `id${i}`,
      name: String(1000 + i).padStart(4, "0"),
    }));
    const closed = pickCloseTargets(running, { max: 2, keepName: "1005" });
    assert.equal(closed.some((r) => r.name === "1005"), false);
    assert.ok(closed.length >= 8);
  });

  it("legacy GPU-safe hint stays 8; live default is unlimited unless env set", () => {
    assert.equal(MAX_RUNNING_STEALTH_PROFILES, 8);
    assert.equal(resolveMaxRunningProfiles({}), 0);
    assert.equal(resolveMaxRunningProfiles({ STEALTH_MAX_RUNNING_PROFILES: "" }), 0);
    assert.equal(resolveMaxRunningProfiles({ STEALTH_MAX_RUNNING_PROFILES: "off" }), 0);
    assert.equal(resolveMaxRunningProfiles({ STEALTH_MAX_RUNNING_PROFILES: "16" }), 16);
    const running = Array.from({ length: 12 }, (_, i) => ({
      id: `id${i}`,
      name: String(10 + i).padStart(4, "0"),
    }));
    assert.equal(pickCloseTargets(running).length, 4);
  });
});
