/**
 * Live: HWND WM_GETICON vs Cloak chrome.exe — split "apply never stamped" vs class-default.
 * Usage: node scripts/diagnose-taskbar-hicon.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { runPowerShellFile } = require("../electron/lib/powershell-exec.cjs");

const ps1 = path.join(path.dirname(fileURLToPath(import.meta.url)), "diagnose-taskbar-hicon.ps1");
const { stdout } = await runPowerShellFile(ps1, [], { timeout: 60_000 });
const raw = String(stdout || "").trim();
if (!raw) {
  console.error("diagnose-taskbar-hicon: empty PowerShell output");
  process.exit(2);
}
console.log(raw);
