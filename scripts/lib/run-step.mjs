/** Hidden spawn helpers — no shell:true / no visible PowerShell on Windows. */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveNodeExe, winSpawnOpts } from "./win-spawn.mjs";
import { spawnElectronNode } from "./spawn-electron-node.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const p0003Root = path.resolve(__dirname, "..", "..");
const devRoot = path.resolve(p0003Root, "..", "..");
const runPnpmExec = path.join(devRoot, "Tool", "scripts", "run-pnpm-exec.mjs");

const require = createRequire(path.join(p0003Root, "package.json"));
const { findPnpmCjs } = require(path.join(devRoot, "Tool", "scripts", "lib", "win-shell-env.cjs"));

export function spawnStep(cmd, args, cwd = p0003Root) {
  const node = resolveNodeExe();
  if (cmd === "electron-node") {
    const script = args[0];
    const scriptArgs = args.slice(1);
    return spawnElectronNode(script, scriptArgs, { cwd, stdio: "inherit" });
  }
  if (cmd === "node") {
    return spawnSync(node, args, winSpawnOpts({ cwd, stdio: "inherit" }));
  }
  if (cmd === "pnpm" && args[0] === "exec") {
    return spawnSync(node, [runPnpmExec, "--", ...args.slice(1)], winSpawnOpts({ cwd, stdio: "inherit" }));
  }
  if (cmd === "pnpm") {
    const pnpmJs = findPnpmCjs(cwd) ?? findPnpmCjs(devRoot);
    if (!pnpmJs) {
      const err = new Error("pnpm.js not found");
      err.code = "ENOENT";
      throw err;
    }
    return spawnSync(node, [pnpmJs, ...args], winSpawnOpts({ cwd, stdio: "inherit" }));
  }
  return spawnSync(cmd, args, winSpawnOpts({ cwd, stdio: "inherit" }));
}

export function runStep(label, cmd, args, cwd = p0003Root) {
  const result = spawnStep(cmd, args, cwd);
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  console.log(`✓ ${label}`);
}
