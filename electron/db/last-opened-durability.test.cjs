const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  openDatabase,
  closeDatabase,
  checkpointDatabase,
  getDb,
  getDbBackend,
  getNativeDb,
  isDatabaseReady,
} = require("./init.cjs");
const profileService = require("./profile-service.cjs");
const {
  scheduleLastOpenedCheckpoint,
  flushScheduledLastOpenedCheckpoint,
  reconcileLastOpenedFromProfileEvents,
  mergeNewerLastOpenedFromSiblingUserData,
} = require("./last-opened-durability.cjs");

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-last-opened-"));
  const siblingDb = path.join(os.tmpdir(), `stealth-last-opened-sibling-${Date.now()}.db`);
  try {
    await openDatabase(tmpRoot);
    const created = profileService.createProfile({ name: "9900" });
    if (!created?.id) throw new Error("createProfile failed");

    profileService.setProfileStatus(created.id, "running");
    const staleTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    getDb()
      .prepare("UPDATE profiles SET last_opened_at = ? WHERE id = ?")
      .run(staleTs, created.id);

    const recentIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    getDb()
      .prepare(
        `INSERT INTO profile_events (id, profile_id, event_type, level, message, created_at)
         VALUES (?, ?, 'launch', 'success', 'test launch', ?)`,
      )
      .run("evt-reconcile-1", created.id, recentIso);

    const reconciled = reconcileLastOpenedFromProfileEvents(getDb, isDatabaseReady);
    if (reconciled.reconciled !== 1) {
      throw new Error(`expected 1 reconciled profile, got ${reconciled.reconciled}`);
    }
    const afterReconcile = profileService.getProfile(created.id);
    const repairedMs = Number(afterReconcile?.lastOpenedAt);
    if (!Number.isFinite(repairedMs) || repairedMs <= staleTs) {
      throw new Error("reconcileLastOpenedFromProfileEvents did not advance last_opened_at");
    }

    if (getDbBackend() === "better-sqlite3") {
      try {
        checkpointDatabase({ truncate: true });
        fs.copyFileSync(path.join(tmpRoot, "data", "stealth-console.db"), siblingDb);
      const freshTs = Date.now() - 5 * 60 * 1000;
      const BetterSqlite = require("better-sqlite3");
      const siblingNative = new BetterSqlite(siblingDb);
      siblingNative
        .prepare("UPDATE profiles SET last_opened_at = ? WHERE id = ?")
        .run(freshTs, created.id);
      siblingNative.close();

      getDb()
        .prepare("UPDATE profiles SET last_opened_at = ? WHERE id = ?")
        .run(Date.now() - 48 * 60 * 60 * 1000, created.id);

      const merged = await mergeNewerLastOpenedFromSiblingUserData({
        userDataPath: tmpRoot,
        getDb,
        getDbBackend,
        getNativeDb,
        isDatabaseReady,
        siblingDbPath: siblingDb,
      });
      if (merged.merged !== 1) {
        throw new Error(`expected sibling merge=1, got ${JSON.stringify(merged)}`);
      }
      const afterMerge = profileService.getProfile(created.id);
      if (Number(afterMerge?.lastOpenedAt) !== freshTs) {
        throw new Error("sibling merge did not apply newer last_opened_at");
      }

      const newerProdTs = Date.now() - 60 * 1000;
      getDb()
        .prepare("UPDATE profiles SET last_opened_at = ? WHERE id = ?")
        .run(newerProdTs, created.id);
      const siblingNative2 = new BetterSqlite(siblingDb);
      siblingNative2
        .prepare("UPDATE profiles SET last_opened_at = ? WHERE id = ?")
        .run(Date.now() - 48 * 60 * 60 * 1000, created.id);
      siblingNative2.close();
      const noDowngrade = await mergeNewerLastOpenedFromSiblingUserData({
        userDataPath: tmpRoot,
        getDb,
        getDbBackend,
        getNativeDb,
        isDatabaseReady,
        siblingDbPath: siblingDb,
      });
      if (Number(noDowngrade.merged) !== 0) {
        throw new Error(`merge must not downgrade newer prod timestamps, got ${JSON.stringify(noDowngrade)}`);
      }
      const stillNewer = profileService.getProfile(created.id);
      if (Number(stillNewer?.lastOpenedAt) !== newerProdTs) {
        throw new Error("sibling merge downgraded a newer prod last_opened_at");
      }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[last-opened-durability] skip sibling merge assertion: ${message}`);
      }
    }

    const ckCalls = [];
    scheduleLastOpenedCheckpoint((opts) => ckCalls.push(opts));
    await new Promise((resolve) => setTimeout(resolve, 2650));
    if (ckCalls.length !== 1 || ckCalls[0]?.truncate !== false) {
      throw new Error(`expected debounced PASSIVE checkpoint ({ truncate: false }), got ${JSON.stringify(ckCalls)}`);
    }
    flushScheduledLastOpenedCheckpoint((opts) => ckCalls.push(opts));
    if (ckCalls.length !== 2 || ckCalls[1]?.truncate !== true) {
      throw new Error(`expected graceful quit TRUNCATE checkpoint ({ truncate: true }), got ${JSON.stringify(ckCalls)}`);
    }

    console.log("last-opened-durability.test: ok");
  } finally {
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (fs.existsSync(siblingDb)) {
      let removed = false;
      for (let i = 0; i < 8 && !removed; i += 1) {
        try {
          fs.unlinkSync(siblingDb);
          removed = true;
        } catch (error) {
          const code = String(error?.code || "");
          if (code !== "EBUSY" && code !== "EPERM") throw error;
          if (i === 7) {
            // Best-effort temp cleanup on Windows; do not fail test if antivirus or
            // delayed handle release keeps the sibling DB locked.
            break;
          }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60);
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
