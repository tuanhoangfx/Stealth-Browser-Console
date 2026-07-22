/**
 * List live Stealth Cloak browser windows via Win32_Process (chrome.exe main process).
 * Shared by batch badge apply + smoke scripts — avoids duplicate WMI PowerShell blocks.
 */
const fs = require("node:fs");
const { buildListLiveCloakWindowsPs } = require("./chrome-process-query.cjs");
const { runPowerShellCommand } = require("./powershell-exec.cjs");

/**
 * @param {{ firstOnly?: boolean }} [opts]
 * @returns {{ dir: string, browserPid: number }[]}
 */
function listLiveCloakWindows(opts = {}) {
  if (process.platform !== "win32") return [];
  const { firstOnly = false } = opts;
  try {
    const out = runPowerShellCommand(buildListLiveCloakWindowsPs({ firstOnly }));
    const raw = String(out).trim();
    if (!raw) return [];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const byDir = new Map();
    for (const row of rows) {
      const dir = String(row?.dir || "").trim();
      const pid = Number(row?.pid) || 0;
      if (!dir) continue;
      if (!byDir.has(dir)) byDir.set(dir, { dir, browserPid: pid });
    }
    return [...byDir.values()];
  } catch {
    return [];
  }
}

/** @returns {string} first live profile userDataDir or "" */
function findFirstLiveCloakUserDataDir() {
  const dir = listLiveCloakWindows({ firstOnly: true })[0]?.dir || "";
  if (dir && fs.existsSync(dir)) return dir;
  return "";
}

module.exports = {
  listLiveCloakWindows,
  findFirstLiveCloakUserDataDir,
};
