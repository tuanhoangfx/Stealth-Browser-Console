const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromeLocalExtensionArgs } = require("../engine/cloak-browser-engine.cjs");
const {
  isStoreCacheExtensionPath,
  prepareProfileExtensions,
  readProfileExtensionSources,
  repairAllProfileExtensionPaths,
} = require("./native-extension-load.cjs");
const { purgeDuplicateUnpackedStoreExtensions } = require("./profile-chrome-cleanup.cjs");
const { pinStoreExtension, pinToolbarExtension, unpackedExtensionId } = require("./profile-chrome-preferences.cjs");

test("isStoreCacheExtensionPath detects Web Store cache layout", () => {
  const storePath = "C:/AppData/extensions-cache/kaaadageakdandpobcofplmfbjfjabdk/unpacked";
  assert.equal(isStoreCacheExtensionPath(storePath), true);
});

test("prepareProfileExtensions pins store extension to CloakBrowser stage path only", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-prep-"));
  const cloakCache = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-cache-"));
  const userDataDir = path.join(root, "profiles", "p1");
  const storeId = "ailoabdmgclmfmhdagmlohpjlbpffblp";
  const src = path.join(root, "extensions-cache", storeId, "unpacked");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, "manifest.json"), JSON.stringify({ name: "Surfshark VPN" }), "utf8");
  fs.mkdirSync(path.join(src, "_metadata"), { recursive: true });
  fs.writeFileSync(path.join(src, "_metadata", "verified_contents.json"), "{}", "utf8");
  pinStoreExtension(userDataDir, storeId, src);

  const prev = process.env.STEALTH_COOKIE_BRIDGE;
  process.env.STEALTH_COOKIE_BRIDGE = "0";
  try {
    prepareProfileExtensions(userDataDir, root, cloakCache);
    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    const pinnedPath = prefs.extensions.settings[storeId].path.replace(/\\/g, "/").toLowerCase();
    const srcNorm = src.replace(/\\/g, "/").toLowerCase();
    assert.notEqual(pinnedPath, srcNorm);
    assert.ok(pinnedPath.endsWith(`/${storeId}`), pinnedPath);
    assert.equal(Object.keys(prefs.extensions.settings).length, 1);
    assert.ok(fs.existsSync(path.join(cloakCache, storeId, "manifest.json")));
  } finally {
    if (prev === undefined) delete process.env.STEALTH_COOKIE_BRIDGE;
    else process.env.STEALTH_COOKIE_BRIDGE = prev;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cloakCache, { recursive: true, force: true });
  }
});

test("repairAllProfileExtensionPaths rewrites only extensions-cache prefs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-repair-"));
  const cloakCache = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-cache-"));
  const storeId = "ailoabdmgclmfmhdagmlohpjlbpffblp";
  const src = path.join(root, "extensions-cache", storeId, "unpacked");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, "manifest.json"), JSON.stringify({ name: "Surfshark", version: "1" }));
  const userDataDir = path.join(root, "profiles", "p1");
  fs.mkdirSync(path.join(userDataDir, "Default"), { recursive: true });
  pinStoreExtension(userDataDir, storeId, src);

  const before = repairAllProfileExtensionPaths(root, cloakCache);
  assert.equal(before.rewritten, 1);
  const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
  const pinned = prefs.extensions.settings[storeId].path.replace(/\\/g, "/").toLowerCase();
  assert.ok(!pinned.includes("extensions-cache"), pinned);
  assert.ok(pinned.includes(`/${storeId}`), pinned);

  const after = repairAllProfileExtensionPaths(root, cloakCache);
  assert.equal(after.rewritten, 0);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cloakCache, { recursive: true, force: true });
});

test("purgeDuplicateUnpackedStoreExtensions removes shadow unpacked id", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-dedupe-"));
  const userDataDir = path.join(root, "profiles", "p1");
  const extDir = path.join(root, "extensions-cache", "ailoabdmgclmfmhdagmlohpjlbpffblp", "unpacked");
  fs.mkdirSync(extDir, { recursive: true });
  fs.writeFileSync(path.join(extDir, "manifest.json"), JSON.stringify({ name: "Surfshark" }), "utf8");
  pinStoreExtension(userDataDir, "ailoabdmgclmfmhdagmlohpjlbpffblp", extDir);
  pinToolbarExtension(userDataDir, extDir);
  const result = purgeDuplicateUnpackedStoreExtensions(userDataDir);
  assert.equal(result.removed, 1);
  const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
  assert.equal(Object.keys(prefs.extensions.settings).length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test("readProfileExtensionSources only reads profile prefs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-prof-ext-"));
  const userDataDir = path.join(root, "profiles", "p1");
  const storeId = "ailoabdmgclmfmhdagmlohpjlbpffblp";
  const src = path.join(root, "extensions-cache", storeId, "unpacked");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, "manifest.json"), "{}", "utf8");
  pinStoreExtension(userDataDir, storeId, src);
  const prev = process.env.STEALTH_COOKIE_BRIDGE;
  process.env.STEALTH_COOKIE_BRIDGE = "0";
  try {
    const entries = readProfileExtensionSources(userDataDir, root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].storeId, storeId);
  } finally {
    if (prev === undefined) delete process.env.STEALTH_COOKIE_BRIDGE;
    else process.env.STEALTH_COOKIE_BRIDGE = prev;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("chromeLocalExtensionArgs only loads unpacked paths", () => {
  const dir = "C:/cache/extensions-cache/_local/dev-abc/unpacked";
  const flags = chromeLocalExtensionArgs([dir]);
  assert.deepEqual(flags, [`--load-extension=${path.resolve(dir).replace(/\\/g, "/")}`]);
});
