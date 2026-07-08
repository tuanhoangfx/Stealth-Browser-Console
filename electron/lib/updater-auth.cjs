const fs = require("node:fs");
const path = require("node:path");

function readTrimmedFile(file) {
  try {
    if (!fs.existsSync(file)) return "";
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

/** Resolve GitHub token for private-release electron-updater feeds (optional). */
function resolveUpdaterGhToken(app) {
  const fromEnv = String(process.env.STEALTH_UPDATER_GH_TOKEN || "").trim();
  if (fromEnv) return fromEnv;

  if (app?.isPackaged) {
    const bundled = readTrimmedFile(path.join(process.resourcesPath, "updater-gh-token"));
    if (bundled) return bundled;
  }

  if (app) {
    const userOverride = readTrimmedFile(path.join(app.getPath("userData"), "updater-gh-token"));
    if (userOverride) return userOverride;
  }

  return "";
}

module.exports = { resolveUpdaterGhToken };
