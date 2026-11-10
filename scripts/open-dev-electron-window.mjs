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
const electronBin = require("electron");
const electronCli = require.resolve("electron/cli.js");
const { spawnInteractiveDesktopProcess } = require(path.join(root, "..", "scripts", "lib", "win-shell-env.cjs"));
const node = process.execPath;
const env = stealthElectronEnv({ VITE_DEV_SERVER_URL: "http://127.0.0.1:5175/" });

try {
  await fetch("http://127.0.0.1:6004/api/system/hot-reload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: true }),
    signal: AbortSignal.timeout(2500),
  });
  const res = await fetch("http://127.0.0.1:6004/api/system/hot-reload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ showWindow: true, reloadUi: true }),
    signal: AbortSignal.timeout(2500),
  }).then((r) => r.json());
  if (res && res.visibleCount > 0) {
    console.log(
      `[open-dev-electron-window] restored & focused existing Dev Exe (:6004) windows=${res.windowsCount} visible=${res.visibleCount}`,
    );
    process.exit(0);
  }
} catch {
  /* fall through to spawn interactive electron */
}

const winPid =
  typeof electronBin === "string"
    ? spawnInteractiveDesktopProcess({
        exePath: electronBin,
        args: [root],
        cwd: root,
        env,
      })
    : null;

if (winPid) {
  console.log(`[open-dev-electron-window] spawned interactive winsta0\\default electron pid=${winPid}`);
} else {
  const child = spawn(
    node,
    [electronCli, root],
    winSpawnOpts({
      cwd: root,
      detached: true,
      stdio: "ignore",
      env,
    }),
  );
  child.unref();
  console.log(`[open-dev-electron-window] spawned electron pid=${child.pid}`);
}
