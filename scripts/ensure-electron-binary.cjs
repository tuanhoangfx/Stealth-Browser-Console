const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { winSpawnOpts } = require("./lib/win-spawn.cjs");

const root = path.resolve(__dirname, "..");
const electronExe = path.join(root, "node_modules", "electron", "dist", "electron.exe");

if (fs.existsSync(electronExe)) {
  console.log("[ensure-electron-binary] ok");
  process.exit(0);
}

const installScript = path.join(root, "node_modules", "electron", "install.js");
if (!fs.existsSync(installScript)) {
  console.error("[ensure-electron-binary] electron package missing — run pnpm install");
  process.exit(1);
}

console.log("[ensure-electron-binary] downloading Electron binary…");
const result = spawnSync(process.execPath, [installScript], winSpawnOpts({ cwd: root, stdio: "inherit" }));
process.exit(result.status ?? 1);
