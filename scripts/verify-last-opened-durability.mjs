#!/usr/bin/env node
/** Gate: last-opened durability unit test + optional prod health probe. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;

function run(rel, args = []) {
  const result = spawnSync(node, [path.join(root, rel), ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

run("electron/db/last-opened-durability.test.cjs");

if (process.argv.includes("--prod-health")) {
  run("scripts/repair-last-opened-catalog.mjs");
}

console.log("verify-last-opened-durability: ok");
