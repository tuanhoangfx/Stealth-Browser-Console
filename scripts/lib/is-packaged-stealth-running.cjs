#!/usr/bin/env node
"use strict";
/** True when packaged Stealth Browser Console.exe is running (not dev electron). */
const { spawnSync } = require("node:child_process");

function isPackagedStealthRunning() {
  if (process.platform !== "win32") return false;
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "@(Get-Process -Name 'Stealth Browser Console' -ErrorAction SilentlyContinue).Count",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
  );
  const count = Number(String(ps.stdout || "").trim()) || 0;
  return count > 0;
}

module.exports = { isPackagedStealthRunning };
