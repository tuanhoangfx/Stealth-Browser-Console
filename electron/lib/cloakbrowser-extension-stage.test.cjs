const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ensureCloakbrowserExtensionStage,
  resolveStageExtensionId,
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
