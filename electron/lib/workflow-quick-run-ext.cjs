const fs = require("node:fs");
const path = require("node:path");
const { pinToolbarExtension, unpackedExtensionId } = require("./profile-chrome-preferences.cjs");

const EXT_ROOT = "workflow-quick-run";
const TEMPLATE_DIR = path.join(__dirname, "..", "extensions", "workflow-quick-run");

function writePlaceholderIcons(iconsDir) {
  fs.mkdirSync(iconsDir, { recursive: true });
  const { writeProfileCodeTileIconPngs } = require("./profile-icon-png.cjs");
  writeProfileCodeTileIconPngs(iconsDir, "WF", { force: true });
}

function copyTemplateFile(name, destDir) {
  const src = path.join(TEMPLATE_DIR, name);
  const dest = path.join(destDir, name);
  if (!fs.existsSync(src)) throw new Error(`Missing workflow-quick-run template: ${name}`);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
}

function bundleDir(userDataRoot, profileId) {
  return path.join(userDataRoot, EXT_ROOT, String(profileId));
}

/**
 * Per-profile unpacked MV3 bundle with embedded API config.
 * @returns {{ dir: string; extensionId: string }}
 */
function ensureWorkflowQuickRunExtension(userDataRoot, profile) {
  const profileId = String(profile.id);
  const dir = bundleDir(userDataRoot, profileId);
  fs.mkdirSync(dir, { recursive: true });

  for (const name of ["manifest.json", "background.js", "sidepanel.html", "sidepanel.css", "sidepanel.js"]) {
    copyTemplateFile(name, dir);
  }

  writePlaceholderIcons(path.join(dir, "icons"));

  const apiPort = Number(process.env.STEALTH_API_PORT) || 6003;
  const config = {
    profileId,
    profileName: String(profile.name || "").trim() || profileId,
    apiHost: "127.0.0.1",
    apiPort,
    apiToken: String(process.env.STEALTH_API_TOKEN || "").trim(),
  };
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2), "utf8");

  const extensionId = unpackedExtensionId(dir);
  return { dir, extensionId };
}

function pinWorkflowQuickRunExtension(userDataDir, extensionDir) {
  return pinToolbarExtension(userDataDir, extensionDir);
}

module.exports = {
  EXT_ROOT,
  TEMPLATE_DIR,
  bundleDir,
  ensureWorkflowQuickRunExtension,
  pinWorkflowQuickRunExtension,
};
