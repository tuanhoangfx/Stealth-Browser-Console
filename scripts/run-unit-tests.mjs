#!/usr/bin/env node
/** Unit + DB + electron e2e smoke — hidden spawn (no shell:true flash). */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runStep } from "./lib/run-step.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

runStep("check-cloakbrowser-pin", "node", ["scripts/check-cloakbrowser-pin.mjs"]);
runStep("vitest", "pnpm", ["exec", "vitest", "run", "--passWithNoTests"]);
runStep("vite-build-ui", "pnpm", ["exec", "vite", "build"]);
runStep("ui-render-smoke", "node", ["scripts/smoke-ui-render.mjs", "dist/index.html"]);
runStep("packaged-auth-smoke", "node", ["scripts/smoke-packaged-auth.mjs", "dist/index.html"]);

const fast = process.argv.includes("--fast") || process.env.P0003_TEST_FAST === "1";
const liveE2e = [
  ["electron-e2e-smoke", "node", ["electron/e2e/smoke-harness.cjs"]],
  ["fingerprint-check-smoke", "node", ["electron/e2e/fingerprint-check-smoke.cjs"]],
  ["proxy-smoke", "node", ["electron/e2e/proxy-smoke.cjs"]],
  ["relaunch-smoke", "node", ["electron/e2e/relaunch-smoke.cjs"]],
  ["workflow-launch-smoke", "node", ["electron/e2e/workflow-launch-smoke.cjs"]],
  ["workflow-on-open-smoke", "node", ["electron/e2e/workflow-on-open-smoke.cjs"]],
  ["launch-vs-run-smoke", "node", ["electron/e2e/launch-vs-run-smoke.cjs"]],
  ["no-sandbox-flag-smoke", "node", ["electron/e2e/no-sandbox-flag-smoke.cjs"]],
];

if (fast) {
  console.log("test:fast — skip live CloakBrowser e2e smokes (use test:unit for full release)");
} else {
  for (const [label, cmd, args] of liveE2e) runStep(label, cmd, args);
}

runStep("profile-backup", "node", ["--test", "electron/lib/profile-backup.test.cjs"]);
runStep("profile-service", "node", ["electron/db/profile-service.test.cjs"]);
runStep("profile-search-regression", "node", ["electron/db/profile-search-regression.test.cjs"]);
runStep("profile-chrome-columns-migration", "node", ["--test", "electron/db/profile-chrome-columns-migration.test.cjs"]);
runStep("safe-goto", "node", ["--test", "electron/automation/safe-goto.test.cjs"]);
runStep("google-session-guard", "node", ["--test", "electron/automation/google-session-guard.test.cjs"]);
runStep("profile-identity", "node", ["--test", "electron/profile-identity.test.cjs"]);
runStep("desktop-app-icon", "node", ["--test", "electron/lib/desktop-app-icon.test.cjs"]);
runStep("directory-id-search", "node", ["--test", "electron/lib/directory-id-search.test.cjs"]);
runStep("profile-chrome-preferences", "node", ["--test", "electron/profile-chrome-preferences.test.cjs"]);
runStep("profile-chrome-cleanup", "node", ["--test", "electron/profile-chrome-cleanup.test.cjs"]);
runStep("packaged-csp", "node", ["--test", "electron/lib/packaged-csp.test.cjs"]);
runStep("profile-chrome-session", "node", ["--test", "electron/lib/profile-chrome-session.test.cjs"]);
runStep("omnibox-search-guard", "node", ["--test", "electron/lib/omnibox-search-guard.test.cjs"]);
runStep("cookie-bridge-store", "node", ["--test", "electron/lib/cookie-bridge-store.test.cjs"]);
runStep("cloak-browser-engine", "node", ["--test", "electron/engine/cloak-browser-engine.test.cjs"]);
runStep("api-routes", "node", ["electron/api-routes.test.cjs"]);
