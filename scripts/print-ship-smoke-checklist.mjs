#!/usr/bin/env node
/** Post-publish manual gate — 2-minute packaged smoke before telling ops/users to update. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const setup = path.join(root, "dist-desktop", `Stealth-Browser-Console-Setup-${version}.exe`);

console.log("");
console.log("=== Ship smoke checklist (manual, ~2 min) ===");
console.log(`Installer: ${setup}`);
console.log("");
console.log("1. Install or silent-update to this Setup.exe (close Stealth first).");
console.log("2. Run one normal profile — browser opens, no ERR_MODULE_NOT_FOUND.");
console.log("3. Run one proxy profile — launch OK (geoip optional; no mmdb-lib crash).");
console.log("");
console.log("Release is NOT done for users until all 3 pass.");
console.log("Restore if broken: pnpm desktop:restore-good");
console.log("");
