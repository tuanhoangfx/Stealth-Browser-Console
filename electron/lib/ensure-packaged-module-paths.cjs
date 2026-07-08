"use strict";

/**
 * Make pnpm-isolated transitive deps resolvable from app.asar (tslib, fs-extra, …).
 *
 * Staging: electron/packaged-node_modules/node_modules/<pkg>
 * On MODULE_NOT_FOUND for a bare specifier, re-resolve with:
 *   originalResolveFilename(request, null, false, { paths: [vendor] })
 * (Node looks for <paths[i]>/node_modules/<name>. Do NOT call require.resolve
 * from inside the hook — that re-enters the patch and can mask success.)
 *
 * Must stay CommonJS and side-effect on load — required first from main.cjs.
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const vendor = path.join(__dirname, "..", "packaged-node_modules");
const vendorModules = path.join(vendor, "node_modules");

if (fs.existsSync(vendorModules)) {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
    try {
      return originalResolveFilename.call(this, request, parent, isMain, options);
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
      if (
        typeof request !== "string" ||
        request.startsWith(".") ||
        request.startsWith("/") ||
        path.isAbsolute(request)
      ) {
        throw error;
      }
      // Already in a vendor-paths attempt — do not recurse.
      if (options && Array.isArray(options.paths) && options.paths.includes(vendor)) {
        throw error;
      }
      try {
        return originalResolveFilename.call(this, request, null, false, { paths: [vendor] });
      } catch {
        throw error;
      }
    }
  };
}

module.exports.packagedNodeModulesPath = vendor;
