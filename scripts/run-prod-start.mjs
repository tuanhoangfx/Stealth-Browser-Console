#!/usr/bin/env node
/** Launch Electron against production dist/ (no Vite dev server). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stealthElectronEnv } from "./lib/stealth-electron-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distIndex = path.join(root, "dist", "index.html");

if (!fs.existsSync(distIndex)) {
  console.error("dist/index.html missing — run: pnpm build");
  process.exit(1);
}

function findElectron() {
  let dir = root;
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "node_modules", "electron", "cli.js");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("electron not found — run pnpm install");
}

const node = resolveNodeExe();
const result = spawnSync(
  node,
  [findElectron(), "."],
  winSpawnOpts({
    cwd: root,
    stdio: "inherit",
    env: stealthElectronEnv({ VITE_DEV_SERVER_URL: "" }),
  })
);
process.exit(result.status ?? 1);
