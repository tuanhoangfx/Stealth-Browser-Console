const { spawnSync } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const ssot = path.resolve(rootDir, "..", "scripts", "sync-app-icon.cjs");
const result = spawnSync(process.execPath, [ssot, "--code", "P0003", ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
