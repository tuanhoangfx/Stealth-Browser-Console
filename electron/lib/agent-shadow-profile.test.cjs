"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  resolveAgentShadowUserDataDir,
  isAgentShadowUserDataDir,
  hasLiveAgentShadowOnDisk,
  seedAgentShadowFromPrimary,
  syncAgentShadowBackToPrimary,
  sweepOrphanAgentShadows,
} = require("./agent-shadow-profile.cjs");

describe("agent-shadow-profile (Dual-Lane User Headed + Agent Headless Isolation)", () => {
  it("seeds isolated shadow directory from primary without locking primary and syncs back on close", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-dual-lane-test-"));
    const primaryDir = path.join(tmpRoot, "primary-0055");
    const profileId = `test-0055-${Date.now()}`;

    try {
      fs.mkdirSync(path.join(primaryDir, "Default", "Network"), { recursive: true });
      fs.mkdirSync(path.join(primaryDir, "Default", "Local Storage", "leveldb"), { recursive: true });
      fs.writeFileSync(path.join(primaryDir, "Local State"), JSON.stringify({ os_crypt: { encrypted_key: "test" } }));
      // Create a 16KB synthetic Cookies file
      const initialCookies = Buffer.alloc(16384, "A");
      fs.writeFileSync(path.join(primaryDir, "Default", "Network", "Cookies"), initialCookies);
      fs.writeFileSync(path.join(primaryDir, "Default", "Local Storage", "leveldb", "000005.ldb"), "spa_token=123");
      // Simulate User Headed Chrome holding SingletonLock on primaryDir
      fs.writeFileSync(path.join(primaryDir, "SingletonLock"), "locked-by-user");

      const shadowDir = seedAgentShadowFromPrimary(primaryDir, profileId);
      assert.equal(isAgentShadowUserDataDir(shadowDir), true);
      assert.equal(shadowDir, resolveAgentShadowUserDataDir(profileId));
      assert.equal(hasLiveAgentShadowOnDisk(profileId), true);
      // Shadow dir must NOT copy SingletonLock from primaryDir
      assert.equal(fs.existsSync(path.join(shadowDir, "SingletonLock")), false);
      assert.equal(fs.existsSync(path.join(shadowDir, "Local State")), true);
      assert.equal(fs.statSync(path.join(shadowDir, "Default", "Network", "Cookies")).size, 16384);
      assert.equal(
        fs.readFileSync(path.join(shadowDir, "Default", "Local Storage", "leveldb", "000005.ldb"), "utf8"),
        "spa_token=123",
      );

      // Simulate Agent Headless updating Cookies in shadowDir
      const updatedCookies = Buffer.alloc(20480, "B");
      fs.writeFileSync(path.join(shadowDir, "Default", "Network", "Cookies"), updatedCookies);

      // While User Headed is still open (primaryLocked: true), disk overwrite is skipped, only live context addCookies is used
      const lockedSync = syncAgentShadowBackToPrimary(shadowDir, primaryDir, {
        primaryLocked: true,
        cleanupShadow: false,
      });
      assert.equal(lockedSync.syncedDisk, false);
      assert.equal(fs.statSync(path.join(primaryDir, "Default", "Network", "Cookies")).size, 16384);

      // When User Headed is closed (primaryLocked: false) and primary Cookies is already intact (>= 12KB),
      // shadow syncs Local Storage / IndexedDB back to primary without overwriting intact primary Cookies
      fs.writeFileSync(path.join(shadowDir, "Default", "Local Storage", "leveldb", "000006.ldb"), "spa_token=456");
      const unlockedSync = syncAgentShadowBackToPrimary(shadowDir, primaryDir, {
        primaryLocked: false,
        cleanupShadow: false,
      });
      assert.equal(unlockedSync.syncedDisk, true);
      assert.equal(fs.statSync(path.join(primaryDir, "Default", "Network", "Cookies")).size, 16384);
      assert.equal(
        fs.readFileSync(path.join(primaryDir, "Default", "Local Storage", "leveldb", "000006.ldb"), "utf8"),
        "spa_token=456",
      );

      // Only if primary Cookies was wiped (< 12KB) does shadow recover it on close
      fs.writeFileSync(path.join(primaryDir, "Default", "Network", "Cookies"), Buffer.alloc(0));
      const emergencySync = syncAgentShadowBackToPrimary(shadowDir, primaryDir, {
        primaryLocked: false,
        cleanupShadow: true,
      });
      assert.equal(emergencySync.syncedDisk, true);
      assert.equal(fs.statSync(path.join(primaryDir, "Default", "Network", "Cookies")).size, 20480);
      assert.equal(
        fs.readFileSync(path.join(primaryDir, "Default", "Local Storage", "leveldb", "000006.ldb"), "utf8"),
        "spa_token=456",
      );
      assert.equal(fs.existsSync(shadowDir), false);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("sweeps orphan shadow directories older than maxIdleMs without overwriting intact primary Cookies", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-shadow-sweep-test-"));
    const customShadowPool = path.join(tmpRoot, "shadow-pool");
    const primaryDir = path.join(tmpRoot, "primary-0099");
    const prevEnv = process.env.STEALTH_AGENT_SHADOW_ROOT;
    process.env.STEALTH_AGENT_SHADOW_ROOT = customShadowPool;

    try {
      fs.mkdirSync(path.join(primaryDir, "Default", "Network"), { recursive: true });
      fs.writeFileSync(path.join(primaryDir, "Default", "Network", "Cookies"), Buffer.alloc(16384, "X"));

      const orphanId = "orphan-0099";
      const activeId = "active-0100";
      const orphanDir = seedAgentShadowFromPrimary(primaryDir, orphanId);
      const activeDir = seedAgentShadowFromPrimary(primaryDir, activeId);

      // Simulate shadow cookies in orphanDir before it became orphaned (> 3 hours ago)
      fs.writeFileSync(path.join(orphanDir, "Default", "Network", "Cookies"), Buffer.alloc(24576, "Y"));

      const futureNow = Date.now() + 3 * 60 * 60 * 1000;
      const res = sweepOrphanAgentShadows({
        maxIdleMs: 2 * 60 * 60 * 1000,
        activeProfileIds: new Set([activeId]),
        now: futureNow,
      });

      assert.ok(res.swept >= 1);
      assert.equal(fs.existsSync(orphanDir), false);
      assert.equal(fs.existsSync(activeDir), true);
      // Primary intact 16KB Cookies must NEVER be overwritten by stale orphan shadow
      assert.equal(fs.statSync(path.join(primaryDir, "Default", "Network", "Cookies")).size, 16384);
    } finally {
      if (prevEnv === undefined) delete process.env.STEALTH_AGENT_SHADOW_ROOT;
      else process.env.STEALTH_AGENT_SHADOW_ROOT = prevEnv;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
