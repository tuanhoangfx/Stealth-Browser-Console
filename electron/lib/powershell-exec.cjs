/**
 * Shared PowerShell launcher (Win32 taskbar badge + live window probes).
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFile, execFileSync } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function resolvePowerShell() {
  const root = process.env.SystemRoot || "C:\\Windows";
  const sysnative = path.join(root, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (fs.existsSync(sysnative)) return sysnative;
  return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** PS1 must live on a real disk path — not inside app.asar (PowerShell -File cannot read asar). */
function resolveElectronLibScript(fileName) {
  const local = path.join(__dirname, fileName);
  if (fs.existsSync(local)) return local;
  const unpacked = local.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  );
  if (unpacked !== local && fs.existsSync(unpacked)) return unpacked;
  return local;
}

function runPowerShellCommand(command, opts = {}) {
  return execFileSync(
    resolvePowerShell(),
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8", windowsHide: true, timeout: 20_000, ...opts },
  );
}

async function runPowerShellFile(ps1Path, args = [], opts = {}) {
  return execFileAsync(
    resolvePowerShell(),
    ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", ps1Path, ...args],
    { timeout: 15_000, windowsHide: true, ...opts },
  );
}

async function runPowerShellCommandAsync(command, opts = {}) {
  const { stdout } = await execFileAsync(
    resolvePowerShell(),
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8", windowsHide: true, timeout: 20_000, ...opts },
  );
  return stdout;
}

module.exports = {
  resolvePowerShell,
  resolveElectronLibScript,
  runPowerShellCommand,
  runPowerShellCommandAsync,
  runPowerShellFile,
};
