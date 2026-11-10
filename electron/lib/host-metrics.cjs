"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Dev uses the monorepo SSOT. path.resolve collapses `..` first.
 * A packaged require of `app.asar/electron/lib/../../../../packages/...`
 * never returns: Electron's asar resolver blocks on that path, so bindIpc
 * never finishes and the window never opens. Pack copies the SSOT to
 * host-metrics.impl.cjs and we require that file inside the asar.
 */
const devImpl = path.resolve(__dirname, "../../../../packages/hub-host-metrics/host-metrics.cjs");
const packagedImpl = path.join(__dirname, "host-metrics.impl.cjs");
const fromAsar = __dirname.includes(`${path.sep}app.asar${path.sep}`) || __dirname.endsWith(`${path.sep}app.asar`);
const impl = !fromAsar && fs.existsSync(devImpl) ? devImpl : packagedImpl;
module.exports = require(impl);
