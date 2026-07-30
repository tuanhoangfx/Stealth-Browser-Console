#!/usr/bin/env node
/**
 * Hot-patch known-good 1.0.154 asar with fixed killOrphanProfileBrowser
 * (missing execFileAsync import made every orphan kill a silent no-op).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const winUnpacked = path.join(root, "dist-desktop/known-good/win-unpacked");
const exe = path.join(winUnpacked, "Stealth Browser Console.exe");
const asarPath = path.join(winUnpacked, "resources/app.asar");
const extractDir = path.join(root, "dist-desktop/known-good/_asar-patch");

const closePs = [
  "Get-CimInstance Win32_Process |",
  "Where-Object { $_.CommandLine -and $_.CommandLine -like '*known-good*win-unpacked*' } |",
  "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
].join(" ");

spawnSync("powershell.exe", ["-NoProfile", "-Command", closePs], {
  stdio: "inherit",
  windowsHide: true,
});

fs.rmSync(extractDir, { recursive: true, force: true });
fs.mkdirSync(extractDir, { recursive: true });
asar.extractAll(asarPath, extractDir);

const orphanTarget = path.join(extractDir, "electron/lib/profile-browser-orphan.cjs");
const sessionTarget = path.join(extractDir, "electron/engine/session-manager.cjs");
fs.writeFileSync(orphanTarget, fs.readFileSync(path.join(root, "electron/lib/profile-browser-orphan.cjs"), "utf8"));
if (fs.existsSync(sessionTarget)) {
  fs.writeFileSync(
    sessionTarget,
    fs.readFileSync(path.join(root, "electron/engine/session-manager.cjs"), "utf8"),
  );
}

const bak = `${asarPath}.bak-pre-orphan-fix`;
if (!fs.existsSync(bak)) fs.copyFileSync(asarPath, bak);
fs.rmSync(asarPath, { force: true });
await asar.createPackage(extractDir, asarPath);
fs.rmSync(extractDir, { recursive: true, force: true });

console.log(
  JSON.stringify({
    ok: true,
    asarPath,
    size: fs.statSync(asarPath).size,
    bak,
  }),
);

const child = spawn(exe, [], {
  detached: true,
  stdio: "ignore",
  windowsHide: false,
});
child.unref();
console.log(`launched ${exe}`);
