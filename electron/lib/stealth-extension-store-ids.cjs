/**
 * Chrome Web Store extension IDs — SSOT for electron + Vite frontend.
 * @see shared/stealth-extension-store-ids.json
 */
const fs = require("node:fs");
const path = require("node:path");

/** Fallback when packaged asar omits shared/ (dev-only safety; gate catches missing file). */
const FALLBACK_IDS = Object.freeze({
  COOKIE_BRIDGE_STORE_ID: "kaaadageakdandpobcofplmfbjfjabdk",
  SURFSHARK_STORE_ID: "ailoabdmgclmfmhdagmlohpjlbpffblp",
});

function loadStoreIds() {
  const jsonPath = path.join(__dirname, "../../shared/stealth-extension-store-ids.json");
  try {
    return require(jsonPath);
  } catch (error) {
    if (fs.existsSync(jsonPath)) throw error;
    console.warn(
      "[stealth-extension-store-ids] shared JSON missing in package — using embedded fallback",
    );
    return FALLBACK_IDS;
  }
}

const ids = loadStoreIds();

module.exports = {
  COOKIE_BRIDGE_STORE_ID: ids.COOKIE_BRIDGE_STORE_ID,
  SURFSHARK_STORE_ID: ids.SURFSHARK_STORE_ID,
};
