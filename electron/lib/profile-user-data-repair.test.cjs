const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  removeStaleProfileArtifacts,
  PROFILE_LOCK_FILES,
} = require("./profile-user-data-repair.cjs");

function testRemoveStaleProfileArtifacts() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-profile-repair-"));
  try {
    for (const name of PROFILE_LOCK_FILES) {
      fs.writeFileSync(path.join(dir, name), "lock");
    }
    fs.writeFileSync(path.join(dir, "DevToolsActivePort"), "9222\n");
    removeStaleProfileArtifacts(dir);
    for (const name of [...PROFILE_LOCK_FILES, "DevToolsActivePort"]) {
      assert.equal(fs.existsSync(path.join(dir, name)), false, `expected removed: ${name}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

testRemoveStaleProfileArtifacts();
console.log("profile-user-data-repair.test.cjs OK");
