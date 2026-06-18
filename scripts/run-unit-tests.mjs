#!/usr/bin/env node
/** Unit + DB + electron e2e smoke — PowerShell-safe sequential runner. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  console.log(`✓ ${label}`);
}

run("vitest", "pnpm", ["exec", "vitest", "run", "--passWithNoTests"]);
run("vite-build-ui", "pnpm", ["exec", "vite", "build"]);
run("ui-render-smoke", "node", ["scripts/smoke-ui-render.mjs", "dist/index.html"]);
run("profile-service", "node", ["electron/db/profile-service.test.cjs"]);
run("profile-identity", "node", ["--test", "electron/profile-identity.test.cjs"]);
run("profile-chrome-preferences", "node", ["--test", "electron/profile-chrome-preferences.test.cjs"]);
run("api-routes", "node", ["electron/api-routes.test.cjs"]);
run("electron-e2e-smoke", "node", ["electron/e2e/smoke-harness.cjs"]);
run("fingerprint-check-smoke", "node", ["electron/e2e/fingerprint-check-smoke.cjs"]);
run("proxy-smoke", "node", ["electron/e2e/proxy-smoke.cjs"]);
run("relaunch-smoke", "node", ["electron/e2e/relaunch-smoke.cjs"]);
run("identity-launch-smoke", "node", ["electron/e2e/identity-launch-smoke.cjs"]);
run("identity-multi-launch-smoke", "node", ["electron/e2e/identity-multi-launch-smoke.cjs"]);
run("no-sandbox-flag-smoke", "node", ["electron/e2e/no-sandbox-flag-smoke.cjs"]);
