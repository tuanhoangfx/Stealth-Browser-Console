const fs = require("node:fs");
const path = require("node:path");
const {
  killOrphanProfileBrowser,
  hasProfileBrowserProcess,
  PROFILE_LOCK_FILES,
} = require("./profile-browser-orphan.cjs");

function removeStaleProfileLocks(userDataDir) {
  for (const name of PROFILE_LOCK_FILES) {
    const file = path.join(userDataDir, name);
    if (!fs.existsSync(file)) continue;
    try {
      fs.unlinkSync(file);
    } catch {
      // live process still holds the lock
    }
  }
}

function removeStaleProfileArtifacts(userDataDir) {
  removeStaleProfileLocks(userDataDir);
  for (const name of ["DevToolsActivePort", "chrome_shutdown_ms.txt"]) {
    const file = path.join(userDataDir, name);
    if (!fs.existsSync(file)) continue;
    try {
      fs.unlinkSync(file);
    } catch {
      // best-effort
    }
  }
}

async function waitForProfileUnlock(userDataDir, { timeoutMs = 1400, intervalMs = 70 } = {}) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    removeStaleProfileArtifacts(userDataDir);
    const hasLockFiles = PROFILE_LOCK_FILES.some((name) => fs.existsSync(path.join(userDataDir, name)));
    const hasLiveProcess = await hasProfileBrowserProcess(userDataDir);
    if (!hasLockFiles && !hasLiveProcess) {
      return { released: true, waitedMs: Date.now() - start };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  removeStaleProfileArtifacts(userDataDir);
  const hasLockFiles = PROFILE_LOCK_FILES.some((name) => fs.existsSync(path.join(userDataDir, name)));
  const hasLiveProcess = await hasProfileBrowserProcess(userDataDir);
  return {
    released: !hasLockFiles && !hasLiveProcess,
    waitedMs: Date.now() - start,
    hasLockFiles,
    hasLiveProcess,
  };
}

/** Kill orphan Chrome + clear singleton locks before launch/retry. */
async function repairProfileUserDataDir(userDataDir) {
  if (!userDataDir) return { repaired: false };
  await killOrphanProfileBrowser(userDataDir);
  const unlock = await waitForProfileUnlock(userDataDir);
  return { repaired: true, ...unlock };
}

/** Delete profile Chrome dir after kill + lock cleanup (delete/replace). */
async function purgeProfileUserDataDir(userDataDir) {
  if (!userDataDir) return { purged: false };
  await killOrphanProfileBrowser(userDataDir);
  removeStaleProfileArtifacts(userDataDir);
  try {
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 120 });
    }
    return { purged: true };
  } catch {
    return { purged: false };
  }
}

const SIDECAR_PID_FILE = "stealth-pid.json";

/** Write PID/CDP metadata into profile dir so orphan recovery can find it fast. */
function writeSidecarPid(userDataDir, { pid, debugPort = 0 }) {
  if (!userDataDir) return;
  try {
    const file = path.join(userDataDir, SIDECAR_PID_FILE);
    fs.writeFileSync(file, JSON.stringify({ pid, debugPort, launchedAt: Date.now() }));
  } catch {
    // best-effort — dir may not exist yet
  }
}

/** Read sidecar PID metadata (fast path for orphan detection). */
function readSidecarPid(userDataDir) {
  if (!userDataDir) return null;
  try {
    const file = path.join(userDataDir, SIDECAR_PID_FILE);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (data && typeof data.pid === "number" && data.pid > 0) return data;
    return null;
  } catch {
    return null;
  }
}

/** Remove sidecar PID file on clean close. */
function removeSidecarPid(userDataDir) {
  if (!userDataDir) return;
  try {
    const file = path.join(userDataDir, SIDECAR_PID_FILE);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    // best-effort
  }
}

module.exports = {
  PROFILE_LOCK_FILES,
  SIDECAR_PID_FILE,
  removeStaleProfileLocks,
  removeStaleProfileArtifacts,
  waitForProfileUnlock,
  repairProfileUserDataDir,
  purgeProfileUserDataDir,
  writeSidecarPid,
  readSidecarPid,
  removeSidecarPid,
};
