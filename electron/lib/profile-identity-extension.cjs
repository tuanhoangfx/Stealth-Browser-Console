const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  extractProfileCode,
  buildPillChipText,
  buildCodeTileTooltip,
} = require("./profile-identity.cjs");
const { writeProfileCodeTileIconPngs } = require("./profile-icon-png.cjs");
const { pinToolbarExtension, unpackedExtensionId } = require("./profile-chrome-preferences.cjs");
const { profileIdentityUiEnabled } = require("./profile-identity-ui.cjs");

const EXT_ROOT = "identity-toolbar";
const DESIGN_VARIANT = "V2";

function toolbarExtensionDir(userDataRoot, profileId) {
  return path.join(userDataRoot, EXT_ROOT, String(profileId));
}

function identityBundleHash(parts) {
  return crypto.createHash("sha256").update(parts.join("\n"), "utf8").digest("hex").slice(0, 16);
}

/**
 * MV3 toolbar identity — Design V2 code-only tile + compact tooltip + click popup.
 * Auto-pinned via Chromium Preferences before launch.
 */
function ensureProfileToolbarExtension(userDataRoot, profile) {
  if (!profileIdentityUiEnabled()) {
    return { dir: "", extensionId: "", variant: DESIGN_VARIANT, chipText: "", tooltip: "", code: "" };
  }
  const code = extractProfileCode(profile.name, profile.id);
  const chipText = buildPillChipText(profile);
  const tooltip = buildCodeTileTooltip(profile);
  const name = String(profile.name || "Profile").trim() || "Profile";
  const group = String(profile.groupName || profile.group || "").trim();
  const proxy = String(profile.proxy || "").trim() || "Local IP";
  const dir = toolbarExtensionDir(userDataRoot, profile.id);
  const iconsDir = path.join(dir, "icons");
  fs.mkdirSync(iconsDir, { recursive: true });

  const manifest = {
    manifest_version: 3,
    name: tooltip,
    version: "1.1.0",
    description: "Profile identity code tile (Design V2)",
    action: {
      default_title: tooltip,
      default_popup: "popup.html",
      default_icon: {
        16: "icons/icon16.png",
        32: "icons/icon32.png",
        48: "icons/icon48.png",
      },
    },
    background: {
      service_worker: "background.js",
    },
  };

  const background = `const TOOLTIP = ${JSON.stringify(tooltip)};

function apply() {
  chrome.action.setBadgeText({ text: "" });
  chrome.action.setTitle({ title: TOOLTIP });
}

apply();
chrome.runtime.onInstalled.addListener(apply);
chrome.runtime.onStartup.addListener(apply);
`;

  const popup = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-width: 220px;
      max-width: 280px;
      padding: 12px 14px;
      font: 12px/1.45 "Segoe UI", system-ui, sans-serif;
      color: #e0e7ff;
      background: linear-gradient(160deg, #1e1b4b 0%, #312e81 100%);
    }
    .code {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.06em;
      font-variant-numeric: tabular-nums;
      color: #f8fafc;
      margin-bottom: 6px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      font-size: 11px;
      font-weight: 600;
      color: #c7d2fe;
      background: rgba(99, 102, 241, 0.25);
      border: 1px solid rgba(165, 180, 252, 0.35);
      border-radius: 999px;
      padding: 3px 8px;
      margin-bottom: 8px;
    }
    .name { font-size: 13px; font-weight: 600; color: #f8fafc; }
    .meta { margin-top: 8px; font-size: 11px; color: #a5b4fc; }
    .row { margin-top: 4px; }
    .k { opacity: 0.75; }
  </style>
</head>
<body>
  <div class="code">${code.replace(/</g, "&lt;")}</div>
  <div class="chip">${tooltip.replace(/</g, "&lt;")}</div>
  <div class="name">${name.replace(/</g, "&lt;")}</div>
  <div class="meta">
    ${group ? `<div class="row"><span class="k">Group</span> ${group.replace(/</g, "&lt;")}</div>` : ""}
    <div class="row"><span class="k">Proxy</span> ${proxy.replace(/</g, "&lt;")}</div>
    <div class="row"><span class="k">Status</span> Running</div>
  </div>
</body>
</html>`;

  const bundleHash = identityBundleHash([
    DESIGN_VARIANT,
    "icon-v3-code-tile",
    chipText,
    tooltip,
    name,
    group,
    proxy,
    JSON.stringify(manifest),
    background,
    popup,
  ]);
  const hashFile = path.join(dir, ".identity-bundle");
  const cached = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, "utf8").trim() : "";

  if (cached !== bundleHash) {
    writeProfileCodeTileIconPngs(iconsDir, code);
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    fs.writeFileSync(path.join(dir, "background.js"), background, "utf8");
    fs.writeFileSync(path.join(dir, "popup.html"), popup, "utf8");
    fs.writeFileSync(hashFile, bundleHash, "utf8");
  }

  const userDataDir = path.join(userDataRoot, "profiles", String(profile.id));
  const extensionId = pinToolbarExtension(userDataDir, dir);

  return { dir, extensionId, variant: DESIGN_VARIANT, chipText, tooltip, code };
}

module.exports = {
  ensureProfileToolbarExtension,
  toolbarExtensionDir,
  unpackedExtensionId,
  EXT_ROOT,
  DESIGN_VARIANT,
};
