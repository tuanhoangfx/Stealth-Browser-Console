const fs = require("node:fs");
const path = require("node:path");
const {
  COOKIE_BRIDGE_STORE_ID,
  cookieBridgeEnabled,
  resolveCachedExtensionDir,
  workspaceExtensionDir,
  unpackedDir,
} = require("./cookie-bridge-store.cjs");
const { unpackedExtensionId } = require("./profile-chrome-preferences.cjs");

function resolveExtensionSource(resolvedPath, userDataRoot) {
  if (!resolvedPath) return "missing";
  const workspace = workspaceExtensionDir();
  if (workspace && resolvedPath === workspace) return "workspace";
  const cache = unpackedDir(userDataRoot);
  if (resolvedPath === cache) return "store-cache";
  return "custom";
}

function getCookieBridgeStatus(userDataRoot) {
  const enabled = cookieBridgeEnabled();
  const resolvedPath = enabled ? resolveCachedExtensionDir(userDataRoot) : null;
  const manifestOk = Boolean(
    resolvedPath && fs.existsSync(path.join(resolvedPath, "manifest.json")),
  );
  const workspacePath = workspaceExtensionDir();
  const cachePath = unpackedDir(userDataRoot);
  let manifestName = "";
  if (manifestOk) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(resolvedPath, "manifest.json"), "utf8"));
      manifestName = String(manifest.name || "");
    } catch {
      manifestName = "";
    }
  }

  return {
    enabled,
    productCode: "E0001",
    name: "E0001 Cookie Bridge",
    storeId: COOKIE_BRIDGE_STORE_ID,
    resolvedPath: resolvedPath || null,
    unpackedId: resolvedPath ? unpackedExtensionId(resolvedPath) : null,
    source: resolveExtensionSource(resolvedPath, userDataRoot),
    manifestOk,
    manifestName: manifestName || "E0001 Cookie Bridge",
    workspacePath: workspacePath || null,
    cachePath,
    env: {
      STEALTH_COOKIE_BRIDGE: process.env.STEALTH_COOKIE_BRIDGE ?? "1",
      STEALTH_COOKIE_BRIDGE_LOCAL: process.env.STEALTH_COOKIE_BRIDGE_LOCAL ?? "0",
    },
  };
}

module.exports = { getCookieBridgeStatus };
