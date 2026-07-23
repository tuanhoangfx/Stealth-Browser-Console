#!/usr/bin/env node
/**
 * Regression: packaged Electron must resolve taskbar PS1 to app.asar.unpacked
 * (PowerShell -File cannot read virtual app.asar paths).
 *
 * Usage: node scripts/smoke-asar-ps1-resolve.mjs [path-to-Stealth-Browser-Console.exe]
 * Exit 0 = PASS | SKIP (no packaged exe); 1 = FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolvePackagedStealthExe } from "./lib/resolve-packaged-exe.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exeArg = process.argv[2];
const exe =
  (exeArg && fs.existsSync(exeArg) ? exeArg : null) || resolvePackagedStealthExe(root);

if (!exe) {
  console.log("smoke-asar-ps1-resolve: SKIP (no packaged exe — pack or install first)");
  process.exit(0);
}

const probe = `
const fs = require('fs');
const path = require('path');
const resources = process.resourcesPath;
const asarLib = path.join(resources, 'app.asar', 'electron', 'lib');
const { resolveElectronLibScript } = require(path.join(asarLib, 'powershell-exec.cjs'));
const name = 'stealth-taskbar-apply.ps1';
const resolved = resolveElectronLibScript(name);
const sep = path.sep;
const asarNeedle = sep + 'app.asar' + sep;
const unpackedNeedle = sep + 'app.asar.unpacked' + sep;
const bad = resolved.includes(asarNeedle) && !resolved.includes(unpackedNeedle);
const okDisk = fs.existsSync(resolved);
const out = { version: require(path.join(resources, 'app.asar', 'package.json')).version, resolved, okDisk, bad };
process.stdout.write(JSON.stringify(out));
if (bad || !okDisk) process.exit(2);
`.trim();

const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
delete env.ELECTRON_NO_ASAR;

const result = spawnSync(exe, ["-e", probe], {
  encoding: "utf8",
  env,
  windowsHide: true,
  timeout: 30_000,
});

const stdout = String(result.stdout || "").trim();
const stderr = String(result.stderr || "").trim();
if (result.status !== 0) {
  console.error("smoke-asar-ps1-resolve: FAIL");
  console.error(`  exe: ${exe}`);
  console.error(`  status: ${result.status}`);
  if (stdout) console.error(`  stdout: ${stdout}`);
  if (stderr) console.error(`  stderr: ${stderr}`);
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(stdout);
} catch {
  console.error("smoke-asar-ps1-resolve: FAIL bad JSON", stdout);
  process.exit(1);
}

if (payload.bad || !payload.okDisk) {
  console.error("smoke-asar-ps1-resolve: FAIL resolver still points at asar or missing file");
  console.error(payload);
  process.exit(1);
}

console.log(
  `smoke-asar-ps1-resolve: PASS (v${payload.version} → ${path.basename(path.dirname(payload.resolved))}/${path.basename(payload.resolved)})`,
);
