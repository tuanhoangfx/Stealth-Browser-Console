"use strict";

/**
 * Prepend packaged-node_modules so main-process requires resolve pnpm-isolated
 * transitive deps (tslib, fs-extra, …) inside app.asar.
 * Must stay CommonJS and side-effect on load — required first from main.cjs.
 *
 * Prefer NODE_PATH + Module._initPaths(): Module.globalPaths alone is unreliable
 * for asar-hosted npm trees (supabase-js → tslib).
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const vendor = path.join(__dirname, "packaged-node_modules");
if (fs.existsSync(vendor)) {
  const delim = path.delimiter;
  const current = String(process.env.NODE_PATH || "")
    .split(delim)
    .filter(Boolean);
  if (!current.includes(vendor)) {
    process.env.NODE_PATH = [vendor, ...current].join(delim);
    if (typeof Module._initPaths === "function") {
      Module._initPaths();
    }
  }
  if (!Module.globalPaths.includes(vendor)) {
    Module.globalPaths.unshift(vendor);
  }
}

module.exports.packagedNodeModulesPath = vendor;
