#!/usr/bin/env node
/** Wrapper → Electron ABI seed for agent pool 9990–9999 (Stealth must be stopped). */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "run-electron-node.mjs"), "scripts/seed-agent-pool-electron.cjs"],
  winSpawnOpts({ cwd: root, stdio: "inherit" }),
);
process.exit(r.status ?? 1);
