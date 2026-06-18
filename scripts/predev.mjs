#!/usr/bin/env node
/** predev / predev:web — PowerShell-safe (no &&). */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, "..");

function run(name) {
  const script = path.join(scriptsDir, name);
  const result = spawnSync(process.execPath, [script], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("sync-hub-env.mjs");
run("sync-hub-boot-public.mjs");
run("sync-app-version.mjs");
run("ensure-better-sqlite3.mjs");
