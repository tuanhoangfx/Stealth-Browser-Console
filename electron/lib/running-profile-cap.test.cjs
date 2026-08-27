const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  pickCloseTargets,
  MAX_RUNNING_STEALTH_PROFILES,
  resolveMaxRunningProfiles,
} = require("./running-profile-cap.cjs");

describe("running-profile-cap", () => {
  it("never evicts — even 100 running and env set", () => {
    const running = Array.from({ length: 100 }, (_, i) => ({
      id: `id${i}`,
      name: String(i).padStart(4, "0"),
    }));
    assert.deepEqual(pickCloseTargets(running, { max: 2 }), []);
    assert.deepEqual(pickCloseTargets(running, { max: 8, keepName: "0001" }), []);
    assert.deepEqual(pickCloseTargets(running), []);
    assert.equal(resolveMaxRunningProfiles({}), 0);
    assert.equal(resolveMaxRunningProfiles({ STEALTH_MAX_RUNNING_PROFILES: "8" }), 0);
    assert.equal(resolveMaxRunningProfiles({ STEALTH_MAX_RUNNING_PROFILES: "16" }), 0);
    assert.equal(MAX_RUNNING_STEALTH_PROFILES, 8);
  });
});
