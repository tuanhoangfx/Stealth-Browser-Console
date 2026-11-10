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
 * When `startupUrl` is a valid HTTP(S) URL, also pre-seeds `session.restore_on_startup = 4`
 * and `session.startup_urls = [startupUrl]` so Chromium opens the startup URL directly at t=0ms
 * without pausing on a white `about:blank` or `New Tab` screen.
 */
const _cleanExitCache = new Map();
const CLEAN_EXIT_CACHE_TTL_MS = 10_000;

function markProfileChromeCleanExit(userDataDir, options = {}) {
  if (!userDataDir) return { ok: false };
  const base = path.resolve(String(userDataDir));
  let wa = options?.targetWorkArea;
  if (!wa) {
    try {
      const { resolveTargetDisplayWorkArea } = require("./app-settings.cjs");
      wa = resolveTargetDisplayWorkArea()?.workArea || null;
    } catch {
      wa = null;
    }
  }
  const isMaximized = options?.windowMode !== "preset-viewport" && options?.windowMode !== "engine-default";
  const waKey =
    wa && Number.isFinite(wa.x) && Number.isFinite(wa.y)
      ? `${wa.x},${wa.y},${wa.width},${wa.height},${isMaximized ? 1 : 0}`
      : "none";
  const prefsFile = path.join(base, "Default", "Preferences");
  const nowMs = Date.now();
  const cached = _cleanExitCache.get(base);
  if (cached && nowMs - cached.at < CLEAN_EXIT_CACHE_TTL_MS && cached.waKey === waKey) {
    try {
      const st = fs.statSync(prefsFile);
      if (st.size > 4096 && st.mtimeMs === cached.prefsMtime && st.size === cached.prefsSize) {
        return { ok: true, changed: 0 };
      }
    } catch {
      /* fall through */
    }
  }

  let changed = 0;
  let prefsDirty = false;
  const prefsExisted = fs.existsSync(prefsFile);
  const prefs = readJson(prefsFile) || {};
  if (!prefsExisted) prefsDirty = true;
  prefs.profile = prefs.profile || {};
  if (prefs.profile.exit_type !== "Normal") {
    prefs.profile.exit_type = "Normal";
    prefsDirty = true;
  }
  if (prefs.exited_cleanly !== true) {
    prefs.exited_cleanly = true;
    prefsDirty = true;
  }
  if (prefs.sessions && typeof prefs.sessions === "object" && prefs.sessions.session_data_status !== 0) {
    prefs.sessions.session_data_status = 0;
    prefsDirty = true;
  }
  if (prefs.session && typeof prefs.session === "object" && prefs.session.restore_on_startup === 4) {
    delete prefs.session.restore_on_startup;
    delete prefs.session.startup_urls;
    prefsDirty = true;
  }
  if (
    wa &&
    Number.isFinite(wa.x) &&
    Number.isFinite(wa.y) &&
    Number.isFinite(wa.width) &&
    Number.isFinite(wa.height) &&
    wa.width > 200 &&
    wa.height > 200
  ) {
    prefs.browser = prefs.browser && typeof prefs.browser === "object" ? prefs.browser : {};
    const prevWp =
      prefs.browser.window_placement && typeof prefs.browser.window_placement === "object"
        ? prefs.browser.window_placement
        : {};
    const wantRight = wa.x + wa.width;
    const wantBottom = wa.y + wa.height;
    if (
      prevWp.left !== wa.x ||
      prevWp.top !== wa.y ||
      prevWp.right !== wantRight ||
      prevWp.bottom !== wantBottom ||
      prevWp.maximized !== isMaximized ||
      prevWp.work_area_left !== wa.x ||
      prevWp.work_area_top !== wa.y ||
      prevWp.work_area_right !== wantRight ||
      prevWp.work_area_bottom !== wantBottom
    ) {
      prefs.browser.window_placement = {
        ...prevWp,
        left: wa.x,
        top: wa.y,
        right: wantRight,
        bottom: wantBottom,
        maximized: isMaximized,
        work_area_left: wa.x,
        work_area_top: wa.y,
        work_area_right: wantRight,
        work_area_bottom: wantBottom,
      };
      prefsDirty = true;
    }
  }
  if (prefsDirty) {
    try {
      writeJson(prefsFile, prefs);
      changed += 1;
    } catch {
      /* ignore */
    }
  }

  const localStateFile = path.join(base, "Local State");
  const localState = readJson(localStateFile);
  if (localState?.profile?.info_cache?.Default && localState.profile.info_cache.Default.exit_type !== "Normal") {
    localState.profile.info_cache.Default.exit_type = "Normal";
    writeJson(localStateFile, localState);
    changed += 1;
  }

  try {
    const st = fs.statSync(prefsFile);
    if (st.size > 4096) {
      _cleanExitCache.set(base, {
        at: Date.now(),
        waKey,
        prefsMtime: st.mtimeMs,
        prefsSize: st.size,
      });
    }
  } catch {
    /* ignore */
  }

  return { ok: changed > 0 || prefsExisted, changed };
}

function chromeSessionRestoreSuppressionArgs() {
  return ["--disable-session-crashed-bubble", "--disable-features=InfiniteSessionRestore"];
}

module.exports = {
  markProfileChromeCleanExit,
  chromeSessionRestoreSuppressionArgs,
};
