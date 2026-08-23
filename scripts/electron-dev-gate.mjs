#!/usr/bin/env node
/** Hash electron main sources — reload stale :5175 when changed. Version bump = workspace hook SSOT. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { isDevPortListening } from "./lib/dev-port-guard.mjs";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stampDir = path.join(root, ".dev");
const stampFile = path.join(stampDir, "electron.sha");

function walkCjs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkCjs(abs, out);
    else if (entry.name.endsWith(".cjs")) out.push(abs);
  }
  return out;
}

function hashElectron() {
  const files = walkCjs(path.join(root, "electron")).sort();
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file.slice(root.length));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

function killDevPort() {
  const kill = path.join(root, "scripts", "kill-port.cjs");
  if (!fs.existsSync(kill)) return;
  spawnSync(process.execPath, [kill, "5175"], winSpawnOpts({ cwd: root, stdio: "inherit" }));
}

async function main() {
  const iconPath = path.join(root, "build", "icons", "app.ico");
  if (!fs.existsSync(iconPath)) {
    const syncIcon = path.join(root, "..", "scripts", "sync-app-icon.cjs");
    spawnSync(process.execPath, [syncIcon, "--code", "P0003"], winSpawnOpts({ cwd: root, stdio: "inherit" }));
  }

  const force = process.env.STEALTH_DEV_FORCE_RELOAD === "1";
  const nextHash = hashElectron();
  const prev = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, "utf8").trim() : "";
  if (!force && prev === nextHash) {
    console.log("electron-dev-gate: unchanged — skip reload");
    return;
  }

  const devActive = await isDevPortListening();
  if (devActive && !force) {
    console.warn(
      "electron-dev-gate: electron sources changed but :5175 active — defer kill until dev stopped " +
        "(set STEALTH_DEV_FORCE_RELOAD=1 to override)",
    );
    return;
  }

  fs.mkdirSync(stampDir, { recursive: true });
  fs.writeFileSync(stampFile, `${nextHash}\n`, "utf8");
  spawnSync(process.execPath, [path.join(root, "scripts", "sync-app-version.mjs")], winSpawnOpts({
    cwd: root,
    stdio: "inherit",
  }));
  killDevPort();
  console.log("electron-dev-gate: electron sources changed — port 5175 freed (version via hook SSOT)");
}

await main();
