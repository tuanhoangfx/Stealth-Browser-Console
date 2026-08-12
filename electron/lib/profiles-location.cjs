/**
 * SSOT — where Chromium profile folders live (may differ from Electron userData).
 *
 * userData (DB / settings / extensions cache): always under AppData product root.
 * profilesRoot: default `{userData}/profiles`, or absolute path from config
 *   `{userData}/data/profiles-location.json` (portable across devices — no hard-coded D:).
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CONFIG_NAME = "profiles-location.json";
const CONFIG_VERSION = 1;
const PRODUCT_FOLDER = "StealthBrowser";
const MIN_SUGGEST_FREE_BYTES = 15 * 1024 * 1024 * 1024;

function configPath(userDataRoot) {
  return path.join(String(userDataRoot || ""), "data", CONFIG_NAME);
}

function defaultProfilesRoot(userDataRoot) {
  return path.join(path.resolve(String(userDataRoot || "")), "profiles");
}

function tryRealpath(dir) {
  try {
    return fs.realpathSync.native(dir);
  } catch {
    try {
      return fs.realpathSync(dir);
    } catch {
      return "";
    }
  }
}

function readProfilesLocationConfig(userDataRoot) {
  const file = configPath(userDataRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

function writeProfilesLocationConfig(userDataRoot, patch) {
  const file = configPath(userDataRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const prev = readProfilesLocationConfig(userDataRoot) || {};
  const next = {
    ...prev,
    ...patch,
    version: CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
  };
  if (next.profilesRoot != null) {
    next.profilesRoot = path.resolve(String(next.profilesRoot));
  }
  if (next.suggestedProfilesRoot) {
    next.suggestedProfilesRoot = path.resolve(String(next.suggestedProfilesRoot));
  }
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function isSamePath(a, b) {
  const left = path.resolve(String(a || ""));
  const right = path.resolve(String(b || ""));
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function countChildDirs(dir) {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

/** Fixed local drives excluding the volume that hosts userData (and usually the OS home). */
function listAlternateFixedDriveRoots(userDataRoot) {
  if (process.platform !== "win32") return [];
  const exclude = new Set();
  const addRoot = (p) => {
    try {
      const root = path.parse(path.resolve(p)).root;
      if (root) exclude.add(root.toUpperCase());
    } catch {
      /* ignore */
    }
  };
  addRoot(userDataRoot);
  addRoot(os.homedir());
  addRoot(process.env.SystemRoot || "C:\\Windows");

  const out = [];
  for (let i = 65; i <= 90; i += 1) {
    const letter = String.fromCharCode(i);
    const root = `${letter}:\\`;
    if (exclude.has(root.toUpperCase())) continue;
    try {
      if (!fs.existsSync(root)) continue;
      // Skip obvious floppies; USB often still appears — free-space heuristic filters later.
      if (letter === "A" || letter === "B") continue;
      out.push(root);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function driveFreeBytes(rootPath) {
  if (process.platform !== "win32") {
    try {
      // Node 18+ on some builds; fail soft
      const st = fs.statfsSync?.(rootPath);
      if (st) return Number(st.bfree) * Number(st.bsize);
    } catch {
      /* ignore */
    }
    return 0;
  }
  const drive = String(rootPath).slice(0, 2);
  const ps = [
    `$d = Get-PSDrive -Name '${drive[0]}' -ErrorAction SilentlyContinue`,
    "if ($d) { [int64]$d.Free } else { 0 }",
  ].join("; ");
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    { encoding: "utf8", windowsHide: true, timeout: 8000 },
  );
  const n = Number(String(r.stdout || "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Portable suggestion — never hard-codes D:.
 * Prefer largest alternate fixed volume with enough free space; else default under userData.
 */
function suggestProfilesRoot(userDataRoot) {
  const fallback = defaultProfilesRoot(userDataRoot);
  if (process.platform !== "win32") {
    // Keep profiles next to app data on macOS/Linux unless user changes in Settings.
    return fallback;
  }
  let best = null;
  for (const root of listAlternateFixedDriveRoots(userDataRoot)) {
    const free = driveFreeBytes(root);
    if (free < MIN_SUGGEST_FREE_BYTES) continue;
    const candidate = path.join(root, PRODUCT_FOLDER, "profiles");
    if (!best || free > best.free) {
      best = { free, candidate };
    }
  }
  return best ? best.candidate : fallback;
}

function resolveProfilesRoot(userDataRoot) {
  const cfg = readProfilesLocationConfig(userDataRoot);
  const configured = cfg?.profilesRoot ? String(cfg.profilesRoot).trim() : "";
  const root = configured ? path.resolve(configured) : defaultProfilesRoot(userDataRoot);
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch {
    /* launch paths still return intended root */
  }
  return root;
}

function resolveProfileUserDataDir(userDataRoot, profileId) {
  return path.join(resolveProfilesRoot(userDataRoot), String(profileId));
}

/**
 * First launch / upgrade: adopt junction targets, seed suggestion, never surprise-migrate.
 * @returns {object} effective config
 */
function ensureProfilesLocationInitialized(userDataRoot) {
  const existing = readProfilesLocationConfig(userDataRoot);
  const def = defaultProfilesRoot(userDataRoot);
  const suggested = suggestProfilesRoot(userDataRoot);

  if (existing && existing.version) {
    const patch = {};
    if (!existing.suggestedProfilesRoot) {
      patch.suggestedProfilesRoot = suggested;
    } else if (
      !existing.profilesRoot &&
      !isSamePath(existing.suggestedProfilesRoot, suggested)
    ) {
      patch.suggestedProfilesRoot = suggested;
    }
    if (
      !existing.profilesRoot &&
      !isSamePath(suggested, def) &&
      existing.promptPending !== false
    ) {
      patch.promptPending = true;
    }
    if (Object.keys(patch).length) {
      return writeProfilesLocationConfig(userDataRoot, patch);
    }
    return existing;
  }

  const real = tryRealpath(def);

  // Reparse point (junction/symlink) → persist physical path (this machine's D: migrate case).
  if (real && !isSamePath(real, def) && countChildDirs(real) + countChildDirs(def) > 0) {
    return writeProfilesLocationConfig(userDataRoot, {
      profilesRoot: real,
      suggestedProfilesRoot: suggested,
      promptPending: false,
      source: "adopt-reparse",
    });
  }

  if (countChildDirs(def) > 0) {
    return writeProfilesLocationConfig(userDataRoot, {
      profilesRoot: null,
      suggestedProfilesRoot: suggested,
      promptPending: !isSamePath(suggested, def),
      source: "default-inplace",
    });
  }

  // Fresh install: stay on default until user confirms; surface suggestion in Settings.
  return writeProfilesLocationConfig(userDataRoot, {
    profilesRoot: null,
    suggestedProfilesRoot: suggested,
    promptPending: !isSamePath(suggested, def),
    source: "first-run",
  });
}

function getProfilesLocationInfo(userDataRoot) {
  const cfg = ensureProfilesLocationInitialized(userDataRoot);
  const def = defaultProfilesRoot(userDataRoot);
  const root = resolveProfilesRoot(userDataRoot);
  const suggested = cfg.suggestedProfilesRoot || suggestProfilesRoot(userDataRoot);
  return {
    userDataRoot: path.resolve(String(userDataRoot || "")),
    profilesRoot: root,
    defaultProfilesRoot: def,
    suggestedProfilesRoot: suggested,
    usingCustom: !isSamePath(root, def),
    promptPending: Boolean(cfg.promptPending) && !isSamePath(suggested, root),
    source: cfg.source || null,
    profileDirCount: countChildDirs(root),
    configPath: configPath(userDataRoot),
  };
}

function assertSafeProfilesTarget(targetPath) {
  const resolved = path.resolve(String(targetPath || ""));
  if (!resolved || resolved.length < 4) {
    throw new Error("Invalid profiles folder path.");
  }
  const base = path.basename(resolved).toLowerCase();
  if (base === "windows" || base === "program files" || base === "program files (x86)") {
    throw new Error("Refusing to use a system folder for profiles.");
  }
  // Avoid storing directly in drive root (too easy to wipe / ACL issues).
  if (isSamePath(resolved, path.parse(resolved).root)) {
    throw new Error("Choose a subfolder (e.g. D:\\StealthBrowser\\profiles), not the drive root.");
  }
  return resolved;
}

/**
 * Point profilesRoot at an existing folder (no file move). Creates dir if empty.
 */
function setProfilesRoot(userDataRoot, nextRoot, { source = "settings" } = {}) {
  const target = assertSafeProfilesTarget(nextRoot);
  fs.mkdirSync(target, { recursive: true });
  return writeProfilesLocationConfig(userDataRoot, {
    profilesRoot: isSamePath(target, defaultProfilesRoot(userDataRoot)) ? null : target,
    promptPending: false,
    source,
  });
}

function dismissProfilesLocationPrompt(userDataRoot) {
  return writeProfilesLocationConfig(userDataRoot, { promptPending: false });
}

/**
 * Move profile dirs from current root to nextRoot, then update config.
 * Caller must close all browser sessions first.
 */
function migrateProfilesRoot(userDataRoot, nextRoot, { source = "migrate" } = {}) {
  const target = assertSafeProfilesTarget(nextRoot);
  const from = resolveProfilesRoot(userDataRoot);
  if (isSamePath(from, target)) {
    return {
      ok: true,
      skipped: true,
      profilesRoot: from,
      info: getProfilesLocationInfo(userDataRoot),
    };
  }

  fs.mkdirSync(target, { recursive: true });

  if (isSamePath(path.dirname(target), from) || target.startsWith(from + path.sep)) {
    throw new Error("Destination cannot be inside the current profiles folder.");
  }

  const fromCount = countChildDirs(from);
  if (fromCount > 0) {
    if (process.platform === "win32") {
      const r = spawnSync(
        "robocopy",
        [from, target, "/E", "/MOVE", "/R:2", "/W:2", "/NFL", "/NDL", "/NP", "/MT:8"],
        { encoding: "utf8", windowsHide: true },
      );
      // robocopy 0–7 = success
      if ((r.status ?? 1) >= 8) {
        throw new Error(`Profile move failed (robocopy exit ${r.status}).`);
      }
    } else {
      // Best-effort rename/copy for non-Windows.
      for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const src = path.join(from, entry.name);
        const dest = path.join(target, entry.name);
        fs.renameSync(src, dest);
      }
    }
  }

  // If default path remains, leave a junction/symlink for back-compat tools.
  const def = defaultProfilesRoot(userDataRoot);
  try {
    if (!isSamePath(def, target)) {
      if (fs.existsSync(def)) {
        const st = fs.lstatSync(def);
        if (st.isDirectory() && !st.isSymbolicLink() && countChildDirs(def) === 0) {
          fs.rmSync(def, { recursive: true, force: true });
        }
      }
      if (!fs.existsSync(def) && process.platform === "win32") {
        spawnSync("cmd", ["/c", "mklink", "/J", def, target], {
          encoding: "utf8",
          windowsHide: true,
        });
      }
    }
  } catch {
    /* junction is optional */
  }

  writeProfilesLocationConfig(userDataRoot, {
    profilesRoot: isSamePath(target, def) ? null : target,
    promptPending: false,
    source,
    migratedAt: new Date().toISOString(),
    migratedFrom: from,
  });

  return {
    ok: true,
    skipped: false,
    profilesRoot: resolveProfilesRoot(userDataRoot),
    movedFrom: from,
    info: getProfilesLocationInfo(userDataRoot),
  };
}

module.exports = {
  CONFIG_NAME,
  PRODUCT_FOLDER,
  MIN_SUGGEST_FREE_BYTES,
  configPath,
  defaultProfilesRoot,
  readProfilesLocationConfig,
  writeProfilesLocationConfig,
  suggestProfilesRoot,
  resolveProfilesRoot,
  resolveProfileUserDataDir,
  ensureProfilesLocationInitialized,
  getProfilesLocationInfo,
  setProfilesRoot,
  dismissProfilesLocationPrompt,
  migrateProfilesRoot,
  isSamePath,
  tryRealpath,
  listAlternateFixedDriveRoots,
};
