/**
 * List live Stealth Cloak browser windows via native Toolhelp32Snapshot + NtQueryInformationProcess (<2ms, 0 PowerShell).
 * Falls back to Win32_Process PowerShell only if native koffi bindings are unavailable.
 */
const fs = require("node:fs");
const { buildListLiveCloakWindowsPs } = require("./chrome-process-query.cjs");
const { runPowerShellCommand } = require("./powershell-exec.cjs");
const { scanChromeProcessesNative } = require("./profile-browser-orphan.cjs");

/**
 * @param {{ firstOnly?: boolean }} [opts]
 * @returns {{ dir: string, browserPid: number }[]}
 */
function listLiveCloakWindows(opts = {}) {
  if (process.platform !== "win32") return [];
  const { firstOnly = false } = opts;
  try {
    const nativeRows = scanChromeProcessesNative({ forceFresh: true });
    if (Array.isArray(nativeRows)) {
      const byDir = new Map();
      for (const row of nativeRows) {
        const cmdLower = String(row?.cmdLower || "");
        if (!cmdLower || cmdLower.includes("--type=") || cmdLower.includes("--headless")) continue;
        if (!cmdLower.includes("stealth-browser-console") && !cmdLower.includes("stealthbrowser")) {
          continue;
        }
        const rawCmd = String(row?.cmd || row?.cmdLower || "");
        const m = rawCmd.match(/--user-data-dir=(?:"([^"]+)"|(\S+))/i);
        const dir = String(m?.[1] || m?.[2] || "").trim();
        const pid = Number(row?.pid) || 0;
        if (!dir || !(pid > 0)) continue;
        const key = dir.toLowerCase();
        if (!byDir.has(key)) {
          byDir.set(key, { dir, browserPid: pid });
          if (firstOnly) break;
        }
      }
      return [...byDir.values()];
    }
  } catch {
    /* fall through to legacy PowerShell */
  }
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
