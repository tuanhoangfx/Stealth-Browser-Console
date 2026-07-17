/** Resolve packaged Stealth exe — prefer newest build / NSIS install over stale win-unpacked. */
import fs from "node:fs";
import path from "node:path";

export const PACKAGED_EXE_NAME = "Stealth Browser Console.exe";

export function readExeProductVersion(exePath) {
  if (process.platform !== "win32" || !fs.existsSync(exePath)) return "";
  try {
    const { spawnSync } = require("node:child_process");
    const ps = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-Item '${exePath.replace(/'/g, "''")}').VersionInfo.ProductVersion`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return String(ps.stdout || "").trim();
  } catch {
    return "";
  }
}

function versionKey(version) {
  const parts = String(version || "0").split(".").map((n) => Number(n) || 0);
  while (parts.length < 3) parts.push(0);
  return parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2];
}

/** Strip agent smoke env so packaged profiles launch headed (visible Chrome). */
export function packagedStealthSpawnEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  delete env.STEALTH_AGENT_SMOKE;
  delete env.STEALTH_HEADLESS_SMOKE;
  delete env.CURSOR_AGENT;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

export function resolvePackagedStealthExe(root) {
  const localAppData = process.env.LOCALAPPDATA || "";
  const candidates = [
    path.join(root, "dist-desktop", "win-unpacked-pending", PACKAGED_EXE_NAME),
    path.join(localAppData, "Programs", "stealth-browser-console", PACKAGED_EXE_NAME),
    path.join(root, "dist-desktop", "win-unpacked", PACKAGED_EXE_NAME),
    path.join(root, "out", "win-unpacked", PACKAGED_EXE_NAME),
  ].filter((candidate) => fs.existsSync(candidate));

  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestKey = versionKey(readExeProductVersion(best));
  for (const candidate of candidates.slice(1)) {
    const key = versionKey(readExeProductVersion(candidate));
    if (key >= bestKey) {
      best = candidate;
      bestKey = key;
    }
  }
  return best;
}
