const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const RELEASE_URL = "https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/latest";

/** Relative paths under resources/app.asar.unpacked required at runtime. */
const REQUIRED_UNPACKED = [
  "node_modules/playwright-core/index.js",
  "node_modules/cloakbrowser/package.json",
];

function unpackedRoot() {
  return path.join(process.resourcesPath, "app.asar.unpacked");
}

function verifyPackagedRuntime() {
  if (!app.isPackaged) {
    return { ok: true, missing: [], root: "" };
  }
  const root = unpackedRoot();
  const missing = [];
  for (const rel of REQUIRED_UNPACKED) {
    if (!fs.existsSync(path.join(root, rel))) {
      missing.push(rel);
    }
  }
  return { ok: missing.length === 0, missing, root };
}

function formatPackagedRuntimeRepairMessage(result = verifyPackagedRuntime()) {
  if (result.ok) return "";
  const lines = [
    "Auto-update did not install all required files (common after a large version jump).",
    "Please download and run the latest Setup installer once — later updates will stay stable.",
    "",
    `Missing: ${result.missing.join(", ")}`,
    RELEASE_URL,
  ];
  return lines.join("\n");
}

module.exports = {
  RELEASE_URL,
  verifyPackagedRuntime,
  formatPackagedRuntimeRepairMessage,
};
