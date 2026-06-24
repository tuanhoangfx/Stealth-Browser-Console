/** Resolve headless Electron smoke URL — prefer built dist over flaky Vite dev HMR. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function fileUrlFromPath(absPath) {
  return `file:///${path.resolve(absPath).replace(/\\/g, "/")}`;
}

/**
 * @param {string | undefined} arg CLI arg — http(s), file:, or relative path to index.html
 * @param {{ preferDist?: boolean }} opts
 */
export function resolveSmokeAppUrl(arg, { preferDist = true } = {}) {
  if (arg && arg.trim()) {
    const trimmed = arg.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("file:")) {
      return trimmed;
    }
    return fileUrlFromPath(path.join(root, trimmed));
  }

  const distIndex = path.join(root, "dist", "index.html");
  if (preferDist && fs.existsSync(distIndex)) {
    return fileUrlFromPath(distIndex);
  }

  return "http://127.0.0.1:5175/";
}

export { root as smokeProjectRoot };
