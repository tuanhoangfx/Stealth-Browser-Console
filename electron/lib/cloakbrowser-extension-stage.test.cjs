const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ensureCloakbrowserExtensionStage,
  resolveStageExtensionId,
  shouldCopyExtensionEntry,
} = require("./cloakbrowser-extension-stage.cjs");
const { unpackedExtensionId } = require("./profile-chrome-preferences.cjs");
const { COOKIE_BRIDGE_STORE_ID } = require("./cookie-bridge-store.cjs");

test("resolveStageExtensionId uses Web Store id for extensions-cache paths", () => {
  const storeId = COOKIE_BRIDGE_STORE_ID;
  const dir = `C:/AppData/extensions-cache/${storeId}/unpacked`;
  assert.equal(resolveStageExtensionId(dir), storeId);
});

test("ensureCloakbrowserExtensionStage writes manifest under cacheDir/storeId", () => {
  const storeId = "ailoabdmgclmfmhdagmlohpjlbpffblp";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-stage-"));
  const src = path.join(root, "extensions-cache", storeId, "unpacked");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, "manifest.json"), JSON.stringify({ name: "Surfshark" }), "utf8");

  const cloakCache = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-cache-"));
  const result = ensureCloakbrowserExtensionStage(src, cloakCache);
  assert.ok(result);
  assert.equal(result.extId, storeId);
  assert.equal(result.stageDir, path.join(cloakCache, storeId));
  assert.equal(fs.existsSync(path.join(result.stageDir, "manifest.json")), true);
  assert.notEqual(result.extId, unpackedExtensionId(src));

  try {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cloakCache, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test("shouldCopyExtensionEntry skips dev/publish dirs, keeps runtime files", () => {
  assert.equal(shouldCopyExtensionEntry("manifest.json"), true);
  assert.equal(shouldCopyExtensionEntry("dist/background.js"), true);
  assert.equal(shouldCopyExtensionEntry("icons/icon16.png"), true);
  assert.equal(shouldCopyExtensionEntry("_metadata/verified_contents.json"), true);
  assert.equal(shouldCopyExtensionEntry(".chrome-store-profile/Default/Cookies"), false);
  assert.equal(shouldCopyExtensionEntry(".git/config"), false);
  assert.equal(shouldCopyExtensionEntry("node_modules/x/index.js"), false);
  assert.equal(shouldCopyExtensionEntry("docs/readme.md"), false);
  assert.equal(shouldCopyExtensionEntry(".github/workflows/ci.yml"), false);
});

test("ensureCloakbrowserExtensionStage excludes + prunes dev dirs from stage", () => {
  const storeId = "ailoabdmgclmfmhdagmlohpjlbpffblp";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-stage-prune-"));
  const src = path.join(root, "extensions-cache", storeId, "unpacked");
  fs.mkdirSync(path.join(src, "dist"), { recursive: true });
  fs.mkdirSync(path.join(src, ".chrome-store-profile", "Default"), { recursive: true });
  fs.writeFileSync(path.join(src, "manifest.json"), JSON.stringify({ name: "E0001" }), "utf8");
  fs.writeFileSync(path.join(src, "dist", "background.js"), "// bg", "utf8");
  fs.writeFileSync(path.join(src, ".chrome-store-profile", "Default", "Cookies"), "junk", "utf8");

  const cloakCache = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-cache-prune-"));
  const result = ensureCloakbrowserExtensionStage(src, cloakCache);
  assert.ok(result);
  assert.equal(fs.existsSync(path.join(result.stageDir, "dist", "background.js")), true, "runtime files copied");
  assert.equal(fs.existsSync(path.join(result.stageDir, ".chrome-store-profile")), false, "dev profile excluded");

  // Simulate a pre-existing bloated stage (older unfiltered copy) → prune on next call.
  fs.mkdirSync(path.join(result.stageDir, ".chrome-store-profile", "Default"), { recursive: true });
  fs.writeFileSync(path.join(result.stageDir, ".chrome-store-profile", "Default", "Cookies"), "junk", "utf8");
  ensureCloakbrowserExtensionStage(src, cloakCache);
  assert.equal(fs.existsSync(path.join(result.stageDir, ".chrome-store-profile")), false, "stale dev profile pruned");

  try {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cloakCache, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
