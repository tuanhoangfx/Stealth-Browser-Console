/** Runtime deps that must ship inside app.asar for pnpm + narrow build.files. */
module.exports.PACKAGED_UPDATER_RUNTIME_DEPS = [
  "electron-updater",
  "fs-extra",
  "builder-util-runtime",
  "js-yaml",
  "lazy-val",
  "semver",
  "tiny-typed-emitter",
  "lodash.escaperegexp",
  "lodash.isequal",
];

/**
 * Main-process transitive deps missing under pnpm + asar.
 * Seeds so stage-packaged-node-modules walks phoenix/tslib/tar/… into
 * electron/packaged-node_modules/node_modules (resolve hook finds them).
 */
module.exports.PACKAGED_MAIN_RUNTIME_DEPS = [
  "tslib",
  "@supabase/phoenix",
  "@supabase/supabase-js",
  // cloakbrowser engine download (profile launch extracts Chromium archive)
  "tar",
  "cloakbrowser",
  // proxy + geoip (cloakbrowser/dist/geoip.js dynamic import)
  "mmdb-lib",
];

module.exports.PACKAGED_RUNTIME_DEPS = [
  ...module.exports.PACKAGED_UPDATER_RUNTIME_DEPS,
  ...module.exports.PACKAGED_MAIN_RUNTIME_DEPS,
];
