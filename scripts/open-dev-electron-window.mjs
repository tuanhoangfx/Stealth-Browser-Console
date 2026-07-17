#!/usr/bin/env node
/** Open headed Stealth dev Electron when smokes closed the window but Vite is still up. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stealthElectronEnv } from "./lib/stealth-electron-env.mjs";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const electronCli = require.resolve("electron/cli.js");
const node = process.execPath;

const child = spawn(
  node,
  [electronCli, "."],
  winSpawnOpts({
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: stealthElectronEnv({ VITE_DEV_SERVER_URL: "http://127.0.0.1:5175/" }),
  }),
);
child.unref();
console.log(`[open-dev-electron-window] spawned electron pid=${child.pid}`);
