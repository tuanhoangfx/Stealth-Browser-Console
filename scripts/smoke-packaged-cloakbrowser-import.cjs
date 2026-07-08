#!/usr/bin/env node
/** Smoke: unpacked cloakbrowser ESM graph resolves tar (packaged layout). */
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { resolveUnpackedCloakbrowserImport } = require("../electron/lib/cloakbrowser-packaged-resolve.cjs");

const root = path.resolve(__dirname, "..");
const resources = path.join(root, "dist-desktop", "win-unpacked", "resources");
const href = resolveUnpackedCloakbrowserImport(resources);

if (!href) {
  console.error("smoke-packaged-cloakbrowser-import: missing dist-desktop layout — run pack first");
  process.exit(1);
}

async function main() {
  const mod = await import(href);
  if (typeof mod.ensureBinary !== "function") {
    throw new Error("cloakbrowser entry missing ensureBinary");
  }
  const downloadPath = path.join(resources, "app.asar.unpacked", "node_modules", "cloakbrowser", "dist", "download.js");
  await import(pathToFileURL(downloadPath).href);
  console.log("smoke-packaged-cloakbrowser-import: OK (cloakbrowser + download/tar ESM resolve)");
}

main().catch((error) => {
  console.error("smoke-packaged-cloakbrowser-import: FAIL", error?.stack || error);
  process.exit(1);
});
