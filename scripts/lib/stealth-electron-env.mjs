/** Electron child env — product defaults override stale STEALTH_COOKIE_BRIDGE=0. */
import { createRequire } from "node:module";

import path from "node:path";

const require = createRequire(import.meta.url);
const {
  DEFAULT_DEV_API_PORT,
  DEFAULT_PROD_API_PORT,
  DEV_DIR,
  roamingAppData,
} = require("../../electron/lib/user-data-root.cjs");

/**
 * Build env for Electron child processes.
 * Isolated (`STEALTH_DEV_ISOLATED=1`) is the default so packaged Setup.exe and
 * local `pnpm dev:node` can run in parallel. Pass `STEALTH_DEV_ISOLATED: "0"`
 * only for `--prod-data` / explicit prod userData.
 */
export function stealthElectronEnv(extra = {}) {
  const env = {
    ...process.env,
    STEALTH_COOKIE_BRIDGE: "1",
    STEALTH_FAST_LAUNCH: process.env.STEALTH_FAST_LAUNCH ?? "1",
    ...extra,
    // Always last — ignore stale shell STEALTH_DEV_ISOLATED=0 unless caller sets it.
    STEALTH_DEV_ISOLATED:
      extra.STEALTH_DEV_ISOLATED !== undefined ? String(extra.STEALTH_DEV_ISOLATED) : "1",
  };
  const isolated = env.STEALTH_DEV_ISOLATED === "1";
  // Interactive dev must stay headed — agent smokes use X-Stealth-Agent-Smoke per API request.
  delete env.STEALTH_AGENT_SMOKE;
  delete env.STEALTH_HEADLESS_SMOKE;
  delete env.CURSOR_AGENT;
  delete env.ELECTRON_RUN_AS_NODE;
  if (isolated) {
    // PROD-SAFETY: pin the dev window to the isolated `-dev` userData root
    // DETERMINISTICALLY. Do NOT go through resolveStealthUserDataRoot() here — it
    // decides dev-vs-prod from the *ambient* process.env.STEALTH_DEV_ISOLATED,
    // which is usually unset in a plain reload shell and would resolve to the
    // PROD root. A dev window booted on the prod root runs reconcileOrphansOnStartup
    // against prod and kills the profiles the user has open in the packaged app.
    // Also ignore any stale inherited STEALTH_USER_DATA (=prod) unless the caller
    // explicitly overrides it via `extra`.
    env.STEALTH_USER_DATA = extra.STEALTH_USER_DATA ?? path.join(roamingAppData(), DEV_DIR);
    // Always use dev API port when isolated — ignore workspace STEALTH_API_PORT=6003 (prod).
    env.STEALTH_API_PORT = extra.STEALTH_API_PORT ?? String(DEFAULT_DEV_API_PORT);
  } else if (!env.STEALTH_API_PORT) {
    env.STEALTH_API_PORT = String(DEFAULT_PROD_API_PORT);
  }
  return env;
}
