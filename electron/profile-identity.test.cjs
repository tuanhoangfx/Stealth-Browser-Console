const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { extractProfileCode, buildTaskbarLabel, buildCodeTileTooltip, buildPillChipText, buildWindowTitle } = require("./lib/profile-identity.cjs");

describe("profile-identity", () => {
  it("extracts trailing digits from profile name", () => {
    assert.equal(extractProfileCode("Profile 0006", "x"), "0006");
  });

  it("builds taskbar label", () => {
    assert.equal(buildTaskbarLabel({ id: "x", name: "Profile 0006" }), "[0006] Profile 0006");
  });

  it("builds window title with page title", () => {
    assert.equal(
      buildWindowTitle({ id: "x", name: "Profile 0004" }, "Google"),
      "[0004] Profile 0004 — Google",
    );
  });

  it("builds V2 code tile tooltip", () => {
    const profile = { id: "x", name: "Profile 0012", groupName: "Sales" };
    assert.equal(buildPillChipText(profile), "[0012]·Sales");
    assert.equal(buildCodeTileTooltip(profile), "[0012] · Sales");
  });
});
