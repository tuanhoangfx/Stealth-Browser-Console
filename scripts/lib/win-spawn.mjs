/** Minimal spawn helpers — standalone repo (no E:\\Dev workspace dep). */
import fs from "node:fs";
import path from "node:path";

export function resolveNodeExe() {
  if (process.platform !== "win32") return process.execPath;
  const sys = path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe");
  if (fs.existsSync(sys)) return sys;
  return process.execPath;
}

export function canonicalRealpathSync(targetPath) {
  if (!targetPath) return targetPath;
  try {
    return typeof fs.realpathSync?.native === "function"
      ? fs.realpathSync.native(targetPath)
      : fs.realpathSync(targetPath);
  } catch {
    return targetPath;
  }
}

export function winSpawnOpts(opts = {}) {
  const next = opts.cwd ? { ...opts, cwd: canonicalRealpathSync(opts.cwd) } : { ...opts };
  if (process.platform !== "win32") return next;
  return { ...next, windowsHide: true };
}
