/** electron-updater runtime deps — must be direct dependencies for pnpm + electron-builder asar. */
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
