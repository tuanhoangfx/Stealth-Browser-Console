#!/usr/bin/env node
/** Unit + DB + electron e2e smoke — hidden spawn (no shell:true flash). */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runStep } from "./lib/run-step.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.STEALTH_AGENT_SMOKE) {
  process.env.STEALTH_AGENT_SMOKE = "1";
}

runStep("check-cloakbrowser-pin", "node", ["scripts/check-cloakbrowser-pin.mjs"]);
runStep("sync-stealth-api-surface", "node", ["scripts/sync-stealth-api-surface.mjs"]);
runStep("agent-smoke-mode", "node", ["--test", "electron/lib/agent-smoke-mode.test.cjs"]);
runStep("verify-no-implicit-packaged-kill", "node", ["scripts/verify-no-implicit-packaged-kill.mjs"]);
runStep("agent-smoke-context", "node", ["--test", "electron/lib/agent-smoke-context.test.cjs"]);
runStep("catalog-backup-recovery", "node", ["--test", "electron/lib/catalog-backup-recovery.test.cjs"]);
runStep("catalog-persist-guard", "node", ["--test", "electron/lib/catalog-persist-guard.test.cjs"]);
runStep("verify-agent-smoke-headless", "node", ["scripts/verify-agent-smoke-headless.mjs", "0003"]);
runStep("cloakbrowser-packaged-resolve", "node", ["--test", "electron/lib/cloakbrowser-packaged-resolve.test.cjs"]);
runStep("powershell-exec-asar-resolve", "node", ["--test", "electron/lib/powershell-exec.test.cjs"]);
runStep("smoke-asar-ps1-resolve", "node", ["scripts/smoke-asar-ps1-resolve.mjs"]);
runStep("cloakbrowser-esm-deps", "node", ["scripts/verify-cloakbrowser-esm-deps.mjs"]);
runStep("dev-desktop-process", "node", ["scripts/lib/dev-desktop-process.test.mjs"]);
runStep("stealth-electron-env", "node", ["scripts/lib/stealth-electron-env.test.mjs"]);
runStep("profiles-location", "node", ["--test", "electron/lib/profiles-location.test.cjs"]);
runStep("host-metrics", "node", ["--test", "electron/lib/host-metrics.test.cjs"]);
runStep("microsoft-gate-gmail", "node", ["--test", "electron/automation/script-steps.microsoft-gate.test.cjs"]);
runStep("captcha-stop-gmail", "node", ["--test", "electron/automation/script-steps.captcha-stop.test.cjs"]);
runStep("profile-window-title", "node", ["--test", "electron/lib/profile-window-title.test.cjs"]);
runStep("taskbar-title-match", "node", ["--test", "electron/lib/taskbar-title-match.test.cjs"]);
runStep("taskbar-badge-guard", "node", ["--test", "electron/lib/taskbar-badge-guard.test.cjs"]);
runStep("taskbar-apply-worker", "node", ["--test", "electron/lib/taskbar-apply-worker.test.cjs"]);
runStep("profile-code", "node", ["--test", "electron/lib/profile-code.test.cjs"]);
runStep("running-profile-cap", "node", ["--test", "electron/lib/running-profile-cap.test.cjs"]);
runStep("shutdown-log", "node", ["--test", "electron/lib/shutdown-log.test.cjs"]);
runStep("kill-port-guard", "node", ["scripts/kill-port.test.cjs"]);
runStep("refresh-hub-ui-node-link", "node", [
  path.join(root, "..", "scripts", "refresh-hub-ui-node-link.cjs"),
  "--code",
  "P0003",
  "--fix",
]);
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
  ["extension-e0001-relaunch-smoke", "node", ["electron/e2e/extension-e0001-relaunch-smoke.cjs"]],
];

if (fast) {
  console.log("test:fast — skip live CloakBrowser e2e smokes (use test:unit for full release)");
} else {
  for (const [label, cmd, args] of liveE2e) runStep(label, cmd, args);
}

runStep("profile-backup", "node", ["--test", "electron/lib/profile-backup.test.cjs"]);
// DB tests → Electron Node ABI (better-sqlite3). Plain `node` falls back to sql.js.
runStep("profile-service", "electron-node", ["electron/db/profile-service.test.cjs"]);
runStep("last-opened-durability", "electron-node", ["electron/db/last-opened-durability.test.cjs"]);
runStep("profile-search-regression", "electron-node", ["electron/db/profile-search-regression.test.cjs"]);
runStep("profile-chrome-columns-migration", "electron-node", [
  "--test",
  "electron/db/profile-chrome-columns-migration.test.cjs",
]);
runStep("safe-goto", "node", ["--test", "electron/automation/safe-goto.test.cjs"]);
runStep("google-session-guard", "node", ["--test", "electron/automation/google-session-guard.test.cjs"]);
runStep("google-session-detect", "node", ["--test", "electron/lib/google-session-detect.test.cjs"]);
runStep("stealth-snapshot-types", "node", ["--test", "electron/lib/stealth-snapshot-types.test.cjs"]);
runStep("stealth-resolve-targets", "node", ["--test", "electron/lib/stealth-resolve-targets.test.cjs"]);
runStep("profile-identity", "node", ["--test", "electron/profile-identity.test.cjs"]);
runStep("desktop-app-icon", "node", ["--test", "electron/lib/desktop-app-icon.test.cjs"]);
runStep("directory-id-search", "node", ["--test", "electron/lib/directory-id-search.test.cjs"]);
runStep("profile-chrome-preferences", "node", ["--test", "electron/profile-chrome-preferences.test.cjs"]);
runStep("profile-chrome-cleanup", "node", ["--test", "electron/profile-chrome-cleanup.test.cjs"]);
runStep("packaged-csp", "node", ["--test", "electron/lib/packaged-csp.test.cjs"]);
runStep("profile-chrome-session", "node", ["--test", "electron/lib/profile-chrome-session.test.cjs"]);
runStep("omnibox-search-guard", "node", ["--test", "electron/lib/omnibox-search-guard.test.cjs"]);
runStep("cookie-bridge-store", "node", ["--test", "electron/lib/cookie-bridge-store.test.cjs"]);
runStep("cloakbrowser-extension-stage", "node", ["--test", "electron/lib/cloakbrowser-extension-stage.test.cjs"]);
runStep("profile-browser-orphan", "node", ["--test", "electron/lib/profile-browser-orphan.test.cjs"]);
runStep("profile-extension-pins", "node", ["--test", "electron/lib/profile-extension-pins.test.cjs"]);
runStep("cloak-browser-engine", "node", ["--test", "electron/engine/cloak-browser-engine.test.cjs"]);
runStep("prepare-profile-launch", "node", ["--test", "electron/engine/prepare-profile-launch.test.cjs"]);
runStep("check-launch-speed", "node", ["scripts/check-launch-speed.mjs"]);
runStep("profile-ops", "electron-node", ["electron/services/profile-ops.test.cjs"]);
runStep("api-routes", "electron-node", ["electron/api-routes.test.cjs"]);
