#!/usr/bin/env node
/** Launch packaged Stealth — never kills dev (:5175) or a running exe unless --replace. */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
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
const require = createRequire(path.join(root, "package.json"));
const { spawnInteractiveDesktopProcess } = require(path.join(root, "..", "scripts", "lib", "win-shell-env.cjs"));
const processName = "Stealth Browser Console";
const replaceRunning = process.argv.includes("--replace");

function killPackagedOnly() {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/F", "/IM", PACKAGED_EXE_NAME], winSpawnOpts({ stdio: "ignore" }));
  // Also release port 6003 if an unpackaged electron.exe is squatting on the Prod userData lock (never touch chrome.exe).
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$l = Get-NetTCPConnection -LocalPort 6003 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($l) { $mp = $l.OwningProcess; Get-CimInstance Win32_Process -Filter \"ParentProcessId=$mp AND Name='electron.exe'\" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Stop-Process -Id $mp -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -like '*Roaming\\stealth-browser-console\"*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 1500",
    ],
    winSpawnOpts({ stdio: "ignore" }),
  );
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

const env = packagedStealthSpawnEnv();
const { launchDesktopExeVerified } = await import("../../scripts/lib/desktop-exe-products.mjs");
const launchRes = await launchDesktopExeVerified({
  exePath,
  args: [],
  cwd: path.dirname(exePath),
  env,
  healthUrl: "http://127.0.0.1:6003/api/health",
  replaceRunning: false,
  exeName: PACKAGED_EXE_NAME,
  spawnInteractiveDesktopProcess,
});

console.log(`Launched ${processName} v${version} (${launchRes.method}, ok=${launchRes.ok}):\n  ${exePath}`);
