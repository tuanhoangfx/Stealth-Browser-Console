const fs = require("node:fs");
const path = require("node:path");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), "utf8");
}

/**
 * Chromium shows "Restore pages?" when exit_type is Crashed / unclean shutdown.
 * Patch prefs before launch and after force-kill so the next open is clean.
 */
function markProfileChromeCleanExit(userDataDir) {
  if (!userDataDir) return { ok: false };
  const base = path.resolve(String(userDataDir));
  let changed = 0;

  const prefsFile = path.join(base, "Default", "Preferences");
  const prefs = readJson(prefsFile);
  if (prefs) {
    prefs.profile = prefs.profile || {};
    prefs.profile.exit_type = "Normal";
    prefs.exited_cleanly = true;
    if (prefs.sessions && typeof prefs.sessions === "object") {
      prefs.sessions.session_data_status = 0;
    }
    writeJson(prefsFile, prefs);
    changed += 1;
  }

  const localStateFile = path.join(base, "Local State");
  const localState = readJson(localStateFile);
  if (localState?.profile?.info_cache?.Default) {
    localState.profile.info_cache.Default.exit_type = "Normal";
    writeJson(localStateFile, localState);
    changed += 1;
  }

  return { ok: changed > 0, changed };
}

function chromeSessionRestoreSuppressionArgs() {
  return ["--disable-session-crashed-bubble", "--disable-features=InfiniteSessionRestore"];
}

module.exports = {
  markProfileChromeCleanExit,
  chromeSessionRestoreSuppressionArgs,
};
