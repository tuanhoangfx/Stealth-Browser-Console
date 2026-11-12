const fs = require("node:fs");
const path = require("node:path");
const {
  COOKIE_BRIDGE_STORE_ID,
  cookieBridgeEnabled,
  isVerifiedStoreExtension,
  resolveCachedExtensionDir,
  useLocalDevExtension,
  workspaceExtensionDir,
  unpackedDir,
} = require("./cookie-bridge-store.cjs");
const { operatorStableRoot } = require("./operator-extension-stage.cjs");
const { unpackedExtensionId } = require("./profile-chrome-preferences.cjs");

function readDirManifestVersion(dir) {
  if (!dir) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    return String(manifest.version || "").trim() || null;
  } catch {
    return null;
  }
}

function resolveExtensionSource(resolvedPath, userDataRoot) {
  if (!resolvedPath) return "missing";
  const workspace = workspaceExtensionDir();
  if (workspace && resolvedPath === workspace) return "workspace";
  const cache = unpackedDir(userDataRoot);
  if (resolvedPath === cache) {
    if (useLocalDevExtension()) return "workspace";
    return "store-cache";
  }
  return "custom";
}

function getCookieBridgeStatus(userDataRoot) {
  const cookieBridgeEnvOn = cookieBridgeEnabled();
  const { getExtensionToggles } = require("./app-settings.cjs");
  const toggles = getExtensionToggles();
  const e0001On = cookieBridgeEnvOn && toggles.e0001;
  const resolvedPath = e0001On ? resolveCachedExtensionDir(userDataRoot) : null;
  const manifestOk = Boolean(
    resolvedPath && fs.existsSync(path.join(resolvedPath, "manifest.json")),
  );
  const workspacePath = workspaceExtensionDir();
  const cachePath = unpackedDir(userDataRoot);
  const stageDir = path.join(operatorStableRoot(), COOKIE_BRIDGE_STORE_ID);
  let manifestName = "";
  let manifestVersion = "";
  if (manifestOk) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(resolvedPath, "manifest.json"), "utf8"));
      manifestName = String(manifest.name || "");
      manifestVersion = String(manifest.version || "").trim();
    } catch {
      manifestName = "";
      manifestVersion = "";
    }
  }

  const enabled = e0001On;
  const sourceMode = useLocalDevExtension() ? "workspace" : "store";
  const stageVersion = readDirManifestVersion(stageDir);
  const workspaceVersion = readDirManifestVersion(workspacePath);
  let swHealth = null;
  try {
    const { defaultUserDataRoot } = require("./webstore-extension.cjs");
    const { inspectMv3ServiceWorkerFleetHealth } = require("./extension-sw-health.cjs");
    const rootDir =
      typeof userDataRoot === "function"
        ? userDataRoot()
        : userDataRoot || defaultUserDataRoot();
    swHealth =
      inspectMv3ServiceWorkerFleetHealth(rootDir, {
        expectedE0001Version: stageVersion || manifestVersion || workspaceVersion || null,
      })?.e0001 ?? null;
  } catch {
    /* best-effort */
  }

  return {
    enabled,
    profilesExtensionsEnabled: toggles.e0001 || toggles.e0002 !== false || toggles.surfshark || toggles.webStore,
    extensionToggles: toggles,
    productCode: "E0001",
    name: "E0001 Cookie Bridge",
    storeId: COOKIE_BRIDGE_STORE_ID,
    resolvedPath: resolvedPath || null,
    unpackedId: resolvedPath ? unpackedExtensionId(resolvedPath) : null,
    source: resolveExtensionSource(resolvedPath, userDataRoot),
    sourceMode,
    verifiedStore: Boolean(resolvedPath && isVerifiedStoreExtension(resolvedPath)),
    manifestOk,
    manifestName: manifestName || "E0001 Cookie Bridge",
    manifestVersion: manifestVersion || null,
    workspaceVersion,
    stageVersion,
    swHealth,
    workspacePath: workspacePath || null,
    cachePath,
    env: {
      STEALTH_COOKIE_BRIDGE: process.env.STEALTH_COOKIE_BRIDGE ?? "1",
      STEALTH_COOKIE_BRIDGE_LOCAL: process.env.STEALTH_COOKIE_BRIDGE_LOCAL ?? "0",
    },
  };
}

module.exports = { getCookieBridgeStatus };
