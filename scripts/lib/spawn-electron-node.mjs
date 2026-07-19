/**
 * Run a .cjs script with Electron's Node ABI (better-sqlite3 native bindings).
 * Use instead of `node script.cjs` for any script that opens SQLite via init.cjs.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { winSpawnOpts } from "./win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));

export function resolveElectronCli() {
  try {
    return require.resolve("electron/cli.js");
  } catch {
    return null;
  }
}

/**
 * @param {string} scriptRelPath path relative to product root, or `"--test"` for node:test
 * @param {string[]} [args]
 */
export function spawnElectronNode(scriptRelPath, args = [], options = {}) {
  const electronCli = resolveElectronCli();
  if (!electronCli) {
    return { status: 1, error: new Error("electron cli.js not found") };
  }

  const cwd = options.cwd ?? root;
  /** @type {string[]} */
  let electronArgs;
  if (scriptRelPath === "--test") {
    // `electron-node --test path/to/*.test.cjs` — same ABI as packaged Electron DB.
    electronArgs = [
      "--test",
      ...args.map((a) => (path.isAbsolute(a) ? a : path.join(cwd, a))),
    ];
  } else {
    const scriptAbs = path.isAbsolute(scriptRelPath)
      ? scriptRelPath
      : path.join(cwd, scriptRelPath);
    if (!fs.existsSync(scriptAbs)) {
      return { status: 1, error: new Error(`script not found: ${scriptAbs}`) };
    }
    electronArgs = [scriptAbs, ...args];
  }

  return spawnSync(
    process.execPath,
    [electronCli, ...electronArgs],
    winSpawnOpts({
      cwd,
      stdio: options.stdio ?? "inherit",
      env: {
        ...process.env,
        ...options.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
    }),
  );
}

export { root as electronNodeRoot };
