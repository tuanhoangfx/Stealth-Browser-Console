const fs = require("node:fs");
const path = require("node:path");
const { unpackedExtensionId } = require("./profile-chrome-preferences.cjs");

function shouldCopyExtensionEntry(relativePath) {
  const rel = String(relativePath || "").replace(/\\/g, "/").toLowerCase();
  if (!rel || rel === ".") return true;
  if (rel === ".git" || rel.startsWith(".git/")) return false;
  if (rel === "node_modules" || rel.startsWith("node_modules/")) return false;
  return true;
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

  const extId = unpackedExtensionId(src);
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

module.exports = {
  ensureCloakbrowserExtensionStage,
  ensureCloakbrowserExtensionStages,
  shouldCopyExtensionEntry,
};
