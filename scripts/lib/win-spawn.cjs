/** Minimal spawn helpers — CJS mirror of win-spawn.mjs */
const fs = require("node:fs");
const path = require("node:path");

function resolveNodeExe() {
  if (process.platform !== "win32") return process.execPath;
  const sys = path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe");
  if (fs.existsSync(sys)) return sys;
  return process.execPath;
}

function winSpawnOpts(opts = {}) {
  if (process.platform !== "win32") return opts;
  return { ...opts, windowsHide: true };
}

module.exports = { resolveNodeExe, winSpawnOpts };
