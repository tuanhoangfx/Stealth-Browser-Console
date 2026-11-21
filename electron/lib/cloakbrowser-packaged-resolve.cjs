"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { unpackedNodeModulesRoot } = require("./cloakbrowser-esm-deps.cjs");

function isHotPatchOrPackagedDir(dir = __dirname) {
  const norm = String(dir || "").replace(/\\/g, "/").toLowerCase();
  return norm.includes("/hot-patch/") || norm.includes("/app.asar") || norm.includes("app.asar.unpacked");
}

function inferResourcesPathFromDir(dir = __dirname) {
  const norm = String(dir || "").replace(/\\/g, "/");
  const hpIdx = norm.toLowerCase().lastIndexOf("/hot-patch/");
  if (hpIdx > 0) {
    return path.resolve(norm.slice(0, hpIdx));
  }
  return "";
}

function candidateUnpackedNodeModulesRoots(resourcesPath) {
  const roots = [];
  const effectiveResources = resourcesPath || inferResourcesPathFromDir(__dirname);
  if (effectiveResources) {
    roots.push(unpackedNodeModulesRoot(effectiveResources));
    roots.push(path.join(effectiveResources, "hot-patch", "electron", "packaged-node_modules", "node_modules"));
  }
  roots.push(path.join(__dirname, "..", "packaged-node_modules", "node_modules"));
  roots.push(path.join(__dirname, "..", "..", "node_modules"));
  return [...new Set(roots)];
}

function resolveUnpackedCloakbrowserDir(resourcesPath) {
  for (const root of candidateUnpackedNodeModulesRoots(resourcesPath)) {
    const pkgJson = path.join(root, "cloakbrowser", "package.json");
    if (fs.existsSync(pkgJson)) {
      return path.dirname(pkgJson);
    }
  }
  return null;
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
  if (isPackaged || isHotPatchOrPackagedDir(__dirname)) {
    const href = resolveUnpackedCloakbrowserImport(resourcesPath);
    if (href) return href;
  }
  try {
    require.resolve("cloakbrowser");
    return "cloakbrowser";
  } catch {
    const fallbackHref = resolveUnpackedCloakbrowserImport(resourcesPath);
    if (fallbackHref) return fallbackHref;
  }
  return "cloakbrowser";
}

function resolveCloakbrowserPackageDir({ isPackaged, resourcesPath } = {}) {
  if (isPackaged || isHotPatchOrPackagedDir(__dirname)) {
    const unpacked = resolveUnpackedCloakbrowserDir(resourcesPath);
    if (unpacked) return unpacked;
  }
  try {
    return path.resolve(path.dirname(require.resolve("cloakbrowser")), "..");
  } catch {
    const unpacked = resolveUnpackedCloakbrowserDir(resourcesPath);
    if (unpacked) return unpacked;
  }
  return path.resolve(path.dirname(require.resolve("cloakbrowser")), "..");
}

/** True when module exists beside unpacked cloakbrowser (ESM import from cloakbrowser/*.js). */
function isPackagedUnpackedModuleAvailable(resourcesPath, moduleName) {
  if (!moduleName) return false;
  const parts = String(moduleName).split("/");
  for (const root of candidateUnpackedNodeModulesRoots(resourcesPath)) {
    const pkgJson = path.join(root, ...parts, "package.json");
    if (fs.existsSync(pkgJson)) return true;
  }
  return false;
}

function isMmdbLibAvailableForGeoip({ isPackaged, resourcesPath } = {}) {
  if (isPackaged || isHotPatchOrPackagedDir(__dirname)) {
    return isPackagedUnpackedModuleAvailable(resourcesPath, "mmdb-lib");
  }
  try {
    require.resolve("mmdb-lib");
    return true;
  } catch {
    return isPackagedUnpackedModuleAvailable(resourcesPath, "mmdb-lib");
  }
}

module.exports = {
  isHotPatchOrPackagedDir,
  inferResourcesPathFromDir,
  resolveUnpackedCloakbrowserDir,
  resolveUnpackedCloakbrowserImport,
  resolveCloakbrowserImportSpecifier,
  resolveCloakbrowserPackageDir,
  isPackagedUnpackedModuleAvailable,
  isMmdbLibAvailableForGeoip,
};
