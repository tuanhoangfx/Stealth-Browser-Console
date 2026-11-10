const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromeLocalExtensionArgs } = require("../engine/cloak-browser-engine.cjs");
const {
  isStoreCacheExtensionPath,
  prepareProfileExtensions,
  stageOperatorExtension,
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
  const prevOperator = process.env.STEALTH_OPERATOR_EXTENSION;
  process.env.STEALTH_COOKIE_BRIDGE = "0";
  process.env.STEALTH_OPERATOR_EXTENSION = "0";
  try {
    prepareProfileExtensions(userDataDir, root, cloakCache, {
      effectiveToggles: { e0001: false, e0002: false, surfshark: true, webStore: false },
    });
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
    if (prevOperator === undefined) delete process.env.STEALTH_OPERATOR_EXTENSION;
    else process.env.STEALTH_OPERATOR_EXTENSION = prevOperator;
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

  const prevOperator = process.env.STEALTH_OPERATOR_EXTENSION;
  process.env.STEALTH_OPERATOR_EXTENSION = "0";
  let before;
  try {
    before = repairAllProfileExtensionPaths(root, cloakCache, {
      effectiveToggles: { e0001: false, e0002: false, surfshark: true, webStore: false },
    });
    assert.equal(before.rewritten, 1);
    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    const pinned = prefs.extensions.settings[storeId].path.replace(/\\/g, "/").toLowerCase();
    assert.ok(!pinned.includes("extensions-cache"), pinned);
    assert.ok(pinned.includes(`/${storeId}`), pinned);

    const after = repairAllProfileExtensionPaths(root, cloakCache, {
      effectiveToggles: { e0001: false, e0002: false, surfshark: true, webStore: false },
    });
    assert.equal(after.rewritten, 0);
  } finally {
    if (prevOperator === undefined) delete process.env.STEALTH_OPERATOR_EXTENSION;
    else process.env.STEALTH_OPERATOR_EXTENSION = prevOperator;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cloakCache, { recursive: true, force: true });
  }
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
  const prevOperator = process.env.STEALTH_OPERATOR_EXTENSION;
  process.env.STEALTH_COOKIE_BRIDGE = "0";
  process.env.STEALTH_OPERATOR_EXTENSION = "0";
  try {
    const entries = readProfileExtensionSources(userDataDir, root, {
      e0001: false,
      e0002: false,
      surfshark: true,
      webStore: false,
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].storeId, storeId);
  } finally {
    if (prev === undefined) delete process.env.STEALTH_COOKIE_BRIDGE;
    else process.env.STEALTH_COOKIE_BRIDGE = prev;
    if (prevOperator === undefined) delete process.env.STEALTH_OPERATOR_EXTENSION;
    else process.env.STEALTH_OPERATOR_EXTENSION = prevOperator;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("prepareProfileExtensions stages operator under cacheDir/unpackedId", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-operator-"));
  const cloakCache = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-cache-"));
  const userDataDir = path.join(root, "profiles", "p1");
  const operator = path.join(root, "operator");
  fs.mkdirSync(operator, { recursive: true });
  fs.writeFileSync(path.join(operator, "manifest.json"), JSON.stringify({ name: "E0002 Browser Operator" }), "utf8");

  const prevBridge = process.env.STEALTH_COOKIE_BRIDGE;
  const prevOperator = process.env.STEALTH_OPERATOR_EXTENSION;
  const prevDir = process.env.STEALTH_OPERATOR_EXTENSION_DIR;
  const prevRoot = process.env.STEALTH_CLOAKBROWSER_ROOT;
  process.env.STEALTH_COOKIE_BRIDGE = "0";
  process.env.STEALTH_OPERATOR_EXTENSION = "1";
  process.env.STEALTH_OPERATOR_EXTENSION_DIR = operator;
  process.env.STEALTH_CLOAKBROWSER_ROOT = root;
  try {
    const staged = stageOperatorExtension(cloakCache);
    assert.ok(staged);
    const id = unpackedExtensionId(operator);
    assert.equal(staged.extId, id);
    assert.equal(fs.existsSync(path.join(staged.stageDir, "manifest.json")), true);
    const linkedManifest = path.join(cloakCache, id, "manifest.json");
    assert.equal(fs.existsSync(linkedManifest), true);
    prepareProfileExtensions(userDataDir, root, cloakCache);
    assert.equal(fs.existsSync(linkedManifest), true);
  } finally {
    if (prevBridge === undefined) delete process.env.STEALTH_COOKIE_BRIDGE;
    else process.env.STEALTH_COOKIE_BRIDGE = prevBridge;
    if (prevOperator === undefined) delete process.env.STEALTH_OPERATOR_EXTENSION;
    else process.env.STEALTH_OPERATOR_EXTENSION = prevOperator;
    if (prevDir === undefined) delete process.env.STEALTH_OPERATOR_EXTENSION_DIR;
    else process.env.STEALTH_OPERATOR_EXTENSION_DIR = prevDir;
    if (prevRoot === undefined) delete process.env.STEALTH_CLOAKBROWSER_ROOT;
    else process.env.STEALTH_CLOAKBROWSER_ROOT = prevRoot;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cloakCache, { recursive: true, force: true });
  }
});

