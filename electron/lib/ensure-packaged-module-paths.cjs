"use strict";

/**
 * Prepend packaged-node_modules to Module.globalPaths BEFORE any main-process
 * require that needs pnpm-isolated transitive deps (tslib, fs-extra, …).
 * Must stay CommonJS and side-effect on load — required first from main.cjs.
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const vendor = path.join(__dirname, "packaged-node_modules");
if (fs.existsSync(vendor) && !Module.globalPaths.includes(vendor)) {
  Module.globalPaths.unshift(vendor);
}

module.exports.packagedNodeModulesPath = vendor;
