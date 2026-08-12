#!/usr/bin/env node
/**
 * Fail the pack if Windows shell icon regresses to the default Electron atom
 * or BrowserWindow icon assets are missing from the packaged tree.
 *
 * Usage:
 *   node scripts/smoke-packaged-shell-icon.mjs
 *   node scripts/smoke-packaged-shell-icon.mjs --exe path/to/Stealth Browser Console.exe
 *   node scripts/smoke-packaged-shell-icon.mjs --staging path/to/electron-builder-out
 *
 * Known-bad: ExtractAssociatedIcon PNG SHA-256 of stock Electron 39 atom (measured on this machine).
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** PNG SHA-256 of Electron default atom ExtractAssociatedIcon (32×32) — must never ship. */
const ELECTRON_ATOM_PNG_SHA256 =
  "fddee667320490169d36f7cad21e0ea80f3eecc209b701d62f6fc73c4bd7d7d7";

function parseArgs(argv) {
  const opts = { exe: "", staging: "", resources: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--exe" && argv[i + 1]) opts.exe = path.resolve(argv[++i]);
    else if (a === "--staging" && argv[i + 1]) opts.staging = path.resolve(argv[++i]);
    else if (a === "--resources" && argv[i + 1]) opts.resources = path.resolve(argv[++i]);
  }
  return opts;
}

function assertPackConfig() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const files = pkg.build?.files || [];
  const hasIcons = files.some((f) => String(f).includes("build/icons"));
  if (!hasIcons) {
    throw new Error(
      "smoke-packaged-shell-icon: package.json build.files must include build/icons/** (BrowserWindow icon)",
    );
  }
  const extra = pkg.build?.extraResources || [];
  const hasResIco = extra.some(
    (e) =>
      (typeof e === "object" && e && String(e.to || "").replace(/\\/g, "/") === "app.ico") ||
      String(e).includes("app.ico"),
  );
  if (!hasResIco) {
    throw new Error(
      "smoke-packaged-shell-icon: package.json build.extraResources must ship resources/app.ico",
    );
  }
  const packScript = fs.readFileSync(path.join(root, "scripts", "run-electron-package.mjs"), "utf8");
  // Only flag real CLI/config flags — ignore comments that document the forbidden pattern.
  const liveFlag =
    /builderArgs\.push\([^)]*signAndEditExecutable\s*=\s*false/.test(packScript) ||
    /--config\.win\.signAndEditExecutable=false/.test(packScript);
  if (liveFlag) {
    throw new Error(
      "smoke-packaged-shell-icon: run-electron-package must not set win.signAndEditExecutable=false (skips rcedit icon)",
    );
  }
}

function resolveExe(opts) {
  if (opts.exe && fs.existsSync(opts.exe)) return opts.exe;
  if (opts.staging) {
    const staged = path.join(opts.staging, "win-unpacked", "Stealth Browser Console.exe");
    if (fs.existsSync(staged)) return staged;
  }
  const local = path.join(root, "dist-desktop", "win-unpacked", "Stealth Browser Console.exe");
  if (fs.existsSync(local)) return local;
  return "";
}

function resolveResources(opts, exePath) {
  if (opts.resources && fs.existsSync(opts.resources)) return opts.resources;
  if (opts.staging) {
    const staged = path.join(opts.staging, "win-unpacked", "resources");
    if (fs.existsSync(staged)) return staged;
  }
  if (exePath) {
    const beside = path.join(path.dirname(exePath), "resources");
    if (fs.existsSync(beside)) return beside;
  }
  const local = path.join(root, "dist-desktop", "win-unpacked", "resources");
  return fs.existsSync(local) ? local : "";
}

function assertResourcesIcon(resourcesDir) {
  if (!resourcesDir) {
    console.warn("smoke-packaged-shell-icon: skip resources/app.ico check (no resources dir)");
    return;
  }
  const ico = path.join(resourcesDir, "app.ico");
  if (!fs.existsSync(ico) || fs.statSync(ico).size < 1024) {
    throw new Error(`smoke-packaged-shell-icon: missing or tiny ${ico}`);
  }
  console.log(`smoke-packaged-shell-icon: OK resources/app.ico (${fs.statSync(ico).size} bytes)`);
}

function hashExeIconPng(exePath) {
  const ps = [
    "Add-Type -AssemblyName System.Drawing",
    `$exe = ${JSON.stringify(exePath)}`,
    "$ico = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)",
    "if (-not $ico) { throw 'ExtractAssociatedIcon returned null' }",
    "$ms = New-Object System.IO.MemoryStream",
    "$ico.ToBitmap().Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)",
    "$sha = [System.Security.Cryptography.SHA256]::Create().ComputeHash($ms.ToArray())",
    "($sha | ForEach-Object { $_.ToString('x2') }) -join ''",
  ].join("; ");
  const res = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
    encoding: "utf8",
    windowsHide: true,
  });
  if ((res.status ?? 1) !== 0) {
    throw new Error(`smoke-packaged-shell-icon: icon extract failed\n${res.stderr || res.stdout}`);
  }
  return String(res.stdout || "")
    .trim()
    .toLowerCase();
}

function assertExeNotElectronAtom(exePath) {
  if (!exePath) {
    console.warn("smoke-packaged-shell-icon: skip exe icon check (no Stealth Browser Console.exe yet)");
    return;
  }
  const hash = hashExeIconPng(exePath);
  if (hash === ELECTRON_ATOM_PNG_SHA256) {
    throw new Error(
      `smoke-packaged-shell-icon: FAIL exe still has default Electron atom icon\n` +
        `  exe=${exePath}\n` +
        `  Fix: do not set win.signAndEditExecutable=false; force full pack once (DESKTOP_RELEASE_REUSE_UNPACKED=0)`,
    );
  }
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`smoke-packaged-shell-icon: unexpected icon hash output: ${hash}`);
  }
  console.log(`smoke-packaged-shell-icon: OK exe icon sha256=${hash.slice(0, 16)}… (${path.basename(exePath)})`);
}

const opts = parseArgs(process.argv);
assertPackConfig();
const exe = resolveExe(opts);
const resources = resolveResources(opts, exe);
assertResourcesIcon(resources);
assertExeNotElectronAtom(exe);
console.log("smoke-packaged-shell-icon: PASS");
