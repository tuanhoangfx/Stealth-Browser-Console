const path = require("node:path");
const { execFile } = require("node:child_process");
const { isIdentityDebugEnabled } = require("./app-settings.cjs");
const { profileIdentityUiEnabled } = require("./profile-identity-ui.cjs");

const POLL_MS = 600;
const MAX_ATTEMPTS = 20;
const PS1 = path.join(__dirname, "..", "scripts", "set-taskbar-profile-icon.ps1");

function taskbarOverlayEnabled() {
  const raw = String(process.env.STEALTH_TASKBAR_OVERLAY ?? "0").toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function identityDebugEnabled() {
  return isIdentityDebugEnabled();
}

function logIdentityDebug(message, extra) {
  if (!identityDebugEnabled()) return;
  if (extra !== undefined) console.log(`[identity-taskbar] ${message}`, extra);
  else console.log(`[identity-taskbar] ${message}`);
}

function runTaskbarIcon(args) {
  const scriptArgs = identityDebugEnabled() ? ["-Debug", ...args] : args;
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PS1, ...scriptArgs],
      { windowsHide: true, timeout: 25000 },
      (error, stdout, stderr) => {
        if (error) {
          logIdentityDebug("powershell error", { args, stdout: String(stdout || ""), stderr: String(stderr || ""), message: error.message });
          reject(new Error(String(stderr || stdout || error.message || "taskbar icon failed")));
          return;
        }
        const out = String(stdout || "");
        const err = String(stderr || "");
        if (err.trim()) logIdentityDebug("powershell stderr", { args, stderr: err.trim() });
        resolve(out);
      },
    );
  });
}

function parseTaskbarOutput(stdout) {
  const lines = String(stdout || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1] || "0";
  const count = Number(last);
  if (!Number.isNaN(count) && String(count) === last) return count;
  const match = last.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

async function applyWindowsTaskbarOverlay(userDataDir, code, label, profileId, chipText = "") {
  if (!profileIdentityUiEnabled() || process.platform !== "win32" || !taskbarOverlayEnabled()) return 0;
  const args = [
    "-ProfileId",
    String(profileId || ""),
    "-Code",
    String(code || "0000"),
    "-UserDataDir",
    String(userDataDir || ""),
    "-Tooltip",
    String(label || ""),
    "-ChipText",
    String(chipText || `[${code || "0000"}]`),
  ];
  logIdentityDebug("apply start", { profileId, code, userDataDir });
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const out = await runTaskbarIcon(args);
      const count = parseTaskbarOutput(out);
      logIdentityDebug(`attempt ${attempt + 1}/${MAX_ATTEMPTS}`, { count, raw: out.trim() });
      if (count > 0) {
        logIdentityDebug("apply ok", { count });
        return count;
      }
    } catch (error) {
      logIdentityDebug(`attempt ${attempt + 1} failed`, error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  logIdentityDebug("apply exhausted retries — 0 windows matched");
  return 0;
}

async function clearWindowsTaskbarOverlay(userDataDir, profileId) {
  if (!profileIdentityUiEnabled() || process.platform !== "win32") return 0;
  try {
    const out = await runTaskbarIcon([
      "-ProfileId",
      String(profileId || ""),
      "-Code",
      "0000",
      "-UserDataDir",
      String(userDataDir || ""),
      "-Clear",
    ]);
    return parseTaskbarOutput(out);
  } catch {
    return 0;
  }
}

module.exports = { applyWindowsTaskbarOverlay, clearWindowsTaskbarOverlay, identityDebugEnabled };
