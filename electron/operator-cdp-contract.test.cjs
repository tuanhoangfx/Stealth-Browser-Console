const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("E0002 manifest page access matches operator-cdp.json", () => {
  const contract = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "shared", "operator-cdp.json"), "utf8"),
  );
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "Extension", "E0002-browser-operator", "manifest.json"),
      "utf8",
    ),
  );
  assert.deepEqual(manifest.host_permissions, contract.page.hostPermissions);
  assert.deepEqual(manifest.content_scripts, contract.page.contentScripts);
  for (const script of manifest.content_scripts) {
    for (const file of script.js) {
      assert.equal(
        fs.existsSync(path.join(__dirname, "..", "..", "..", "Extension", "E0002-browser-operator", file)),
        true,
        file,
      );
    }
  }
});
