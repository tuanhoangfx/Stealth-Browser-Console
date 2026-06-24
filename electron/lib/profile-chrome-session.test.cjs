"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { markProfileChromeCleanExit } = require("./profile-chrome-session.cjs");

describe("resolveProfileForLaunch", () => {
  it("resolves by name when id token is stale", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-profile-"));
    await openDatabase(root);
    const created = profileService.createProfile({ name: "0009" });
    const resolved = profileService.resolveProfileForLaunch({ id: "stale-uuid", name: "0009" });
    assert.equal(resolved?.id, created.id);
    closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("profile-chrome-session", () => {
  it("marks chrome prefs as clean exit", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-session-"));
    const userDataDir = path.join(root, "profiles", "p1", "Default");
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDataDir, "Preferences"),
      JSON.stringify({ profile: { exit_type: "Crashed" } }),
      "utf8",
    );
    const result = markProfileChromeCleanExit(path.join(root, "profiles", "p1"));
    assert.equal(result.ok, true);
    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Preferences"), "utf8"));
    assert.equal(prefs.profile.exit_type, "Normal");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
