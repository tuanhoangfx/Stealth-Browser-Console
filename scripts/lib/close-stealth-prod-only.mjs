#!/usr/bin/env node
/** Close packaged Setup.exe only — never dev Electron (stealth-browser-console-dev). */
import { spawnSync } from "node:child_process";

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

export function closeStealthProdOnly() {
  const { killed } = closePackagedStealth();
  killProdApiOrphans();
  return { killed };
}
