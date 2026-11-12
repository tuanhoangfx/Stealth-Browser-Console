const { execSync } = require("node:child_process");
const { createRequire } = require("node:module");
const path = require("node:path");

const requireRoot = createRequire(__filename);
const { DEFAULT_PROD_API_PORT, DEFAULT_DEV_API_PORT } = requireRoot("../electron/lib/user-data-root.cjs");

let winNative = null;
try {
  winNative = requireRoot(path.resolve(__dirname, "../../scripts/lib/win-native-proc-net.mjs"));
} catch {
  /* fallback to netstat / tasklist if ESM require or koffi unavailable */
}

function isProtectedDevElectronPid(pid) {
  if (winNative && typeof winNative.readProcessExePathNative === "function") {
    const exe = winNative.readProcessExePathNative(pid);
    if (exe !== null) return /electron\.exe$/i.test(exe);
  }
  try {
    const tl = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    return /electron\.exe/i.test(tl);
  } catch {
    return false;
  }
}

function freePorts(portList, { silent = false } = {}) {
  const protectedPorts = new Set([DEFAULT_PROD_API_PORT]);
  if (process.env.STEALTH_KILL_ALLOW_PROD !== "1") {
    for (const port of portList) {
      if (protectedPorts.has(port)) {
        throw new Error(`[kill-port] refused protected prod port :${port} (packaged Stealth API)`);
      }
    }
  }

  for (const port of portList) {
    try {
      if (process.platform === "win32") {
        let pids = null;
        if (winNative && typeof winNative.findListeningPidsByPortNative === "function") {
          const natPids = winNative.findListeningPidsByPortNative(port);
          if (Array.isArray(natPids)) pids = new Set(natPids.map(String));
        }
        if (!pids) {
          pids = new Set();
          try {
            const out = execSync(`netstat -ano | findstr ":${port} "`, {
              encoding: "utf8",
              stdio: ["pipe", "pipe", "ignore"],
              windowsHide: true,
            });
            for (const line of out.split(/\r?\n/)) {
              if (!line.includes("LISTENING")) continue;
              const parts = line.trim().split(/\s+/);
              const pid = parts[parts.length - 1];
              if (pid && /^\d+$/.test(pid)) pids.add(pid);
            }
          } catch {
            /* port free */
          }
        }
        for (const pid of pids) {
          if (port === DEFAULT_DEV_API_PORT && process.env.STEALTH_FORCE_KILL_DEV !== "1") {
            if (isProtectedDevElectronPid(pid)) {
              if (!silent) {
                console.log(
                  `[kill-port] Protected Dev Exe GUI electron.exe on :${port} (PID ${pid}) — skipping kill without STEALTH_FORCE_KILL_DEV=1`,
                );
              }
              continue;
            }
          }
          let killed = false;
          if (winNative && typeof winNative.terminatePidNative === "function") {
            killed = winNative.terminatePidNative(Number(pid));
          }
          if (!killed) {
            try {
              execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore", windowsHide: true });
              killed = true;
            } catch {
              /* already gone */
            }
          }
          if (killed && !silent) console.log(`[kill-port] Freed :${port} (PID ${pid})`);
        }
        if (pids.size === 0 && !silent) console.log(`[kill-port] :${port} is free`);
      } else {
        execSync(`lsof -ti :${port} | xargs -r kill -9`, { stdio: "ignore", shell: true });
        if (!silent) console.log(`[kill-port] Freed :${port}`);
      }
    } catch {
      if (!silent) console.log(`[kill-port] :${port} is free`);
    }
  }
}

if (require.main === module) {
  const ports = process.argv.slice(2).map((p) => Number(p)).filter((p) => p > 0);
  if (ports.length === 0) {
    console.error("Usage: node scripts/kill-port.cjs <port> [port2 ...]");
    process.exit(1);
  }
  try {
    freePorts(ports);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

module.exports = { freePorts };
