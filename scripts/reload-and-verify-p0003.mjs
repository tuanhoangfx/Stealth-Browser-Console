#!/usr/bin/env node
/** Kill P0003 dev stack, purge identity extensions, restart dev, run live smokes. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  focusStealthWindow,
  killStealthDev,
  LOG_FILE,
  startDevDetached,
} from "./lib/dev-desktop-process.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const userData = path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console");

function run(label, cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true, ...opts });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  console.log(`✓ ${label}`);
}

function waitForUrl(url, timeoutMs = 120_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url, { method: "GET" }).then(
        (res) => {
          if (res.ok) resolve();
          else if (Date.now() - start > timeoutMs) reject(new Error(`timeout waiting ${url}`));
          else setTimeout(tick, 1500);
        },
        () => {
          if (Date.now() - start > timeoutMs) reject(new Error(`timeout waiting ${url}`));
          else setTimeout(tick, 1500);
        },
      );
    };
    tick();
  });
}

async function main() {
  console.log("reload-and-verify-p0003: stopping dev…");
  killStealthDev();
  await new Promise((r) => setTimeout(r, 2000));

  run("ensure-electron-binary", "node", ["scripts/ensure-electron-binary.cjs"]);
  run("purge-identity-extensions", "node", ["scripts/purge-identity-extensions.cjs"]);

  const bundles = path.join(userData, "identity-toolbar");
  const bundleCount = fs.existsSync(bundles)
    ? fs.readdirSync(bundles, { withFileTypes: true }).filter((e) => e.isDirectory()).length
    : 0;
  console.log(`identity-toolbar bundles after purge: ${bundleCount}`);
  if (bundleCount > 0) process.exit(2);

  console.log("reload-and-verify-p0003: starting dev (single background process, no extra terminal)…");
  const pid = startDevDetached();
  console.log(`dev pid=${pid} log=${path.relative(root, LOG_FILE)}`);

  await waitForUrl("http://127.0.0.1:5175/");
  console.log("✓ dev server ready http://127.0.0.1:5175/");
  await new Promise((r) => setTimeout(r, 5000));
  focusStealthWindow();

  run("identity-purge-smoke", "node", ["electron/e2e/identity-purge-smoke.cjs"]);
  run("identity-absent-launch-smoke", "node", ["electron/e2e/identity-absent-launch-smoke.cjs"]);
  run("relaunch-smoke", "node", ["electron/e2e/relaunch-smoke.cjs"]);
  run("workflow-rail-smoke", "node", ["scripts/smoke-workflow-rail.mjs", "http://127.0.0.1:5175/"]);

  console.log("\nreload-and-verify-p0003: all checks passed — Stealth Browser Console is running.");
  console.log("(Close orphan PowerShell windows from earlier failed starts if any remain.)");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
