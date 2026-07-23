/**
 * Diagnose taskbar HWND selection for live Cloak profiles.
 * Usage: node scripts/diagnose-taskbar-hwnd.mjs [code...]
 */
import { createRequire } from "node:module";
import path from "node:path";
import { runPowerShellCommandAsync } from "../electron/lib/powershell-exec.cjs";

const require = createRequire(import.meta.url);
const { listLiveCloakWindows } = require("../electron/lib/list-live-cloak-windows.cjs");
const { extractProfileCode } = require("../electron/lib/profile-code.cjs");

const filter = new Set(process.argv.slice(2).map((s) => String(s).padStart(4, "0").slice(-4)));

async function fetchCodes() {
  const map = new Map();
  for (const port of ["http://127.0.0.1:6004", "http://127.0.0.1:6003"]) {
    try {
      const res = await fetch(`${port}/api/profiles`);
      if (!res.ok) continue;
      const json = await res.json();
      for (const p of json.profiles || []) {
        map.set(p.id, extractProfileCode(p.name, p.id));
      }
      if (map.size) return map;
    } catch {
      /* next */
    }
  }
  return map;
}

const codeById = await fetchCodes();
const live = listLiveCloakWindows();
const rows = [];
for (const { dir, browserPid } of live) {
  const id = path.basename(dir);
  const code = codeById.get(id) || extractProfileCode("", id);
  if (filter.size && !filter.has(code)) continue;
  rows.push({ dir, browserPid, code, id });
}

if (!rows.length) {
  console.error("no matching live windows");
  process.exit(2);
}

const ps = `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class Dx {
  public delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Cb cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int L,T,R,B; }
}
'@
$payload = @'
${JSON.stringify(rows)}
'@ | ConvertFrom-Json
$out = @()
foreach ($row in $payload) {
  $procId = [int]$row.browserPid
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  $cmd = ''
  try {
    $cmd = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $procId) -ErrorAction SilentlyContinue).CommandLine
  } catch {}
  $wins = New-Object System.Collections.Generic.List[object]
  if ($procId -gt 0) {
    [Dx]::EnumWindows({
      param($h, $l)
      [uint32]$wpid = 0
      [Dx]::GetWindowThreadProcessId($h, [ref]$wpid) | Out-Null
      if ($wpid -ne $procId) { return $true }
      if (-not [Dx]::IsWindowVisible($h) -and -not [Dx]::IsIconic($h)) { return $true }
      $sb = New-Object System.Text.StringBuilder 512
      [Dx]::GetWindowText($h, $sb, $sb.Capacity) | Out-Null
      $r = New-Object Dx+RECT
      [Dx]::GetWindowRect($h, [ref]$r) | Out-Null
      $area = [Math]::Abs(($r.R - $r.L) * ($r.B - $r.T))
      $wins.Add([pscustomobject]@{ hwnd = [int64]$h; area = $area; title = $sb.ToString() })
      return $true
    }, [IntPtr]::Zero) | Out-Null
  }
  $top = @($wins | Sort-Object area -Descending | Select-Object -First 6)
  $out += [pscustomobject]@{
    code = $row.code
    pid = $procId
    mainHwnd = if ($p) { [int64]$p.MainWindowHandle } else { 0 }
    mainTitle = if ($p) { [string]$p.MainWindowTitle } else { '' }
    hasType = if ($cmd -match '--type=') { $true } else { $false }
    cmdHasProfile = if ($cmd -match [regex]::Escape($row.id)) { $true } else { $false }
    windows = $top
  }
}
$out | ConvertTo-Json -Depth 5 -Compress
`;

const raw = await runPowerShellCommandAsync(ps);
console.log(raw.trim());
