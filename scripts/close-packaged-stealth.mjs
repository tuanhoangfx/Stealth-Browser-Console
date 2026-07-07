#!/usr/bin/env node
/** Close packaged Stealth installs — keeps dev Electron + Vite untouched. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { winSpawnOpts } from "./lib/win-spawn.mjs";

const EXE = "Stealth Browser Console.exe";

export function closePackagedStealth() {
  if (process.platform !== "win32") return { killed: 0 };
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "$dev = Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" -ErrorAction SilentlyContinue",
        "| Where-Object { $_.CommandLine -match 'P0003-Stealth-Browser-Console' }",
        "$devPids = @($dev | ForEach-Object { $_.ProcessId })",
        "$procs = Get-Process -Name 'Stealth Browser Console' -ErrorAction SilentlyContinue",
        "| Where-Object { $devPids -notcontains $_.Id }",
        "$count = @($procs).Count",
        "if ($count -gt 0) { $procs | Stop-Process -Force }",
        "Write-Output $count",
      ].join(" "),
    ],
    winSpawnOpts({ encoding: "utf8" }),
  );
  const killed = Number(String(ps.stdout || "").trim()) || 0;
  return { killed };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const { killed } = closePackagedStealth();
  console.log(killed ? `desktop:close-packaged: stopped ${killed} instance(s)` : "desktop:close-packaged: none running");
}
