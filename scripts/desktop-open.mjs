#!/usr/bin/env node
/** Launch packaged Stealth — never kills dev (:5175) or a running exe unless --replace. */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exeName = "Stealth Browser Console.exe";
const processName = "Stealth Browser Console";
const replaceRunning = process.argv.includes("--replace");

const candidates = [
  path.join(root, "dist-desktop", "win-unpacked-pending", exeName),
  path.join(root, "dist-desktop", "win-unpacked", exeName),
  path.join(root, "out", "win-unpacked", exeName),
];

function findExe() {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function killPackagedOnly() {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/F", "/IM", exeName, "/T"], winSpawnOpts({ stdio: "ignore" }));
}

const exePath = findExe();
if (!exePath) {
  console.error(`Desktop exe not found. Run: pnpm desktop:dist\nLooked for:\n  ${candidates.join("\n  ")}`);
  process.exit(1);
}

if (replaceRunning) {
  killPackagedOnly();
} else {
  console.log("desktop:open: leaving dev + running Stealth untouched (use --replace to close packaged exe first).");
}

const child = spawn(exePath, [], {
  ...winSpawnOpts({ cwd: path.dirname(exePath), stdio: "ignore", detached: true }),
  env: { ...process.env },
});
child.unref();

console.log(`Launched ${processName}:\n  ${exePath}`);
