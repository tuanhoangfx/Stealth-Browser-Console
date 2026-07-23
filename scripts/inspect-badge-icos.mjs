import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runPowerShellCommandAsync } = require("../electron/lib/powershell-exec.cjs");

const dir = path.join(os.tmpdir(), "stealth-taskbar-badges");
const out = path.join(os.tmpdir(), "stealth-badge-inspect");
fs.mkdirSync(out, { recursive: true });
const codes = ["0012", "0013", "0072", "0073", "0888", "1888", "2888", "3888", "4888"];

for (const c of codes) {
  const ico = path.join(dir, `v4-digits-only-spaced5-${c}-hot.ico`);
  const png = path.join(out, `${c}.png`);
  if (!fs.existsSync(ico)) {
    console.log(JSON.stringify({ code: c, missing: true }));
    continue;
  }
  const icoLit = ico.replace(/'/g, "''");
  const pngLit = png.replace(/'/g, "''");
  const ps = [
    "Add-Type -AssemblyName System.Drawing",
    `$icoPath = '${icoLit}'`,
    `$pngPath = '${pngLit}'`,
    "$icon = New-Object System.Drawing.Icon($icoPath)",
    "$bmp = $icon.ToBitmap()",
    "$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)",
    "Write-Output ($bmp.Width.ToString() + 'x' + $bmp.Height.ToString())",
    "$bmp.Dispose(); $icon.Dispose()",
  ].join("\n");
  try {
    const raw = await runPowerShellCommandAsync(ps);
    console.log(JSON.stringify({ code: c, size: fs.statSync(png).size, dim: String(raw).trim(), png }));
  } catch (e) {
    console.log(JSON.stringify({ code: c, error: String(e.message || e).slice(0, 200) }));
  }
}
console.log(JSON.stringify({ out }));
