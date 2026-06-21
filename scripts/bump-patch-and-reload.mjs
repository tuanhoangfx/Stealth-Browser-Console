#!/usr/bin/env node
/** @deprecated Use dev-desktop-reload.mjs — kept as alias for agents/scripts. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, [path.join(root, "scripts", "dev-desktop-reload.mjs")], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 0);
