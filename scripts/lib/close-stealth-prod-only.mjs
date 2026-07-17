#!/usr/bin/env node
/** Close packaged Setup.exe only — never dev Electron (stealth-browser-console-dev). */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { closePackagedStealth } from "../close-packaged-stealth.mjs";
import { winSpawnOpts } from "./win-spawn.mjs";

/** Kill prod API holder on :6003 if still alive after packaged close (orphan). */
function killProdApiOrphans() {
  if (process.platform !== "win32") return;
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "$procs = Get-CimInstance Win32_Process -Filter \"Name='Stealth Browser Console'\" -ErrorAction SilentlyContinue",
        "| Where-Object { $_.CommandLine -notmatch 'stealth-browser-console-dev' }",
        "foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }",
      ].join(" "),
    ],
    winSpawnOpts({ stdio: "ignore" }),
  );
}

/** Kill packaged Setup.exe only — never implicit agent/dev default. */
export function closeStealthProdOnly({ allowKill = false } = {}) {
  const permitted =
    allowKill ||
    process.env.STEALTH_KILL_PACKAGED === "1" ||
    process.env.STEALTH_ALLOW_KILL_PACKAGED === "1";
  if (!permitted) {
    return { killed: 0, skipped: true, reason: "kill-packaged-not-allowed" };
  }
  const { killed } = closePackagedStealth();
  killProdApiOrphans();
  if (process.platform === "win32") {
    spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        [
          "$deadline = (Get-Date).AddSeconds(12)",
          "do {",
          "  $left = @(Get-CimInstance Win32_Process -Filter \"Name='Stealth Browser Console.exe'\" -ErrorAction SilentlyContinue",
          "    | Where-Object { $_.CommandLine -notmatch 'stealth-browser-console-dev' })",
          "  foreach ($p in $left) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }",
          "  if (-not $left.Count) { break }",
          "  Start-Sleep -Milliseconds 400",
          "} while ((Get-Date) -lt $deadline)",
        ].join(" "),
      ],
      winSpawnOpts({ stdio: "ignore" }),
    );
  }
  return { killed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { killed } = closeStealthProdOnly({ allowKill: true });
  console.log(`close-stealth-prod-only: killed ${killed ?? 0} prod process(es)`);
}
