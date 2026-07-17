const { COOKIE_BRIDGE_STORE_ID, SURFSHARK_STORE_ID } = require("./stealth-extension-store-ids.cjs");
const { cookieBridgeEnabled } = require("./cookie-bridge-store.cjs");

const DEFAULT_EXTENSION_TOGGLES = Object.freeze({
  e0001: true,
  surfshark: false,
  webStore: false,
});

function normalizeExtensionToggles(raw) {
  const base = { ...DEFAULT_EXTENSION_TOGGLES };
  if (!raw || typeof raw !== "object") return base;
  return {
    e0001: raw.e0001 !== false,
    surfshark: raw.surfshark === true,
    webStore: raw.webStore === true,
  };
}

function classifyStoreExtension(storeId) {
  const id = String(storeId || "").toLowerCase();
  if (id === COOKIE_BRIDGE_STORE_ID) return "e0001";
  if (id === SURFSHARK_STORE_ID) return "surfshark";
  return "webStore";
}

function isStoreExtensionAllowed(storeId, toggles) {
  const kind = classifyStoreExtension(storeId);
  if (kind === "e0001") return Boolean(toggles.e0001) && cookieBridgeEnabled();
  return Boolean(toggles[kind]);
}

function isLocalExtensionAllowed(toggles) {
  return Boolean(toggles.webStore);
}

function anyExtensionToggleEnabled(toggles) {
  const t = toggles || DEFAULT_EXTENSION_TOGGLES;
  if (t.e0001 && cookieBridgeEnabled()) return true;
  if (t.surfshark) return true;
  if (t.webStore) return true;
  return false;
}

function allExtensionTogglesEnabled(toggles) {
  const t = toggles || DEFAULT_EXTENSION_TOGGLES;
  return Boolean(t.e0001 && t.surfshark && t.webStore);
}

function resolveEffectiveExtensionToggles(globalToggles, profileOverrides) {
  const g = normalizeExtensionToggles(globalToggles || DEFAULT_EXTENSION_TOGGLES);
  const o = profileOverrides && typeof profileOverrides === "object" ? profileOverrides : {};
  return {
    e0001: o.e0001 !== undefined && o.e0001 !== null ? Boolean(o.e0001) : g.e0001,
    surfshark: o.surfshark !== undefined && o.surfshark !== null ? Boolean(o.surfshark) : g.surfshark,
    webStore: o.webStore !== undefined && o.webStore !== null ? Boolean(o.webStore) : g.webStore,
  };
}

function normalizeProfileExtensionOverrides(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  if (raw.e0001 !== undefined && raw.e0001 !== null) out.e0001 = Boolean(raw.e0001);
  if (raw.surfshark !== undefined && raw.surfshark !== null) out.surfshark = Boolean(raw.surfshark);
  if (raw.webStore !== undefined && raw.webStore !== null) out.webStore = Boolean(raw.webStore);
  return out;
}

module.exports = {
  SURFSHARK_STORE_ID,
  DEFAULT_EXTENSION_TOGGLES,
  normalizeExtensionToggles,
  normalizeProfileExtensionOverrides,
  classifyStoreExtension,
  isStoreExtensionAllowed,
  isLocalExtensionAllowed,
  anyExtensionToggleEnabled,
  allExtensionTogglesEnabled,
  resolveEffectiveExtensionToggles,
};
