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

run("check-cloakbrowser-pin", "node", ["scripts/check-cloakbrowser-pin.mjs"]);
run("vitest", "pnpm", ["exec", "vitest", "run", "--passWithNoTests"]);
run("vite-build-ui", "pnpm", ["exec", "vite", "build"]);
run("ui-render-smoke", "node", ["scripts/smoke-ui-render.mjs", "dist/index.html"]);
run("profile-service", "node", ["electron/db/profile-service.test.cjs"]);
run("profile-search-regression", "node", ["electron/db/profile-search-regression.test.cjs"]);
run("profile-chrome-columns-migration", "node", ["--test", "electron/db/profile-chrome-columns-migration.test.cjs"]);
run("safe-goto", "node", ["--test", "electron/automation/safe-goto.test.cjs"]);
run("google-session-guard", "node", ["--test", "electron/automation/google-session-guard.test.cjs"]);
run("profile-identity", "node", ["--test", "electron/profile-identity.test.cjs"]);
run("directory-id-search", "node", ["--test", "electron/lib/directory-id-search.test.cjs"]);
run("profile-chrome-preferences", "node", ["--test", "electron/profile-chrome-preferences.test.cjs"]);
run("profile-chrome-cleanup", "node", ["--test", "electron/profile-chrome-cleanup.test.cjs"]);
run("profile-chrome-session", "node", ["--test", "electron/lib/profile-chrome-session.test.cjs"]);
run("cookie-bridge-store", "node", ["--test", "electron/lib/cookie-bridge-store.test.cjs"]);
run("cloak-browser-engine", "node", ["--test", "electron/engine/cloak-browser-engine.test.cjs"]);
run("api-routes", "node", ["electron/api-routes.test.cjs"]);
run("electron-e2e-smoke", "node", ["electron/e2e/smoke-harness.cjs"]);
run("fingerprint-check-smoke", "node", ["electron/e2e/fingerprint-check-smoke.cjs"]);
run("proxy-smoke", "node", ["electron/e2e/proxy-smoke.cjs"]);
run("relaunch-smoke", "node", ["electron/e2e/relaunch-smoke.cjs"]);
run("workflow-launch-smoke", "node", ["electron/e2e/workflow-launch-smoke.cjs"]);
run("workflow-on-open-smoke", "node", ["electron/e2e/workflow-on-open-smoke.cjs"]);
run("launch-vs-run-smoke", "node", ["electron/e2e/launch-vs-run-smoke.cjs"]);
run("no-sandbox-flag-smoke", "node", ["electron/e2e/no-sandbox-flag-smoke.cjs"]);
