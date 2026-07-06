const fs = require("node:fs");
const path = require("node:path");

/** Electron shell icon — build/icons/app.ico (taskbar for Stealth Browser Console window). */
function resolveAppIconPath(rootDir) {
  return path.join(rootDir, "build", "icons", "app.ico");
}

function resolveAppIconPathIfExists(rootDir) {
  const iconPath = resolveAppIconPath(rootDir);
  return fs.existsSync(iconPath) ? iconPath : null;
}

function assertAppIconReady(rootDir) {
  const iconPath = resolveAppIconPathIfExists(rootDir);
  if (!iconPath) {
    throw new Error(`Missing desktop app icon: ${resolveAppIconPath(rootDir)} — run sync-app-icon`);
  }
  const stat = fs.statSync(iconPath);
  if (!stat.isFile() || stat.size < 1024) {
    throw new Error(`Invalid desktop app icon: ${iconPath} (${stat.size} bytes)`);
  }
  return iconPath;
}

module.exports = {
  resolveAppIconPath,
  resolveAppIconPathIfExists,
  assertAppIconReady,
};
