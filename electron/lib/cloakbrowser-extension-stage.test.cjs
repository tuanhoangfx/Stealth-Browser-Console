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
  const result = ensureCloakbrowserExtensionStage(src, cloakCache, { isAnyProfileLive: () => false });
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
  const result = ensureCloakbrowserExtensionStage(src, cloakCache, { isAnyProfileLive: () => false });
  assert.ok(result);
  assert.equal(fs.existsSync(path.join(result.stageDir, "dist", "background.js")), true, "runtime files copied");
  assert.equal(fs.existsSync(path.join(result.stageDir, ".chrome-store-profile")), false, "dev profile excluded");

  // Simulate a pre-existing bloated stage (older unfiltered copy) → prune on next call.
  fs.mkdirSync(path.join(result.stageDir, ".chrome-store-profile", "Default"), { recursive: true });
  fs.writeFileSync(path.join(result.stageDir, ".chrome-store-profile", "Default", "Cookies"), "junk", "utf8");
  ensureCloakbrowserExtensionStage(src, cloakCache, { isAnyProfileLive: () => false });
  assert.equal(fs.existsSync(path.join(result.stageDir, ".chrome-store-profile")), false, "stale dev profile pruned");

  try {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cloakCache, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test("icon refresh waits until no profile is live", () => {
  const storeId = "ailoabdmgclmfmhdagmlohpjlbpffblp";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-stage-icon-"));
  const src = path.join(root, "extensions-cache", storeId, "unpacked");
  fs.mkdirSync(path.join(src, "icons"), { recursive: true });
  fs.writeFileSync(path.join(src, "manifest.json"), JSON.stringify({ name: "E0002" }), "utf8");
  fs.writeFileSync(path.join(src, "icons", "icon16.png"), "old", "utf8");

  const cloakCache = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-cache-icon-"));
  const result = ensureCloakbrowserExtensionStage(src, cloakCache, { isAnyProfileLive: () => false });
  assert.equal(fs.readFileSync(path.join(result.stageDir, "icons", "icon16.png"), "utf8"), "old");

  fs.writeFileSync(path.join(src, "icons", "icon16.png"), "new-bytes", "utf8");
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(src, "icons", "icon16.png"), later, later);

  ensureCloakbrowserExtensionStage(src, cloakCache, { isAnyProfileLive: () => true });
  assert.equal(fs.readFileSync(path.join(result.stageDir, "icons", "icon16.png"), "utf8"), "old");

  ensureCloakbrowserExtensionStage(src, cloakCache, { isAnyProfileLive: () => false });
  assert.equal(fs.readFileSync(path.join(result.stageDir, "icons", "icon16.png"), "utf8"), "new-bytes");

  try {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cloakCache, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test("ensureCloakbrowserExtensionStage writes through an operator junction", () => {
  const storeId = "kaaadageakdandpobcofplmfbjfjabdk";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-stage-"));
  const src = path.join(root, "extensions-cache", storeId, "unpacked");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, "manifest.json"), JSON.stringify({ name: "E0001", v: 2 }), "utf8");

  const stable = path.join(root, "extension-stage", storeId);
  fs.mkdirSync(stable, { recursive: true });
  fs.writeFileSync(path.join(stable, "manifest.json"), JSON.stringify({ name: "E0001", v: 1 }), "utf8");
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(stable, "manifest.json"), past, past);

  const cloakCache = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-cache-"));
  fs.symlinkSync(stable, path.join(cloakCache, storeId), "junction");

  const result = ensureCloakbrowserExtensionStage(src, cloakCache, { isAnyProfileLive: () => false });
  assert.ok(result);
  assert.ok(fs.lstatSync(path.join(cloakCache, storeId)).isSymbolicLink());
  assert.equal(JSON.parse(fs.readFileSync(path.join(stable, "manifest.json"), "utf8")).v, 2);
});

test("ensureCloakbrowserExtensionStage upgrades manifest version and verified_contents even when profiles are live and CRX mtime is older", () => {
  const storeId = "kaaadageakdandpobcofplmfbjfjabdk";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-stage-ver-"));
  const src = path.join(root, "extensions-cache", storeId, "unpacked");
  fs.mkdirSync(path.join(src, "_metadata"), { recursive: true });
  fs.writeFileSync(path.join(src, "manifest.json"), JSON.stringify({ name: "E0001", version: "1.2.5" }), "utf8");
  fs.writeFileSync(path.join(src, "_metadata", "verified_contents.json"), "{}", "utf8");
  const olderCrxTime = new Date(Date.now() - 120_000);
  fs.utimesSync(path.join(src, "manifest.json"), olderCrxTime, olderCrxTime);

  const stable = path.join(root, "extension-stage", storeId);
  fs.mkdirSync(stable, { recursive: true });
  fs.writeFileSync(path.join(stable, "manifest.json"), JSON.stringify({ name: "E0001", version: "1.1.25" }), "utf8");

  const cloakCache = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-cache-ver-"));
  fs.symlinkSync(stable, path.join(cloakCache, storeId), "junction");

  const result = ensureCloakbrowserExtensionStage(src, cloakCache, { isAnyProfileLive: () => true });
  assert.ok(result);
  assert.equal(JSON.parse(fs.readFileSync(path.join(stable, "manifest.json"), "utf8")).version, "1.2.5");
  assert.equal(fs.existsSync(path.join(stable, "_metadata", "verified_contents.json")), true);

  try {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cloakCache, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test("validateOperatorExtensionPackage verifies E0002 manifest entry points and operator-cdp.json contract parity", (t) => {
  const { validateOperatorExtensionPackage } = require("./operator-extension-stage.cjs");
  const e0002Dir = path.resolve(__dirname, "..", "..", "..", "..", "Extension", "E0002-browser-operator");
  if (!fs.existsSync(path.join(e0002Dir, "manifest.json"))) {
    t.skip("E0002-browser-operator is archived");
    return;
  }
  const validation = validateOperatorExtensionPackage(e0002Dir);
  assert.equal(validation.ok, true, `Expected E0002 validation OK, got: ${JSON.stringify(validation)}`);
  assert.deepEqual(validation.missing, []);
  assert.deepEqual(validation.contractErrors, []);
  assert.ok(validation.files.includes("content-mark.js"));
  assert.ok(validation.files.includes("content-muse.js"));
  assert.ok(validation.files.includes("content-groups.js"));
  assert.ok(validation.files.includes("content-fb-auth.js"));
  assert.ok(validation.files.includes("background.js"));
  assert.ok(validation.files.includes("popup.html"));
});
