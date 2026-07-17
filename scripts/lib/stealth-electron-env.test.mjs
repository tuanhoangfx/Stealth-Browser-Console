import assert from "node:assert";
import path from "node:path";
import { createRequire } from "node:module";

import { stealthElectronEnv } from "./stealth-electron-env.mjs";

const require = createRequire(import.meta.url);
const { DEV_DIR, PROD_DIR, roamingAppData, DEFAULT_DEV_API_PORT, DEFAULT_PROD_API_PORT } = require("../../electron/lib/user-data-root.cjs");

const devRoot = path.join(roamingAppData(), DEV_DIR);
const prodRoot = path.join(roamingAppData(), PROD_DIR);

// PROD-SAFETY regression: a dev window must ALWAYS boot on the isolated `-dev`
// userData root, even when the launching shell has no STEALTH_DEV_ISOLATED and a
// stale STEALTH_USER_DATA=prod inherited. Booting on the prod root made the dev
// instance's reconcileOrphansOnStartup() kill the user's packaged-app profiles.
delete process.env.STEALTH_DEV_ISOLATED;
process.env.STEALTH_USER_DATA = prodRoot; // simulate stale/inherited prod value

const isolated = stealthElectronEnv();
assert.strictEqual(
  isolated.STEALTH_USER_DATA,
  devRoot,
  `isolated dev env must use ${devRoot}, got ${isolated.STEALTH_USER_DATA} (would kill prod profiles)`,
);
assert.strictEqual(isolated.STEALTH_DEV_ISOLATED, "1");
assert.strictEqual(isolated.STEALTH_API_PORT, String(DEFAULT_DEV_API_PORT));
assert.notStrictEqual(isolated.STEALTH_USER_DATA, prodRoot, "isolated dev must never point at the prod root");

// Explicit --prod-data path: caller opts out of isolation → prod port, no forced root.
const prod = stealthElectronEnv({ STEALTH_DEV_ISOLATED: "0" });
assert.strictEqual(prod.STEALTH_API_PORT, String(DEFAULT_PROD_API_PORT));

// Caller may still pin a custom isolated root via `extra`.
const custom = stealthElectronEnv({ STEALTH_USER_DATA: "X:\\custom-root" });
assert.strictEqual(custom.STEALTH_USER_DATA, "X:\\custom-root");

console.log("stealth-electron-env.test: ok");
