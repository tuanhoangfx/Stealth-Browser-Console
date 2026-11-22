/** Resolve packaged Stealth exe — installed Prod first, never a repo win-unpacked build. */
import fs from "node:fs";
import path from "node:path";
import { cleanDesktopElectronEnv, isDesktopInstallLocked } from "../../../scripts/lib/desktop-exe-products.mjs";
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

/** Strip agent smoke env and SxS sandbox home overrides so packaged profiles launch headed on real userData. */
export function packagedStealthSpawnEnv(baseEnv = process.env) {
  return cleanDesktopElectronEnv(baseEnv);
}

export function resolvePackagedStealthExe(root, { target = "auto" } = {}) {
  const localAppData = cleanDesktopElectronEnv().LOCALAPPDATA || process.env.LOCALAPPDATA || "";
  const devRoot = path.resolve(root, "..", "..");
  const installed = localAppData
    ? path.join(localAppData, "Programs", "stealth-browser-console", PACKAGED_EXE_NAME)
    : "";
  if (target === "installed") {
    return installed && fs.existsSync(installed) ? installed : null;
  }
  if (target !== "unpacked" && installed && fs.existsSync(installed)) {
    return installed;
  }
  // Never fall back to repo win-unpacked while NSIS installer is replacing %LOCALAPPDATA%\Programs\stealth-browser-console
  if (target !== "unpacked" && isDesktopInstallLocked(devRoot, "P0003")) {
    return null;
  }
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
