"use strict";

/** ESM deps cloakbrowser/dist/download.js imports — must sit beside cloakbrowser at runtime. */
const CLOAK_ESM_DEPS = ["tar", "minipass", "minizlib", "yallist", "chownr", "@isaacs/fs-minipass"];

function unpackedNodeModulesRoot(resourcesPath) {
  return require("node:path").join(resourcesPath, "app.asar.unpacked", "node_modules");
}

module.exports = {
  CLOAK_ESM_DEPS,
  unpackedNodeModulesRoot,
};
