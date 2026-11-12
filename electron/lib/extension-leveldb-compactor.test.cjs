"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseLevelDbWalBuffer,
  encodeLevelDbWalFromOps,
  compactSingleExtensionLevelDbDir,
  compactClosedProfileExtensionLevelDb,
  compactClosedProfileExtensionLevelDbAsync,
} = require("./extension-leveldb-compactor.cjs");
const { trimClosedProfileDisposableCacheAsync } = require("./profile-chrome-cleanup.cjs");

test("encodeLevelDbWalFromOps + parseLevelDbWalBuffer roundtrips multi-block fragmented batches with zero CRC errors", () => {
  const bigValue = Buffer.from(JSON.stringify({ bindings: Array.from({ length: 4000 }, (_, i) => `slot-${i}`) }), "utf8");
  assert.ok(bigValue.length > 35_000, "payload spans >1 32KB LevelDB block");

  const batches = [];
  let seq = 100n;
  // Simulate 3,000 overwritten heartbeat ticks + persistent auth/identity keys
  for (let i = 0; i < 3000; i += 1) {
    batches.push(
      encodeLevelDbWalFromOps(
        [
          {
            type: 1,
            key: Buffer.from("e0001-ui-tick-v1", "utf8"),
            value: Buffer.from(JSON.stringify({ tick: i, ts: 1794000000000 + i }), "utf8"),
          },
        ],
        { startSeq: seq },
      ),
    );
    seq += 1n;
  }
  batches.push(
    encodeLevelDbWalFromOps(
      [
        {
          type: 1,
          key: Buffer.from("e0001-hub-identity-v1", "utf8"),
          value: Buffer.from('{"email":"admin@infi28.com"}', "utf8"),
        },
        {
          type: 1,
          key: Buffer.from("e0001-sync-bindings-v1", "utf8"),
          value: bigValue,
        },
        {
          type: 0,
          key: Buffer.from("obsolete-key", "utf8"),
          value: null,
        },
      ],
      { startSeq: seq },
    ),
  );
  seq += 3n;

  // Concatenate multi-record stream inside a temporary extension LevelDB folder
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-ldb-compact-"));
  try {
    const extDir = path.join(root, "Default", "Local Extension Settings", "ehlfggnaljhaehaaflmcojimgbolilcb");
    fs.mkdirSync(extDir, { recursive: true });
    // Properly pack records into 32KB blocks by encoding sequential ops or writing a valid multi-batch WAL
    const multiOps = [];
    for (let i = 0; i < 4000; i += 1) {
      multiOps.push({
        type: 1,
        key: Buffer.from("e0001-ui-tick-v1", "utf8"),
        value: Buffer.from("x".repeat(400) + `:${i}`, "utf8"),
      });
    }
    multiOps.push(
      {
        type: 1,
        key: Buffer.from("e0001-hub-identity-v1", "utf8"),
        value: Buffer.from('{"email":"admin@infi28.com"}', "utf8"),
      },
      {
        type: 1,
        key: Buffer.from("e0001-sync-bindings-v1", "utf8"),
        value: bigValue,
      },
      {
        type: 0,
        key: Buffer.from("deleted-sst-key", "utf8"),
        value: null,
      },
    );
    // Notice encodeLevelDbWalFromOps encodes a single WriteBatch; let's also verify SST tombstone preservation
    const bloatedWal = encodeLevelDbWalFromOps(multiOps, { startSeq: 500n });
    assert.ok(bloatedWal.length > 1_600_000, `Expected >1.6MB WAL, got ${bloatedWal.length}`);
    fs.writeFileSync(path.join(extDir, "000007.log"), bloatedWal);
    fs.writeFileSync(path.join(extDir, "000009.ldb"), Buffer.from("sst-placeholder"));

    const res = compactSingleExtensionLevelDbDir(extDir, { thresholdBytes: 1_000_000 });
    assert.equal(res.compacted, true);
    assert.ok(res.afterBytes < 60_000, `Expected <60KB after compaction, got ${res.afterBytes}`);
    assert.equal(res.liveKeyCount, 4, "Keeps 3 live keys + 1 Delete tombstone when .ldb exists");

    const afterRaw = fs.readFileSync(path.join(extDir, "000007.log"));
    const afterParsed = parseLevelDbWalBuffer(afterRaw, { strictCrc: true });
    assert.equal(afterParsed.ok, true);
    assert.equal(afterParsed.crcFailures, 0);
    assert.equal(
      afterParsed.opsByKeyHex.get(Buffer.from("e0001-hub-identity-v1").toString("hex")).value.toString("utf8"),
      '{"email":"admin@infi28.com"}',
    );
    assert.equal(
      afterParsed.opsByKeyHex.get(Buffer.from("e0001-sync-bindings-v1").toString("hex")).value.length,
      bigValue.length,
    );
    assert.equal(
      afterParsed.opsByKeyHex.get(Buffer.from("deleted-sst-key").toString("hex")).type,
      0,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("compactClosedProfileExtensionLevelDb skips 8xxx customer profiles and live profiles", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-ldb-guard-"));
  try {
    const extDir = path.join(root, "Default", "Local Extension Settings", "ehlfggnaljhaehaaflmcojimgbolilcb");
    fs.mkdirSync(extDir, { recursive: true });
    const ops = Array.from({ length: 3000 }, (_, i) => ({
      type: 1,
      key: Buffer.from("tick"),
      value: Buffer.from("v".repeat(500) + i),
    }));
    fs.writeFileSync(path.join(extDir, "000003.log"), encodeLevelDbWalFromOps(ops, { startSeq: 1n }));

    // 1. Protected 8xxx skip
    const skip8xxx = compactClosedProfileExtensionLevelDb(root, {
      profileCode: "8003",
      thresholdBytes: 1_000_000,
    });
    assert.equal(skip8xxx.skipped, true);
    assert.equal(skip8xxx.reason, "protected-8xxx");

    // 2. Live SingletonLock skip
    fs.writeFileSync(path.join(root, "SingletonLock"), "lock");
    const skipLive = compactClosedProfileExtensionLevelDb(root, {
      profileCode: "0004",
      thresholdBytes: 1_000_000,
    });
    assert.equal(skipLive.skipped, true);
    assert.equal(skipLive.reason, "profile-live");
    fs.rmSync(path.join(root, "SingletonLock"), { force: true });

    // 3. Async post-close trim compacts when closed and non-8xxx
    const asyncRes = await trimClosedProfileDisposableCacheAsync(root, {
      profileCode: "0004",
      thresholdBytes: 1_000_000,
      force: true,
    });
    assert.equal(asyncRes.ok, true);
    assert.equal(asyncRes.levelDbCompactedDirs, 1);
    assert.ok(asyncRes.levelDbSavedBytes > 1_400_000);

    // 4. Direct async call coalesces / returns below-threshold cleanly afterwards
    const second = await compactClosedProfileExtensionLevelDbAsync(root, {
      profileCode: "0004",
      thresholdBytes: 1_000_000,
    });
    assert.equal(second.compactedDirs, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
