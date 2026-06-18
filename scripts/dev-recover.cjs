#!/usr/bin/env node
/** Recover P0003 dev server — kill :5175, clear Vite cache, restart Electron dev. */
const path = require("node:path");
const { recoverHubDevServer } = require("../../scripts/lib/hub-dev-recover-core.cjs");

recoverHubDevServer({
  productCode: "P0003",
  port: 5175,
  root: path.resolve(__dirname, ".."),
  ensureArgs: ["scripts/dev-node.mjs"],
});
