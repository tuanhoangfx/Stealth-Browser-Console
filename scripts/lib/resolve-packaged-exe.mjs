/** Resolve packaged Stealth exe — installed Prod first, never a repo win-unpacked build. */
import fs from "node:fs";
import path from "node:path";
import { readPeProductVersion } from "../../../scripts/lib/win-native-utils.mjs";

export const PACKAGED_EXE_NAME = "Stealth Browser Console.exe";

export function readExeProductVersion(exePath) {
  return readPeProductVersion(exePath);
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
  const installed = path.join(localAppData, "Programs", "stealth-browser-console", PACKAGED_EXE_NAME);
  if (fs.existsSync(installed)) return installed;
  const candidates = [
    path.join(root, "dist-desktop", "win-unpacked-pending", PACKAGED_EXE_NAME),
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
