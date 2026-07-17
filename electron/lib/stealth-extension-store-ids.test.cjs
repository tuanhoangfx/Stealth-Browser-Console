const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ids = require(path.join(__dirname, "../../shared/stealth-extension-store-ids.json"));
const mod = require("./stealth-extension-store-ids.cjs");

test("stealth-extension-store-ids matches JSON SSOT", () => {
  assert.equal(mod.COOKIE_BRIDGE_STORE_ID, ids.COOKIE_BRIDGE_STORE_ID);
  assert.equal(mod.SURFSHARK_STORE_ID, ids.SURFSHARK_STORE_ID);
  assert.match(mod.COOKIE_BRIDGE_STORE_ID, /^[a-z]{32}$/);
  assert.match(mod.SURFSHARK_STORE_ID, /^[a-z]{32}$/);
});

test("frontend and electron do not duplicate raw store id literals", () => {
  const useIcons = fs.readFileSync(
    path.join(__dirname, "../../src/features/profiles/useExtensionIcons.ts"),
    "utf8",
  );
  const toggles = fs.readFileSync(path.join(__dirname, "./extension-toggles.cjs"), "utf8");
  assert.ok(!useIcons.includes('"kaaadageakdandpobcofplmfbjfjabdk"'));
  assert.ok(!toggles.includes('"ailoabdmgclmfmhdagmlohpjlbpffblp"'));
  assert.ok(useIcons.includes("stealth-extension-store-ids"));
  assert.ok(toggles.includes("stealth-extension-store-ids"));
});
