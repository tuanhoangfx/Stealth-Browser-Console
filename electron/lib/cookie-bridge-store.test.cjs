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
  const mod = loadFresh();
  const workspace = mod.workspaceExtensionDir();
  if (!workspace) {
    assert.ok(true, "skip — workspace E0001 not present");
    return;
  }
  const cache = mod.unpackedDir(tmpRoot);
  const resolved = mod.resolveCachedExtensionDir(tmpRoot);
  assert.equal(resolved, cache);
  assert.notEqual(resolved, workspace);
  assert.equal(fs.existsSync(path.join(cache, "manifest.json")), true);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
