#!/usr/bin/env node
/** Launch packaged Stealth — never kills dev (:5175) or a running exe unless --replace. */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
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
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
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
const { launchDesktopExeVerified, probeDesktopHealth } = await import("../../scripts/lib/desktop-exe-products.mjs");

function isPackagedExeProcessRunning() {
  if (process.platform !== "win32") return false;
  try {
    // Do NOT pass `/FI "IMAGENAME eq Stealth Browser Console.exe"` — Windows tasklist truncates
    // the filter at 25 characters and falsely reports "No tasks are running"!
    const r = spawnSync("tasklist", ["/FO", "CSV", "/NH"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 2500,
    });
    return Boolean(r.stdout && r.stdout.toLowerCase().includes(`"${PACKAGED_EXE_NAME.toLowerCase()}"`));
  } catch {
    return false;
  }
}

const prodHealthyInitial = await probeDesktopHealth("http://127.0.0.1:6003/api/health", 3500);
const allowEmergencyKillProd = process.env.STEALTH_EMERGENCY_HARD_KILL_PROD === "1";

if (replaceRunning) {
  if ((prodHealthyInitial || isPackagedExeProcessRunning()) && !allowEmergencyKillProd) {
    const syncHotPatchScript = path.join(root, "scripts", "sync-hot-patch.cjs");
    if (fs.existsSync(syncHotPatchScript)) {
      spawnSync(
        process.execPath,
        [syncHotPatchScript, "--apply-prod", "--reload-ui", "--stage-asar"],
        winSpawnOpts({ stdio: "inherit", timeout: 20000 }),
      );
    }
    console.log(
      "desktop:open: Prod Stealth (:6003) is online; applied zero-restart hot-patch reload instead of killing running Prod exe.",
    );
    process.exit(0);
  } else {
    killPackagedOnly();
  }
} else if (prodHealthyInitial || isPackagedExeProcessRunning()) {
  console.log("desktop:open: Prod Stealth (:6003) is already running; leaving running exe + app.asar untouched.");
  process.exit(0);
}

// CRITICAL: Only promote staged/pending app.asar when Stealth Browser Console.exe is completely stopped!
// Overwriting app.asar while Electron is running corrupts memory-mapped offsets and crashes the app.
if (!isPackagedExeProcessRunning()) {
  try {
    const asar = require("@electron/asar");
    const parseVer = (asarFile) => {
      try {
        const pkg = JSON.parse(asar.extractFile(asarFile, "package.json").toString("utf8"));
        return String(pkg.version || "0.0.0");
      } catch {
        return "0.0.0";
      }
    };
    const cmpVer = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    const resDir = path.join(path.dirname(exePath), "resources");
    const targetAsar = path.join(resDir, "app.asar");
    const currentVer = fs.existsSync(targetAsar) ? parseVer(targetAsar) : "0.0.0";

    for (const candidateName of ["app.asar.staged", "app.asar.pending"]) {
      const candidatePath = path.join(resDir, candidateName);
      if (!fs.existsSync(candidatePath)) continue;
      const candVer = parseVer(candidatePath);
      if (cmpVer(candVer, currentVer) >= 0) {
        fs.copyFileSync(candidatePath, targetAsar);
        fs.unlinkSync(candidatePath);
        console.log(`desktop:open: promoted ${candidateName} (v${candVer}) -> resources/app.asar`);
      } else {
        fs.unlinkSync(candidatePath);
        console.log(`desktop:open: removed stale ${candidateName} (v${candVer} < current v${currentVer})`);
      }
    }
  } catch {
    /* ignore */
  }
}

const env = packagedStealthSpawnEnv();
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
