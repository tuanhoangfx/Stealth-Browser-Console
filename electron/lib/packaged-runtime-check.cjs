const fs = require("node:fs");
const path = require("node:path");

function resolveElectronApp() {
  try {
    const electron = require("electron");
    return electron && typeof electron === "object" ? electron.app || null : null;
  } catch {
    return null;
  }
}

const RELEASE_URL = "https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/latest";

/** Top-level packages required under resources/app.asar.unpacked/node_modules. */
const REQUIRED_UNPACKED_PACKAGES = [
  "better-sqlite3",
  "sql.js",
  "playwright-core",
  "cloakbrowser",
  "tar",
  "mmdb-lib",
];

/** Relative paths under resources/app.asar.unpacked required at runtime. */
const REQUIRED_UNPACKED = [
  "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  "node_modules/sql.js/dist/sql-wasm.wasm",
  "node_modules/playwright-core/index.js",
  "node_modules/cloakbrowser/package.json",
  "node_modules/tar/package.json",
  "node_modules/mmdb-lib/package.json",
];

function unpackedRoot(resourcesPath = process.resourcesPath) {
  return path.join(resourcesPath || "", "app.asar.unpacked");
}

function verifyPackagedRuntime(options = {}) {
  const hasIsPackagedOverride = typeof options.isPackaged === "boolean";
  const packaged = hasIsPackagedOverride
    ? options.isPackaged
    : Boolean(resolveElectronApp()?.isPackaged);
  if (!packaged) {
    return {
      ok: true,
      isPackaged: false,
      missing: [],
      root: "",
      cloakbrowserUnpacked: true,
    };
  }
  const resPath =
    typeof options.resourcesPath === "string" && options.resourcesPath
      ? options.resourcesPath
      : process.resourcesPath || "";
  const root = unpackedRoot(resPath);
  const missing = [];
  for (const rel of REQUIRED_UNPACKED) {
    if (!fs.existsSync(path.join(root, rel))) {
      missing.push(rel);
    }
  }
  return {
    ok: missing.length === 0,
    isPackaged: true,
    missing,
    root,
    cloakbrowserUnpacked: !missing.includes("node_modules/cloakbrowser/package.json"),
  };
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
  REQUIRED_UNPACKED_PACKAGES,
  REQUIRED_UNPACKED,
  verifyPackagedRuntime,
  formatPackagedRuntimeRepairMessage,
};
