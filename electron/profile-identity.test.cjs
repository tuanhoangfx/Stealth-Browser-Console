const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { extractProfileCode } = require("./lib/profile-identity.cjs");

describe("profile-identity", () => {
  it("extracts trailing digits from profile name", () => {
    assert.equal(extractProfileCode("Profile 0006", "x"), "0006");
  });
});
