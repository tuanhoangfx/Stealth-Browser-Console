const fs = require("node:fs");
const path = require("node:path");
const { nativeExtensionsEnabled, extensionLaunchMode } = require("./extension-launch-mode.cjs");
const {
  listAllLaunchExtensions,
  installStoreExtension,
  installUnpackedExtension,
  parseStoreId,
  readManifestName,
  readManifestVersion,
  readManifestCreatedAt,
  readManifestUpdatedAt,
  removeCachedExtensions,
  resolveExtensionIconDataUri,
} = require("./webstore-extension.cjs");
const {
  resolveOperatorExtensionDir,
  getOperatorExtensionStatus,
  stageOperatorExtension,
  stageCookieBridgeExtension,
} = require("./native-extension-load.cjs");
const { workspaceExtensionDir, syncExtensionDirToCache } = require("./cookie-bridge-store.cjs");
const { defaultUserDataRoot } = require("./webstore-extension.cjs");

const STATUS_CACHE_TTL_MS = 30_000;
let _statusCache = null;

function invalidateExtensionsStatusCache() {
  _statusCache = null;
}

function resolveRootDir(userDataRoot) {
  const raw = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot;
  return (typeof raw === "string" && raw.trim()) ? raw.trim() : defaultUserDataRoot();
}

function readReloadSignal(userDataRoot) {
  if (Number(globalThis.__STEALTH_EXTENSION_RELOAD_NONCE__ || 0) > 0) {
    return {
      reloadNonce: Number(globalThis.__STEALTH_EXTENSION_RELOAD_NONCE__),
      reloadTriggeredAt: globalThis.__STEALTH_EXTENSION_RELOAD_AT__ || null,
    };
  }
  const root = resolveRootDir(userDataRoot);
  const file = path.join(root, "extension-reload-signal.json");
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const nonce = Number(parsed?.reloadNonce || 0);
      const at = parsed?.reloadTriggeredAt || null;
      if (nonce > 0) {
        globalThis.__STEALTH_EXTENSION_RELOAD_NONCE__ = nonce;
        globalThis.__STEALTH_EXTENSION_RELOAD_AT__ = at;
      }
      return { reloadNonce: nonce, reloadTriggeredAt: at };
    }
  } catch {
    /* ignore */
  }
  return { reloadNonce: 0, reloadTriggeredAt: null };
}

function triggerOpenProfilesExtensionReload(userDataRoot) {
  const root = resolveRootDir(userDataRoot);
  const reloadNonce = Date.now();
  const reloadTriggeredAt = new Date(reloadNonce).toISOString();
  globalThis.__STEALTH_EXTENSION_RELOAD_NONCE__ = reloadNonce;
  globalThis.__STEALTH_EXTENSION_RELOAD_AT__ = reloadTriggeredAt;
  try {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, "extension-reload-signal.json"),
      JSON.stringify({ reloadNonce, reloadTriggeredAt }, null, 2),
      "utf8",
    );
  } catch {
    /* best-effort */
  }

  let e0001Synced = false;
  try {
    const wsE0001 = workspaceExtensionDir();
    if (wsE0001) {
      syncExtensionDirToCache(wsE0001, root);
      const altRoot = path.resolve("D:/StealthBrowser");
      if (fs.existsSync(altRoot) && path.resolve(root).toLowerCase() !== altRoot.toLowerCase()) {
        syncExtensionDirToCache(wsE0001, altRoot);
      }
      stageCookieBridgeExtension(root, null);
      e0001Synced = true;
    }
  } catch {
    /* best-effort */
  }

  let stagedOperator = null;
  try {
    stagedOperator = stageOperatorExtension(null);
  } catch {
    /* best-effort */
  }

  return {
    ok: true,
    reloadNonce,
    reloadTriggeredAt,
    e0001Synced,
    e0002Staged: Boolean(stagedOperator?.extId),
    status: getExtensionsStatus(root, { forceRefresh: true }),
  };
}

