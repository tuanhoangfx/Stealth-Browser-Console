"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { listBackupCandidates } = require("./catalog-backup-recovery.cjs");

describe("catalog-backup-recovery", () => {
  it("lists stealth-console backup filenames", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-backup-"));
    try {
      fs.writeFileSync(path.join(dir, "stealth-console.db"), "live");
      fs.writeFileSync(path.join(dir, "stealth-console.db.corrupt.2026.bak"), "bak");
      fs.writeFileSync(path.join(dir, "stealth-console.db.repair.bak"), "repair");
      fs.writeFileSync(path.join(dir, "profile-backup-meta.json"), "meta");
      const names = listBackupCandidates(dir).map((p) => path.basename(p)).sort();
      assert.deepEqual(names, [
        "stealth-console.db.corrupt.2026.bak",
        "stealth-console.db.repair.bak",
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
