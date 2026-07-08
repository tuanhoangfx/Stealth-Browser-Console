"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { unpackedNodeModulesRoot } = require("./cloakbrowser-esm-deps.cjs");

function resolveUnpackedCloakbrowserDir(resourcesPath) {
  if (!resourcesPath) return null;
  const pkgJson = path.join(unpackedNodeModulesRoot(resourcesPath), "cloakbrowser", "package.json");
  if (!fs.existsSync(pkgJson)) return null;
  return path.dirname(pkgJson);
}

/** file:// entry for dynamic import — keeps ESM sub-imports on app.asar.unpacked/node_modules. */
function resolveUnpackedCloakbrowserImport(resourcesPath) {
  const root = resolveUnpackedCloakbrowserDir(resourcesPath);
  if (!root) return null;
  const entry = path.join(root, "dist", "index.js");
  if (!fs.existsSync(entry)) return null;
  return pathToFileURL(entry).href;
}

function resolveCloakbrowserImportSpecifier({ isPackaged, resourcesPath } = {}) {
  if (isPackaged) {
    const href = resolveUnpackedCloakbrowserImport(resourcesPath);
    if (href) return href;
  }
  return "cloakbrowser";
}

function resolveCloakbrowserPackageDir({ isPackaged, resourcesPath } = {}) {
  if (isPackaged) {
    const unpacked = resolveUnpackedCloakbrowserDir(resourcesPath);
    if (unpacked) return unpacked;
  }
  return path.dirname(require.resolve("cloakbrowser/package.json"));
}

/** True when module exists beside unpacked cloakbrowser (ESM import from cloakbrowser/*.js). */
function isPackagedUnpackedModuleAvailable(resourcesPath, moduleName) {
  if (!resourcesPath || !moduleName) return false;
  const pkgJson = path.join(unpackedNodeModulesRoot(resourcesPath), ...String(moduleName).split("/"), "package.json");
  return fs.existsSync(pkgJson);
}

function isMmdbLibAvailableForGeoip({ isPackaged, resourcesPath } = {}) {
  if (isPackaged) {
    return isPackagedUnpackedModuleAvailable(resourcesPath, "mmdb-lib");
  }
  try {
    require.resolve("mmdb-lib");
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  resolveUnpackedCloakbrowserDir,
  resolveUnpackedCloakbrowserImport,
  resolveCloakbrowserImportSpecifier,
  resolveCloakbrowserPackageDir,
  isPackagedUnpackedModuleAvailable,
  isMmdbLibAvailableForGeoip,
};
