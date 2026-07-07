#!/usr/bin/env node
/** Run a .cjs/.mjs script with Electron Node ABI (better-sqlite3). Usage: node scripts/run-electron-node.mjs <script> [args…] */
import { spawnElectronNode } from "./lib/spawn-electron-node.mjs";

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error("usage: node scripts/run-electron-node.mjs <script.cjs> [args…]");
  process.exit(1);
}

const result = spawnElectronNode(script, args);
process.exit(result.status ?? 1);
