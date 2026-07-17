#!/usr/bin/env node
/** Launch packaged Stealth — never kills dev (:5175) or a running exe unless --replace. */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PACKAGED_EXE_NAME,
  packagedStealthSpawnEnv,
  readExeProductVersion,
  resolvePackagedStealthExe,
} from "./lib/resolve-packaged-exe.mjs";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processName = "Stealth Browser Console";
const replaceRunning = process.argv.includes("--replace");

function killPackagedOnly() {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/F", "/IM", PACKAGED_EXE_NAME, "/T"], winSpawnOpts({ stdio: "ignore" }));
}

const exePath = resolvePackagedStealthExe(root);
if (!exePath) {
  console.error(
    `Desktop exe not found. Run: pnpm desktop:dist\n` +
      `Or install NSIS Setup to %LOCALAPPDATA%\\Programs\\stealth-browser-console`,
  );
  process.exit(1);
}

const version = readExeProductVersion(exePath) || "unknown";

if (replaceRunning) {
  killPackagedOnly();
} else {
  console.log("desktop:open: leaving dev + running Stealth untouched (use --replace to close packaged exe first).");
}

const child = spawn(exePath, [], {
  ...winSpawnOpts({ cwd: path.dirname(exePath), stdio: "ignore", detached: true }),
  env: packagedStealthSpawnEnv(),
});
child.unref();

console.log(`Launched ${processName} v${version}:\n  ${exePath}`);
