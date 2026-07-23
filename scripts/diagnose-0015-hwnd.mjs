import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { runPowerShellCommandAsync } = require("../electron/lib/powershell-exec.cjs");
const { listLiveCloakWindows } = require("../electron/lib/list-live-cloak-windows.cjs");
const { extractProfileCode } = require("../electron/lib/profile-code.cjs");
const path = require("node:path");

const live = listLiveCloakWindows();
const map = new Map();
for (const port of ["http://127.0.0.1:6004", "http://127.0.0.1:6003"]) {
  try {
    const res = await fetch(`${port}/api/profiles`);
    const json = await res.json();
    for (const p of json.profiles || []) map.set(p.id, extractProfileCode(p.name, p.id));
    if (map.size) break;
  } catch {}
}
const row = live.find((l) => map.get(path.basename(l.dir)) === "0015") || live[0];
if (!row) {
  console.log("no live");
  process.exit(2);
}
const procId = row.browserPid;
const code = map.get(path.basename(row.dir));
console.log(JSON.stringify({ code, procId, dir: row.dir }));

const ps = `
$procId = ${procId}
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue
if ($p) { Write-Output ("main=" + [int64]$p.MainWindowHandle + " title=[" + $p.MainWindowTitle + "]") } else { Write-Output 'gone' }
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class T2 {
  public delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Cb cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
'@
[T2]::EnumWindows({
  param($h, $l)
  [uint32]$w = 0
  [T2]::GetWindowThreadProcessId($h, [ref]$w) | Out-Null
  if ($w -ne $procId) { return $true }
  $sb = New-Object System.Text.StringBuilder 256
  [T2]::GetWindowText($h, $sb, 256) | Out-Null
  Write-Output ("hwnd=" + [int64]$h + " vis=" + [T2]::IsWindowVisible($h) + " iconic=" + [T2]::IsIconic($h) + " title=[" + $sb.ToString() + "]")
  return $true
}, [IntPtr]::Zero) | Out-Null
`;
console.log(await runPowerShellCommandAsync(ps));
