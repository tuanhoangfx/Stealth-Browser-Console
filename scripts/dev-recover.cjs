#!/usr/bin/env node
/** Recover P0003 dev server — kill :5175, clear Vite cache, restart Electron dev (hidden, isolated). */
const path = require("node:path");
const { recoverHubDevServer } = require("../../scripts/lib/hub-dev-recover-core.cjs");
const { isPackagedStealthRunning } = require("./lib/is-packaged-stealth-running.cjs");

const root = path.resolve(__dirname, "..");
const forceDev = process.argv.includes("--force-dev");

if (isPackagedStealthRunning() && !forceDev) {
  console.log(
    "[P0003 recover] packaged Stealth Browser Console.exe is running — skip dev-recover " +
      "(dev uses isolated userData :6004; pass --force-dev to override).",
  );
  process.exit(0);
}

recoverHubDevServer({
  productCode: "P0003",
  port: 5175,
  root,
  ensureArgs: ["scripts/dev-node.mjs"],
  detachedHidden: {
    logFile: path.join(root, ".dev-vite.log"),
    pidFile: path.join(root, ".dev-vite.pid"),
    env: {
      ...process.env,
      STEALTH_DEV_ISOLATED: "1",
      STEALTH_COOKIE_BRIDGE: "1",
    },
  },
});
