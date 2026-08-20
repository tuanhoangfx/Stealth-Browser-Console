const test = require("node:test");
const assert = require("node:assert/strict");

const MODE_PATH = "./extension-launch-mode.cjs";
const WEBSTORE_PATH = "./webstore-extension.cjs";

function loadFresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test("extensionLaunchMode defaults to native", () => {
  const prev = process.env.STEALTH_EXTENSION_MODE;
  delete process.env.STEALTH_EXTENSION_MODE;
  try {
    const mod = loadFresh(MODE_PATH);
    assert.equal(mod.extensionLaunchMode(), "native");
    assert.equal(mod.nativeExtensionsEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.STEALTH_EXTENSION_MODE;
    else process.env.STEALTH_EXTENSION_MODE = prev;
  }
});

test("extensionLaunchMode managed when STEALTH_EXTENSION_MODE=managed", () => {
  const prev = process.env.STEALTH_EXTENSION_MODE;
  process.env.STEALTH_EXTENSION_MODE = "managed";
  try {
    const mod = loadFresh(MODE_PATH);
    assert.equal(mod.extensionLaunchMode(), "managed");
    assert.equal(mod.managedExtensionsEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.STEALTH_EXTENSION_MODE;
    else process.env.STEALTH_EXTENSION_MODE = prev;
  }
});

test("parseStoreId accepts raw id and chromewebstore URL", () => {
  const mod = loadFresh(WEBSTORE_PATH);
  assert.equal(mod.parseStoreId("ailoabdmgclmfmhdagmlohpjlbpffblp"), "ailoabdmgclmfmhdagmlohpjlbpffblp");
  assert.equal(
    mod.parseStoreId(
      "https://chromewebstore.google.com/detail/surfshark-vpn-extension/ailoabdmgclmfmhdagmlohpjlbpffblp",
    ),
    "ailoabdmgclmfmhdagmlohpjlbpffblp",
  );
});

test("parseUpdateCheckXml reads status and version from CWS XML", () => {
  const mod = loadFresh(WEBSTORE_PATH);
  assert.deepEqual(
    mod.parseUpdateCheckXml(
      `<gupdate><app appid="x"><updatecheck status="ok" version="1.2.4" codebase="https://x"/></app></gupdate>`,
    ),
    { status: "ok", version: "1.2.4" },
  );
  assert.deepEqual(mod.parseUpdateCheckXml(`<updatecheck status="noupdate"/>`), {
    status: "noupdate",
    version: "",
  });
  assert.match(mod.storeUpdateCheckUrl("kaaadageakdandpobcofplmfbjfjabdk", "1.2.2"), /response=updatecheck/);
  assert.match(mod.storeUpdateCheckUrl("kaaadageakdandpobcofplmfbjfjabdk", "1.2.2"), /1\.2\.2/);
});

test("removeCachedExtension unpins store id from profile Preferences", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { pinStoreExtension } = require("./profile-chrome-preferences.cjs");
  const mod = loadFresh(WEBSTORE_PATH);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-ext-unpin-"));
  const storeId = "kaaadageakdandpobcofplmfbjfjabdk";
  const unpacked = path.join(root, "extensions-cache", storeId, "unpacked");
  const profileDir = path.join(root, "profiles", "p1");
  fs.mkdirSync(unpacked, { recursive: true });
  fs.writeFileSync(path.join(unpacked, "manifest.json"), JSON.stringify({ name: "Cookie Bridge", version: "1.2.2" }));
  pinStoreExtension(profileDir, storeId, unpacked);
  try {
    mod.removeCachedExtension(root, { kind: "store", storeId });
    const prefs = JSON.parse(fs.readFileSync(path.join(profileDir, "Default", "Preferences"), "utf8"));
    assert.equal(prefs.extensions.settings?.[storeId], undefined);
    assert.equal((prefs.extensions.pinned_extensions || []).includes(storeId), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("compareExtensionVersions ranks dotted Chrome extension versions", () => {
  const mod = loadFresh(WEBSTORE_PATH);
  assert.equal(mod.compareExtensionVersions("1.2.4", "1.2.2"), 1);
  assert.equal(mod.compareExtensionVersions("1.2.2", "1.2.4"), -1);
  assert.equal(mod.compareExtensionVersions("1.10.0", "1.9.9"), 1);
  assert.equal(mod.compareExtensionVersions("1.2.4", "1.2.4"), 0);
  assert.equal(mod.compareExtensionVersions("2.0", "1.9.9"), 1);
});

test("removeCachedExtensions deletes store and local cache folders", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const mod = loadFresh(WEBSTORE_PATH);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-ext-remove-"));
  const storeId = "kaaadageakdandpobcofplmfbjfjabdk";
  const storeUnpacked = path.join(root, "extensions-cache", storeId, "unpacked");
  const localKey = "Cookie-Bridge-local";
  const localUnpacked = path.join(root, "extensions-cache", "_local", localKey, "unpacked");
  fs.mkdirSync(storeUnpacked, { recursive: true });
  fs.mkdirSync(localUnpacked, { recursive: true });
  fs.writeFileSync(path.join(storeUnpacked, "manifest.json"), JSON.stringify({ name: "Store Ext", version: "1.0.0" }));
  fs.writeFileSync(path.join(localUnpacked, "manifest.json"), JSON.stringify({ name: "Local Ext", version: "1.0.0" }));
  try {
    const result = mod.removeCachedExtensions(root, [
      { kind: "store", storeId },
      { kind: "local", localKey },
    ]);
    assert.equal(result.removed, 2);
    assert.equal(fs.existsSync(path.join(root, "extensions-cache", storeId)), false);
    assert.equal(fs.existsSync(path.join(root, "extensions-cache", "_local", localKey)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("listAllLaunchExtensions omits shelved local unpacked cache", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const mod = loadFresh(WEBSTORE_PATH);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-ext-nolo-"));
  const storeId = "kaaadageakdandpobcofplmfbjfjabdk";
  const storeUnpacked = path.join(root, "extensions-cache", storeId, "unpacked");
  const localUnpacked = path.join(root, "extensions-cache", "_local", "Dev-Ext-aaaa", "unpacked");
  fs.mkdirSync(storeUnpacked, { recursive: true });
  fs.mkdirSync(localUnpacked, { recursive: true });
  fs.writeFileSync(path.join(storeUnpacked, "manifest.json"), JSON.stringify({ name: "Store Ext", version: "1.0.0" }));
  fs.writeFileSync(path.join(localUnpacked, "manifest.json"), JSON.stringify({ name: "Local Ext", version: "1.0.0" }));
  try {
    const rows = mod.listAllLaunchExtensions(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "store");
    assert.equal(rows[0].storeId, storeId);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkCachedStoreExtensionsOnStartup no-ops when cache is empty", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const mod = loadFresh(WEBSTORE_PATH);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-ext-empty-"));
  try {
    const rows = await mod.checkCachedStoreExtensionsOnStartup(root);
    assert.deepEqual(rows, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("removeCachedExtension rejects path traversal on localKey", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const mod = loadFresh(WEBSTORE_PATH);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-ext-trav-"));
  try {
    assert.throws(() => mod.removeCachedExtension(root, { kind: "local", localKey: "../outside" }), /invalid local/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("storeUpdateUrl encodes extension id", () => {
  const mod = loadFresh(WEBSTORE_PATH);
  const url = mod.storeUpdateUrl("kaaadageakdandpobcofplmfbjfjabdk");
  assert.match(url, /clients2\.google\.com\/service\/update2\/crx/);
  assert.match(url, /kaaadageakdandpobcofplmfbjfjabdk/);
});

test("readManifestName resolves __MSG_* from default_locale and locale scan", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const mod = loadFresh(WEBSTORE_PATH);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-ext-i18n-"));
  const unpacked = path.join(root, "unpacked");
  const localeDir = path.join(unpacked, "_locales", "de");
  fs.mkdirSync(localeDir, { recursive: true });
  fs.writeFileSync(
    path.join(unpacked, "manifest.json"),
    JSON.stringify({ name: "__MSG_appName__", default_locale: "de", version: "1.0.0" }),
  );
  fs.writeFileSync(
    path.join(localeDir, "messages.json"),
    JSON.stringify({ appName: { message: "Surfshark VPN Extension" } }),
  );
  try {
    assert.equal(mod.readManifestName(unpacked), "Surfshark VPN Extension");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
