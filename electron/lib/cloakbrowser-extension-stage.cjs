const fs = require("node:fs");
const path = require("node:path");
const { unpackedExtensionId } = require("./profile-chrome-preferences.cjs");
const { COOKIE_BRIDGE_STORE_ID, workspaceExtensionDir } = require("./cookie-bridge-store.cjs");

function shouldCopyExtensionEntry(relativePath) {
  const rel = String(relativePath || "").replace(/\\/g, "/").toLowerCase();
  if (!rel || rel === ".") return true;
  if (rel === ".git" || rel.startsWith(".git/")) return false;
  if (rel === "node_modules" || rel.startsWith("node_modules/")) return false;
  return true;
}

/**
 * CloakBrowser resolves store extensions under `<cacheDir>/<storeId>/` when prefs use Web Store id.
 * Unpacked/dev paths keep the hash id from absolute path.
 */
function resolveStageExtensionId(extensionDir) {
  const abs = path.resolve(String(extensionDir || "")).replace(/\\/g, "/");
  const storeMatch = abs.match(/\/extensions-cache\/([a-p]{32})\/unpacked\/?$/i);
  if (storeMatch) return storeMatch[1].toLowerCase();

  const workspace = workspaceExtensionDir();
  if (workspace && path.resolve(workspace).replace(/\\/g, "/") === abs) {
    return COOKIE_BRIDGE_STORE_ID;
  }

  return unpackedExtensionId(extensionDir);
}

/**
 * CloakBrowser Chromium resolves unpacked extensions under `<cacheDir>/<extId>/`.
 * Pre-stage files there so Chrome never shows "manifest missing" for the staging folder.
 */
function ensureCloakbrowserExtensionStage(extensionDir, cloakCacheDir) {
  const src = path.resolve(String(extensionDir || ""));
  const manifest = path.join(src, "manifest.json");
  if (!fs.existsSync(manifest)) return null;

  const cacheRoot = path.resolve(String(cloakCacheDir || ""));
  if (!cacheRoot) return null;

  const extId = resolveStageExtensionId(src);
  const stageDir = path.join(cacheRoot, extId);
  const stageManifest = path.join(stageDir, "manifest.json");

  let needsCopy = !fs.existsSync(stageManifest);
  if (!needsCopy) {
    try {
      needsCopy = fs.statSync(manifest).mtimeMs > fs.statSync(stageManifest).mtimeMs;
    } catch {
      needsCopy = true;
    }
  }
  const srcVerified = fs.existsSync(path.join(src, "_metadata", "verified_contents.json"));
  const stageVerified = fs.existsSync(path.join(stageDir, "_metadata", "verified_contents.json"));
  if (srcVerified && !stageVerified) needsCopy = true;

  if (needsCopy) {
    fs.mkdirSync(stageDir, { recursive: true });
    fs.cpSync(src, stageDir, {
      recursive: true,
      force: true,
      filter: (entry) => shouldCopyExtensionEntry(path.relative(src, entry)),
    });
  }

  if (!fs.existsSync(stageManifest)) return null;
  return { extId, stageDir, sourceDir: src };
}

function ensureCloakbrowserExtensionStages(extensionDirs, cloakCacheDir) {
  const staged = [];
  for (const dir of extensionDirs || []) {
    const result = ensureCloakbrowserExtensionStage(dir, cloakCacheDir);
    if (result) staged.push(result);
  }
  return staged;
}

/** Pre-stage every launch extension into CloakBrowser cache (startup warm). */
async function warmExtensionStagesForRoot(userDataRoot, cloakCacheDir) {
  const { resolveNativeExtensionDirs } = require("./native-extension-load.cjs");
  const dirs = resolveNativeExtensionDirs(userDataRoot);
  return ensureCloakbrowserExtensionStages(dirs, cloakCacheDir);
}

module.exports = {
  resolveStageExtensionId,
  ensureCloakbrowserExtensionStage,
  ensureCloakbrowserExtensionStages,
  warmExtensionStagesForRoot,
  shouldCopyExtensionEntry,
};
