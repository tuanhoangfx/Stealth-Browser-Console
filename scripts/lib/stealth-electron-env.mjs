/** Electron child env — product defaults override stale STEALTH_COOKIE_BRIDGE=0. */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DEFAULT_DEV_API_PORT,
  DEFAULT_PROD_API_PORT,
  resolveStealthUserDataRoot,
  isDevIsolated,
} = require("../../electron/lib/user-data-root.cjs");

export function stealthElectronEnv(extra = {}) {
  const env = {
    ...process.env,
    STEALTH_COOKIE_BRIDGE: "1",
    STEALTH_FAST_LAUNCH: process.env.STEALTH_FAST_LAUNCH ?? "1",
    // Default isolated dev so packaged Setup.exe + local dev can run in parallel.
    STEALTH_DEV_ISOLATED: process.env.STEALTH_DEV_ISOLATED ?? "1",
    ...extra,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  if (isDevIsolated()) {
    if (!env.STEALTH_USER_DATA) {
      env.STEALTH_USER_DATA = resolveStealthUserDataRoot({ packaged: false });
    }
    // Always use dev API port when isolated — ignore workspace STEALTH_API_PORT=6003 (prod).
    env.STEALTH_API_PORT =
      extra.STEALTH_API_PORT ?? String(DEFAULT_DEV_API_PORT);
  } else if (!env.STEALTH_API_PORT) {
    env.STEALTH_API_PORT = String(DEFAULT_PROD_API_PORT);
  }
  return env;
}
