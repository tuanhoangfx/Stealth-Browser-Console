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

/** Main-process transitive deps missing under pnpm + asar (supabase stack). */
module.exports.PACKAGED_MAIN_RUNTIME_DEPS = [
  "tslib",
];

module.exports.PACKAGED_RUNTIME_DEPS = [
  ...module.exports.PACKAGED_UPDATER_RUNTIME_DEPS,
  ...module.exports.PACKAGED_MAIN_RUNTIME_DEPS,
];
