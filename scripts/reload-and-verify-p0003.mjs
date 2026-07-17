#!/usr/bin/env node
/** Kill P0003 dev stack, purge legacy identity-toolbar, restart dev, run live smokes. */
process.env.STEALTH_AGENT_SMOKE = "1";

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  focusStealthWindow,
  killStealthDev,
  LOG_FILE,
  startDevDetached,
} from "./lib/dev-desktop-process.mjs";
import { runStep, spawnStep } from "./lib/run-step.mjs";
import { spawnElectronNode } from "./lib/spawn-electron-node.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let smokePagerCleanupDone = false;
function runSmokePagerCleanupSync() {
  if (smokePagerCleanupDone) return;
  smokePagerCleanupDone = true;
  const cleanup = spawnElectronNode("scripts/lib/cleanup-smoke-profiles-pager.cjs");
  if (cleanup.status === 0) {
    console.log("✓ cleanup-smoke-profiles-pager");
  } else {
    console.error(`\n✗ cleanup-smoke-profiles-pager failed (exit ${cleanup.status})`);
  }
}
process.on("exit", runSmokePagerCleanupSync);

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

  runStep("ensure-electron-binary", "node", ["scripts/ensure-electron-binary.cjs"]);
  runStep("profile-chrome-cleanup", "node", ["--test", "electron/profile-chrome-cleanup.test.cjs"]);

  console.log("reload-and-verify-p0003: starting dev (single background process, no extra terminal)…");
  const pid = startDevDetached();
  console.log(`dev pid=${pid} log=${path.relative(root, LOG_FILE)}`);

  await waitForUrl("http://127.0.0.1:5175/");
  console.log("✓ dev server ready http://127.0.0.1:5175/");
  await new Promise((r) => setTimeout(r, 5000));
  if (process.env.STEALTH_AGENT_SMOKE !== "1") {
    focusStealthWindow();
  }

  runStep("relaunch-smoke", "node", ["electron/e2e/relaunch-smoke.cjs"]);
  runStep("vite-build-ui-smoke", "pnpm", ["exec", "vite", "build"]);
  runStep("seed-smoke-profiles-pager", "electron-node", ["scripts/lib/seed-smoke-profiles-pager.cjs"]);
  runStep(
    "workflow-rail-smoke",
    "node",
    ["scripts/smoke-workflow-rail.mjs", "http://127.0.0.1:5175/?stealthSmokePager=1"],
  );
  runStep("workflow-tab-console-smoke", "node", ["scripts/smoke-workflow-tab-console.mjs", "dist/index.html"]);
  runStep("benchmark-profile-launch", "electron-node", ["scripts/benchmark-profile-launch.mjs", "3"]);

  runStep("close-running-profiles", "node", ["scripts/close-running-dev-profiles.mjs"]);

  runStep("open-dev-window", "node", ["scripts/open-dev-electron-window.mjs"]);
  await new Promise((r) => setTimeout(r, 3000));
  focusStealthWindow();

  console.log("\nreload-and-verify-p0003: all checks passed — Stealth Browser Console is running.");
  console.log("(Close orphan PowerShell windows from earlier failed starts if any remain.)");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
