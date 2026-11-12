"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const BetterSqlite = require("better-sqlite3");
const {
  getVaultCookiePairsForProfileCode,
  readProfileDiskCookiePairs,
  _getDiskCookieStats,
} = require("./disk-sqlite-cookies.cjs");

function createFakeCookiesDb(userDataDir, rows) {
  const netDir = path.join(userDataDir, "Default", "Network");
  fs.mkdirSync(netDir, { recursive: true });
  const dbPath = path.join(netDir, "Cookies");
  const db = new BetterSqlite(dbPath);
  db.exec(`
    CREATE TABLE cookies (
      creation_utc INTEGER NOT NULL,
      host_key TEXT NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      path TEXT NOT NULL,
      expires_utc INTEGER NOT NULL,
      is_secure INTEGER NOT NULL DEFAULT 1,
      is_httponly INTEGER NOT NULL DEFAULT 1,
      last_access_utc INTEGER NOT NULL DEFAULT 0,
      has_expires INTEGER NOT NULL DEFAULT 1,
      is_persistent INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 1,
      encrypted_value BLOB DEFAULT '',
      samesite INTEGER NOT NULL DEFAULT -1,
      source_scheme INTEGER NOT NULL DEFAULT 2,
      last_update_utc INTEGER NOT NULL DEFAULT 0
    );
  `);
  const ins = db.prepare(
    `INSERT INTO cookies (creation_utc, host_key, name, value, path, expires_utc, encrypted_value, last_update_utc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of rows) {
    ins.run(
      r.creationUtc ?? 1,
      r.domain,
      r.name,
      r.value ?? "",
      r.path ?? "/",
      r.expiresUtc ?? 0,
      r.encryptedValue ?? Buffer.alloc(0),
      r.lastUpdateUtc ?? 1,
    );
  }
  db.close();
  return dbPath;
}

test("readProfileDiskCookiePairs reads unlocked Cookies DB with zero temp-copy, caches by mtime/size, and falls back when locked", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-disk-ck-test-"));
  try {
    const futureWebkit = ((BigInt(Date.now()) + 11644473600000n + 3600_000n) * 1000n).toString();
    const expiredWebkit = ((BigInt(Date.now()) + 11644473600000n - 3600_000n) * 1000n).toString();
    createFakeCookiesDb(tmpRoot, [
      { domain: ".chatgpt.com", name: "__Secure-next-auth.session-token", value: "tok-live", expiresUtc: BigInt(futureWebkit) },
      { domain: ".chatgpt.com", name: "expired_cookie", value: "old", expiresUtc: BigInt(expiredWebkit) },
    ]);

    const before = _getDiskCookieStats();
    const res1 = readProfileDiskCookiePairs(tmpRoot);
    assert.equal(res1.ok, true);
    assert.equal(res1.pairs.length, 1);
    assert.equal(res1.pairs[0].name, "__Secure-next-auth.session-token");
    assert.equal(res1.pairs[0].value, "tok-live");

    const afterFirst = _getDiskCookieStats();
    assert.equal(afterFirst.zeroCopyReads - before.zeroCopyReads, 1);
    assert.equal(afterFirst.tempCopyReads - before.tempCopyReads, 0);
    assert.equal(afterFirst.lruMisses - before.lruMisses, 1);

    // Second read on unchanged file hits LRU with 0 SQLite opens
    const res2 = readProfileDiskCookiePairs(tmpRoot);
    assert.equal(res2.ok, true);
    assert.equal(res2.pairs.length, 1);
    const afterSecond = _getDiskCookieStats();
    assert.equal(afterSecond.lruHits - afterFirst.lruHits, 1);
    assert.equal(afterSecond.zeroCopyReads - afterFirst.zeroCopyReads, 0);
    assert.equal(afterSecond.tempCopyReads - afterFirst.tempCopyReads, 0);

    // Simulate exclusive lockfile + touched mtime -> falls back cleanly to temp-copy without error
    const lockFile = path.join(tmpRoot, "lockfile");
    const lockFd = fs.openSync(lockFile, "w");
    try {
      const ckPath = path.join(tmpRoot, "Default", "Network", "Cookies");
      const bumpedTime = new Date(Date.now() + 5000);
      fs.utimesSync(ckPath, bumpedTime, bumpedTime);
      // Hold exclusive Windows file lock via child or verify non-exclusive fallback; on Windows openSync('w') shares write unless locked,
      // so also verify updating Cookies DB invalidates mtime cache cleanly:
      const dbUpdate = new BetterSqlite(ckPath);
      dbUpdate
        .prepare(
          "INSERT INTO cookies (creation_utc, host_key, name, value, path, expires_utc, encrypted_value, last_update_utc) VALUES (2, '.claude.ai', 'sessionKey', 'sk-ant-1', '/', 0, x'', 2)",
        )
        .run();
      dbUpdate.close();

      const res3 = readProfileDiskCookiePairs(tmpRoot);
      assert.equal(res3.ok, true);
      assert.equal(res3.pairs.length, 2);
      assert.ok(res3.pairs.some((p) => p.name === "sessionKey" && p.value === "sk-ant-1"));
    } finally {
      fs.closeSync(lockFd);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("getVaultCookiePairsForProfileCode caches Vault JSON by (mtimeMs, size), filters expired cookies dynamically, and invalidates immediately on update", () => {
  const prevDataDir = process.env.P0002_DATA_DIR;
  const tmpVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-vault-sig-test-"));
  process.env.P0002_DATA_DIR = tmpVaultDir;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const svcFile = path.join(tmpVaultDir, "service-cookie-vault.json");
    fs.writeFileSync(
      svcFile,
      JSON.stringify({
        services: {
          "0042:chatgpt": {
            code: "0042",
            cookies: [
              { domain: ".chatgpt.com", name: "__Secure-next-auth.session-token", value: "v-live-1", expires: nowSec + 3600 },
              { domain: ".chatgpt.com", name: "expired_tok", value: "v-old", expires: nowSec - 60 },
            ],
          },
        },
      }),
      "utf8",
    );

    const before = _getDiskCookieStats();
    const first = getVaultCookiePairsForProfileCode("0042");
    assert.equal(first.length, 1);
    assert.equal(first[0].name, "__Secure-next-auth.session-token");
    assert.equal(first[0].value, "v-live-1");
    const afterFirst = _getDiskCookieStats();
    assert.equal(afterFirst.vaultJsonParses - before.vaultJsonParses, 1);

    // Repeat call with unchanged file hits signature cache (0 JSON.parse)
    const second = getVaultCookiePairsForProfileCode("0042");
    assert.equal(second.length, 1);
    const afterSecond = _getDiskCookieStats();
    assert.equal(afterSecond.vaultSigHits - afterFirst.vaultSigHits, 1);
    assert.equal(afterSecond.vaultJsonParses - afterFirst.vaultJsonParses, 0);

    // Updating vault file on disk invalidates signature cache with 0 ms staleness lag
    fs.writeFileSync(
      svcFile,
      JSON.stringify({
        services: {
          "0042:chatgpt": {
            code: "0042",
            cookies: [
              { domain: ".chatgpt.com", name: "__Secure-next-auth.session-token", value: "v-live-1", expires: nowSec + 3600 },
              { domain: ".claude.ai", name: "sessionKey", value: "sk-ant-sid01-fresh", expires: 0 },
            ],
          },
        },
      }),
      "utf8",
    );
    const bumped = new Date(Date.now() + 2000);
    fs.utimesSync(svcFile, bumped, bumped);

    const third = getVaultCookiePairsForProfileCode("0042");
    assert.equal(third.length, 2);
    assert.ok(third.some((p) => p.name === "sessionKey" && p.value === "sk-ant-sid01-fresh"));
    const afterThird = _getDiskCookieStats();
    assert.equal(afterThird.vaultJsonParses - afterSecond.vaultJsonParses, 1);
  } finally {
    if (prevDataDir === undefined) {
      delete process.env.P0002_DATA_DIR;
    } else {
      process.env.P0002_DATA_DIR = prevDataDir;
    }
    fs.rmSync(tmpVaultDir, { recursive: true, force: true });
  }
});