test("chromeLocalExtensionArgs only loads unpacked paths", () => {
  const dir = "C:/cache/extensions-cache/_local/dev-abc/unpacked";
  const flags = chromeLocalExtensionArgs([dir]);
  assert.deepEqual(flags, [`--load-extension=${path.resolve(dir).replace(/\\/g, "/")}`]);
});

test("prepareProfileExtensions keeps unverified workspace E0001 in cliStoreLoads across repeated launches", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-ws-e0001-"));
  const cloakCache = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-cache-ws-"));
  const userDataDir = path.join(root, "profiles", "p1");
  const bridgeId = "kaaadageakdandpobcofplmfbjfjabdk";
  const src = path.join(root, "extensions-cache", bridgeId, "unpacked");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(
    path.join(src, "manifest.json"),
    JSON.stringify({ name: "E0001 Cookie Bridge", version: "1.2.17", manifest_version: 3 }),
    "utf8",
  );
  // Simulate a profile that previously had a Web Store pin before switching to workspace mode
  pinStoreExtension(userDataDir, bridgeId, src);

  const prevBridge = process.env.STEALTH_COOKIE_BRIDGE;
  const prevDev = process.env.STEALTH_COOKIE_BRIDGE_DEV;
  const prevOperator = process.env.STEALTH_OPERATOR_EXTENSION;
  process.env.STEALTH_COOKIE_BRIDGE = "1";
  process.env.STEALTH_COOKIE_BRIDGE_DEV = "1";
  process.env.STEALTH_OPERATOR_EXTENSION = "0";
  try {
    const plan1 = prepareProfileExtensions(userDataDir, root, cloakCache, {
      effectiveToggles: { e0001: true, e0002: false, surfshark: false, webStore: false },
    });
    assert.equal(plan1.cliStoreLoads.length, 1);
    const stagedDir = path.join(cloakCache, bridgeId);
    const expectedPinId = unpackedExtensionId(stagedDir);
    assert.equal(plan1.cliStoreLoads[0].storeId, bridgeId);
    assert.equal(path.resolve(plan1.cliStoreLoads[0].dir), path.resolve(stagedDir));

    // Second launch must NOT drop E0001 from cliStoreLoads even though unpacked toolbar pin now exists in Preferences
    const plan2 = prepareProfileExtensions(userDataDir, root, cloakCache, {
      effectiveToggles: { e0001: true, e0002: false, surfshark: false, webStore: false },
    });
    assert.equal(plan2.cliStoreLoads.length, 1);
    assert.equal(plan2.cliStoreLoads[0].storeId, bridgeId);

    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    assert.equal(prefs.extensions.settings[bridgeId], undefined);
    assert.ok(prefs.extensions.settings[expectedPinId]);
  } finally {
    if (prevBridge === undefined) delete process.env.STEALTH_COOKIE_BRIDGE;
    else process.env.STEALTH_COOKIE_BRIDGE = prevBridge;
    if (prevDev === undefined) delete process.env.STEALTH_COOKIE_BRIDGE_DEV;
    else process.env.STEALTH_COOKIE_BRIDGE_DEV = prevDev;
    if (prevOperator === undefined) delete process.env.STEALTH_OPERATOR_EXTENSION;
    else process.env.STEALTH_OPERATOR_EXTENSION = prevOperator;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cloakCache, { recursive: true, force: true });
  }
});
