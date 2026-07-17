const test = require("node:test");
const assert = require("node:assert/strict");

const MODULE_PATH = "./cookie-bridge-store.cjs";

function loadFresh() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

test("cookieBridgeEnabled defaults to enabled", () => {
  const prev = process.env.STEALTH_COOKIE_BRIDGE;
  delete process.env.STEALTH_COOKIE_BRIDGE;
  try {
    const mod = loadFresh();
    assert.equal(mod.cookieBridgeEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.STEALTH_COOKIE_BRIDGE;
    else process.env.STEALTH_COOKIE_BRIDGE = prev;
  }
});

test("cookieBridgeEnabled respects explicit off env", () => {
  const prev = process.env.STEALTH_COOKIE_BRIDGE;
  process.env.STEALTH_COOKIE_BRIDGE = "0";
  try {
    const mod = loadFresh();
    assert.equal(mod.cookieBridgeEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.STEALTH_COOKIE_BRIDGE;
    else process.env.STEALTH_COOKIE_BRIDGE = prev;
  }
});

test("resolveCachedExtensionDir returns AppData cache not workspace", () => {
  const os = require("node:os");
  const fs = require("node:fs");
  const path = require("node:path");
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-cb-"));
  const prevLocal = process.env.STEALTH_COOKIE_BRIDGE_LOCAL;
  process.env.STEALTH_COOKIE_BRIDGE_LOCAL = "0";
  const mod = loadFresh();
  const workspace = mod.workspaceExtensionDir();
  if (!workspace) {
    assert.ok(true, "skip — workspace E0001 not present");
    return;
  }
  const cache = mod.unpackedDir(tmpRoot);
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, "manifest.json"), JSON.stringify({ name: "E0001 Cookie Bridge" }), "utf8");
  const resolved = mod.resolveCachedExtensionDir(tmpRoot);
  assert.equal(resolved, cache);
  assert.notEqual(resolved, workspace);
  assert.equal(fs.existsSync(path.join(cache, "manifest.json")), true);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } finally {
    if (prevLocal === undefined) delete process.env.STEALTH_COOKIE_BRIDGE_LOCAL;
    else process.env.STEALTH_COOKIE_BRIDGE_LOCAL = prevLocal;
  }
});

// Fresh-install fast path: a brand-new AppData root with no extensions-cache must be
// able to load E0001 from the installer-bundled verified snapshot WITHOUT any Chrome
// Web Store download. This is what makes a fresh install open the first profile fast
// and offline. If the committed snapshot is missing/unverified the test is skipped
// (release gate `sync-bundled-e0001` guarantees it in shipped builds).
test("E0001 bundled snapshot seeds a fresh cache with no download", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const mod = loadFresh();

  const bundle = mod.bundledCookieBridgeDir();
  if (!bundle || !mod.isVerifiedStoreExtension(bundle)) {
    t.skip("no committed verified bundle in build/bundled-extensions");
    return;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "e0001-seed-"));
  const prevUserData = process.env.STEALTH_USER_DATA;
  const prevBridge = process.env.STEALTH_COOKIE_BRIDGE;
  const prevLocal = process.env.STEALTH_COOKIE_BRIDGE_LOCAL;
  try {
    process.env.STEALTH_USER_DATA = root;
    process.env.STEALTH_COOKIE_BRIDGE = "1";
    delete process.env.STEALTH_COOKIE_BRIDGE_LOCAL;

    const cache = mod.unpackedDir(root);
    assert.ok(!fs.existsSync(path.join(cache, "manifest.json")), "cache should start empty");

    const seeded = mod.seedCacheFromBundle(root);
    assert.equal(seeded, cache, "seed target is the AppData cache unpacked dir");
    assert.ok(fs.existsSync(path.join(cache, "manifest.json")), "manifest copied");
    assert.ok(mod.isVerifiedStoreExtension(cache), "seeded copy keeps _metadata (loads under store id)");

    // The synchronous launch resolver must now return the seeded cache directly.
    assert.equal(mod.resolveCachedExtensionDir(root), cache, "resolver returns seeded verified cache");

    // Fresh-install guard: the launch hot path (resolveCookieBridgeExtensionDirSync)
    // must return a ready dir WITHOUT awaiting any Chrome Web Store download — proving
    // the first profile open never blocks on the network.
    fs.rmSync(cache, { recursive: true, force: true });
    assert.ok(!fs.existsSync(path.join(cache, "manifest.json")), "cache emptied for sync-path check");
    const syncDir = mod.resolveCookieBridgeExtensionDirSync(root);
    assert.equal(syncDir, cache, "sync launch resolver seeds from bundle (no download)");
    assert.ok(mod.isVerifiedStoreExtension(syncDir), "sync-resolved dir is verified");

    // Idempotent: a second call keeps the existing cache (no error, no re-copy failure).
    assert.equal(mod.seedCacheFromBundle(root), cache, "second seed is a no-op returning cache");
  } finally {
    if (prevUserData === undefined) delete process.env.STEALTH_USER_DATA;
    else process.env.STEALTH_USER_DATA = prevUserData;
    if (prevBridge === undefined) delete process.env.STEALTH_COOKIE_BRIDGE;
    else process.env.STEALTH_COOKIE_BRIDGE = prevBridge;
    if (prevLocal !== undefined) process.env.STEALTH_COOKIE_BRIDGE_LOCAL = prevLocal;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
