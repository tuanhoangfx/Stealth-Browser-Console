const fs = require("node:fs");
const path = require("node:path");

/**
 * Electron shell icon candidates (Windows title bar + taskbar for the Console window).
 * Packaged builds must ship at least one of these — `build/icons` was historically omitted
 * from electron-builder `files`, so BrowserWindow fell back to a blank/generic glyph while
 * Fast `--prepackaged` reused a win-unpacked exe still stamped with the default Electron atom.
 */
function listAppIconCandidates(rootDir) {
  const out = [];
  if (rootDir) {
    out.push(path.join(rootDir, "build", "icons", "app.ico"));
    out.push(path.join(rootDir, "build", "icons", "app.png"));
  }
  const resourcesPath = typeof process !== "undefined" ? process.resourcesPath : "";
  if (resourcesPath) {
    out.push(path.join(resourcesPath, "app.ico"));
    out.push(path.join(resourcesPath, "build", "icons", "app.ico"));
  }
  return out;
}

/** Preferred path for packaging / sync gates — build/icons/app.ico under tool root. */
function resolveAppIconPath(rootDir) {
  return path.join(rootDir, "build", "icons", "app.ico");
}

function resolveAppIconPathIfExists(rootDir) {
  for (const iconPath of listAppIconCandidates(rootDir)) {
    try {
      if (fs.existsSync(iconPath) && fs.statSync(iconPath).isFile() && fs.statSync(iconPath).size >= 1024) {
        return iconPath;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function assertAppIconReady(rootDir) {
  const iconPath = resolveAppIconPathIfExists(rootDir);
  if (!iconPath) {
    throw new Error(`Missing desktop app icon: ${resolveAppIconPath(rootDir)} — run sync-app-icon`);
  }
  return iconPath;
}

module.exports = {
  listAppIconCandidates,
  resolveAppIconPath,
  resolveAppIconPathIfExists,
  assertAppIconReady,
};
