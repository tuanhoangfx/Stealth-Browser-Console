const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  resolveAppIconPath,
  resolveAppIconPathIfExists,
  assertAppIconReady,
} = require("./desktop-app-icon.cjs");
const { buildProfileMarkerArgs } = require("../engine/cloak-browser-engine.cjs");

const rootDir = path.resolve(__dirname, "..", "..");

describe("desktop-app-icon", () => {
  it("resolves build/icons/app.ico under tool root", () => {
    assert.equal(
      resolveAppIconPath(rootDir),
      path.join(rootDir, "build", "icons", "app.ico"),
    );
  });

  it("committed app.ico exists and is non-trivial size", () => {
    const iconPath = assertAppIconReady(rootDir);
    assert.equal(resolveAppIconPathIfExists(rootDir), iconPath);
  });
});

describe("desktop icon layers", () => {
  it("profile CloakBrowser markers are separate from Electron shell app.ico", () => {
    const profile = { id: "profile-0003" };
    const markers = buildProfileMarkerArgs(profile, rootDir);
    assert.ok(markers.some((arg) => arg.startsWith("--stealth-profile-id=")));
    assert.equal(
      markers.some((arg) => String(arg).includes("app.ico")),
      false,
      "profile launch args must not reference Electron shell icon",
    );
    assertAppIconReady(rootDir);
  });
});
