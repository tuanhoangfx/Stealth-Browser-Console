#!/usr/bin/env node
/** Kill running Stealth Browser Console and launch the latest unpacked desktop build. */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exeName = "Stealth Browser Console.exe";
const processName = "Stealth Browser Console";

const candidates = [
  path.join(root, "dist-desktop", "win-unpacked", exeName),
  path.join(root, "out", "win-unpacked", exeName)
];

function findExe() {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function killExisting() {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/F", "/IM", exeName, "/T"], winSpawnOpts({ stdio: "ignore" }));
}

const exePath = findExe();
if (!exePath) {
  console.error(`Desktop exe not found. Run: pnpm desktop:dist\nLooked for:\n  ${candidates.join("\n  ")}`);
  process.exit(1);
}

killExisting();

const child = spawn(exePath, [], {
  ...winSpawnOpts({ cwd: path.dirname(exePath), stdio: "ignore", detached: true }),
  env: { ...process.env }
});
child.unref();

console.log(`Launched ${processName}:\n  ${exePath}`);