function buildExtensionActivityLog(ext, { cookieBridge, operatorExtension, reloadNonce }) {
  const isE0001 =
    ext.storeId === "kaaadageakdandpobcofplmfbjfjabdk" || /cookie bridge|e0001/i.test(String(ext.name || ""));
  const isE0002 =
    ext.localKey === "e0002-browser-operator" || /browser operator|e0002/i.test(String(ext.name || ""));
  const reloadSuffix = reloadNonce ? ` · Reload #${String(reloadNonce).slice(-6)}` : "";
  if (isE0001) {
    const ver = ext.version || cookieBridge?.stageVersion || cookieBridge?.manifestVersion || "latest";
    const staged = Boolean(cookieBridge?.manifestOk ?? true);
    return {
      staged,
      autoPinned: true,
      activityLog: `🟢 Staged v${ver} · Auto-Pinned${reloadSuffix}`,
    };
  }
  if (isE0002) {
    const ver = ext.version || operatorExtension?.stageVersion || operatorExtension?.manifestVersion || "latest";
    const staged = Boolean(operatorExtension?.manifestOk ?? true);
    return {
      staged,
      autoPinned: true,
      activityLog: `🟢 Staged v${ver} · Auto-Pinned${reloadSuffix}`,
    };
  }
  const ver = ext.version || "latest";
  return {
    staged: true,
    autoPinned: false,
    activityLog: `📦 Cached v${ver} · Web Store Ready`,
  };
}

function getExtensionsStatus(userDataRoot, options = {}) {
  const root = resolveRootDir(userDataRoot);
  const signal = readReloadSignal(root);
  const now = Date.now();
  if (
    !options.forceRefresh &&
    _statusCache &&
    _statusCache.root === root &&
    now - _statusCache.at < STATUS_CACHE_TTL_MS
  ) {
    const cachedWithSignal = (_statusCache.payload.cached || []).map((ext) => ({
      ...ext,
      ...buildExtensionActivityLog(ext, {
        cookieBridge: _statusCache.payload.cookieBridge,
        operatorExtension: _statusCache.payload.operatorExtension,
        reloadNonce: signal.reloadNonce,
      }),
    }));
    return {
      ..._statusCache.payload,
      cached: cachedWithSignal,
      reloadNonce: signal.reloadNonce,
      reloadTriggeredAt: signal.reloadTriggeredAt,
    };
  }

  let cookieBridge = null;
  try {
    const { getCookieBridgeStatus } = require("./cookie-bridge-status.cjs");
    cookieBridge = getCookieBridgeStatus(root);
  } catch {
    /* ignore */
  }
  let operatorExtension = null;
  try {
    operatorExtension = getOperatorExtensionStatus();
  } catch {
    /* ignore */
  }
  const rawCached = listAllLaunchExtensions(root).map((ext) => ({
    ...ext,
    iconDataUri: resolveExtensionIconDataUri(ext.unpackedPath, 48) ?? undefined,
  }));
  const operatorDir = resolveOperatorExtensionDir();
  if (operatorDir && !rawCached.some((ext) => path.resolve(ext.unpackedPath) === path.resolve(operatorDir))) {
    rawCached.push({
      kind: "local",
      storeId: null,
      localKey: "e0002-browser-operator",
      unpackedPath: operatorDir,
      name: readManifestName(operatorDir),
      version: readManifestVersion(operatorDir),
      createdAt: readManifestCreatedAt(operatorDir),
      updatedAt: readManifestUpdatedAt(operatorDir),
      iconDataUri: resolveExtensionIconDataUri(operatorDir, 48) ?? undefined,
    });
  }
  const cached = rawCached.map((ext) => ({
    ...ext,
    ...buildExtensionActivityLog(ext, {
      cookieBridge,
      operatorExtension,
      reloadNonce: signal.reloadNonce,
    }),
  }));
  const payload = {
    launchMode: extensionLaunchMode(),
    nativeMode: nativeExtensionsEnabled(),
    cached,
    cookieBridge,
    operatorExtension,
    reloadNonce: signal.reloadNonce,
    reloadTriggeredAt: signal.reloadTriggeredAt,
    webStoreInstallHint: "Paste any Chrome Web Store ID or URL.",
  };
  _statusCache = { root, at: now, payload };
  return payload;
}

module.exports = {
  getExtensionsStatus,
  invalidateExtensionsStatusCache,
  triggerOpenProfilesExtensionReload,
  installStoreExtension,
  installUnpackedExtension,
  removeCachedExtensions,
  parseStoreId,
};
