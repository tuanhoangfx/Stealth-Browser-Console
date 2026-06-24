const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ensureCloakbrowserExtensionStage,
} = require("./cloakbrowser-extension-stage.cjs");
const { unpackedExtensionId } = require("./profile-chrome-preferences.cjs");
const { workspaceExtensionDir } = require("./cookie-bridge-store.cjs");

test("ensureCloakbrowserExtensionStage writes manifest under cacheDir/extId", () => {
  const workspace = workspaceExtensionDir();
  if (!workspace) {
    assert.ok(true, "skip — workspace E0001 not present");
    return;
  }

  const cloakCache = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-cache-"));
  const result = ensureCloakbrowserExtensionStage(workspace, cloakCache);
  assert.ok(result);
  assert.equal(result.extId, unpackedExtensionId(workspace));
  assert.equal(result.stageDir, path.join(cloakCache, result.extId));
  assert.equal(fs.existsSync(path.join(result.stageDir, "manifest.json")), true);

  try {
    fs.rmSync(cloakCache, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
