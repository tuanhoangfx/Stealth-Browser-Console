const fs = require("node:fs");
const path = require("node:path");
const { killOrphanProfileBrowser } = require("./profile-browser-orphan.cjs");

const PROFILE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "lockfile", "SingletonSocket", "SingletonBadge"];

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

/** Kill orphan Chrome + clear singleton locks before launch/retry. */
async function repairProfileUserDataDir(userDataDir) {
  if (!userDataDir) return { repaired: false };
  await killOrphanProfileBrowser(userDataDir);
  removeStaleProfileArtifacts(userDataDir);
  return { repaired: true };
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

module.exports = {
  PROFILE_LOCK_FILES,
  removeStaleProfileLocks,
  removeStaleProfileArtifacts,
  repairProfileUserDataDir,
  purgeProfileUserDataDir,
};
