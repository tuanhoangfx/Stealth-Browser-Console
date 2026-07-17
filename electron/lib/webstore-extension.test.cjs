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
