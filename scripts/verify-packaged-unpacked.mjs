#!/usr/bin/env node
/**
 * Gate: packaged win-unpacked must include critical native modules + electron-updater runtime deps in app.asar.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PACKAGED_RUNTIME_DEPS } = require("../electron/lib/packaged-updater-deps.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDesktop = path.join(root, "dist-desktop");
const pendingUnpacked = path.join(distDesktop, "win-unpacked-pending");
const primaryUnpacked = path.join(distDesktop, "win-unpacked");
const unpackedRoot = fs.existsSync(path.join(pendingUnpacked, "resources", "app.asar"))
  ? pendingUnpacked
  : primaryUnpacked;
const resources = path.join(unpackedRoot, "resources");
const unpacked = path.join(resources, "app.asar.unpacked");
const asarPath = path.join(resources, "app.asar");

const UNPACKED_REQUIRED = [
  "node_modules/playwright-core/index.js",
  "node_modules/cloakbrowser/package.json",
  "node_modules/tar/package.json",
  "node_modules/mmdb-lib/package.json",
  // PowerShell -File cannot read app.asar — taskbar badge scripts must be on disk
  "electron/lib/stealth-taskbar-apply.ps1",
  "electron/lib/stealth-taskbar-apply-lib.ps1",
  "electron/lib/stealth-taskbar-apply-worker.ps1",
  "electron/lib/render-taskbar-badge.ps1",
];

const ASAR_REQUIRED = [
  "shared/stealth-extension-store-ids.json",
];

function listAsar() {
  if (!fs.existsSync(asarPath)) return [];
  const asar = require("@electron/asar");
  return asar.listPackage(asarPath);
}

function hasAsarModule(list, name) {
  const sepName = String(name).split("/").join(path.sep);
  const needles = [
    `\\node_modules\\${sepName}\\`,
    `node_modules${path.sep}${sepName}${path.sep}`,
    `node_modules/${name}/`,
    // Nested under packaged vendor root (NODE_PATH / parent.paths entry)
    `packaged-node_modules${path.sep}node_modules${path.sep}${sepName}${path.sep}`,
    `packaged-node_modules/node_modules/${name}/`,
    // Legacy flat layout (pre-0.10.70)
    `electron${path.sep}packaged-node_modules${path.sep}${sepName}${path.sep}`,
    `electron/packaged-node_modules/${name}/`,
  ];
  return list.some((entry) => needles.some((needle) => entry.includes(needle)));
}

const missingUnpacked = UNPACKED_REQUIRED.filter((rel) => !fs.existsSync(path.join(unpacked, rel)));
const asarList = listAsar();
const missingRuntime = PACKAGED_RUNTIME_DEPS.filter((name) => !hasAsarModule(asarList, name));
const missingAsar = ASAR_REQUIRED.filter(
  (rel) => !asarList.some((entry) => entry.replace(/\\/g, "/").includes(rel.replace(/\\/g, "/"))),
);

if (missingUnpacked.length === 0 && missingRuntime.length === 0 && missingAsar.length === 0) {
  console.log("verify-packaged-unpacked: OK (native unpack + packaged runtime deps in asar)");
  process.exit(0);
}

if (missingUnpacked.length) {
  console.error("verify-packaged-unpacked: FAIL — missing under app.asar.unpacked:");
  for (const rel of missingUnpacked) console.error(`  ${rel}`);
  console.error(`  root: ${unpacked}`);
}

if (missingRuntime.length) {
  console.error("verify-packaged-unpacked: FAIL — missing packaged runtime deps in app.asar:");
  for (const name of missingRuntime) console.error(`  node_modules/${name} (or electron/packaged-node_modules/${name})`);
  console.error("  Fix: list deps in electron/lib/packaged-updater-deps.cjs + package.json dependencies");
  console.error(`  asar: ${asarPath}`);
}

if (missingAsar.length) {
  console.error("verify-packaged-unpacked: FAIL — missing files in app.asar:");
  for (const rel of missingAsar) console.error(`  ${rel}`);
  console.error("  Fix: add to package.json build.files (e.g. shared/**)");
  console.error(`  asar: ${asarPath}`);
}

process.exit(1);
