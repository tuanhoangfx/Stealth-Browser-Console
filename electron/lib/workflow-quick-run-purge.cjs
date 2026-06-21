const fs = require("node:fs");
const path = require("node:path");
const { unpackedExtensionId } = require("./profile-chrome-preferences.cjs");

const EXT_ROOT = "workflow-quick-run";
const PIN_KEYS = ["pinned_extensions", "toolbar_pinned_extension_ids"];
const WORKFLOW_EXT_DESC_RE = /workflow quick run/i;

const purgedDirs = new Set();

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

function isWorkflowQuickRunPath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").toLowerCase();
  return normalized.includes(`/${EXT_ROOT}/`) || normalized.includes(`\\${EXT_ROOT}\\`);
}

function isWorkflowQuickRunMeta(meta) {
  if (!meta || typeof meta !== "object") return false;
  if (isWorkflowQuickRunPath(meta.path)) return true;
  const desc = String(meta.manifest?.description || "");
  if (WORKFLOW_EXT_DESC_RE.test(desc)) return true;
  try {
    const manifestPath = path.join(String(meta.path || ""), "manifest.json");
    if (!fs.existsSync(manifestPath)) return false;
    const disk = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return WORKFLOW_EXT_DESC_RE.test(String(disk.description || ""));
  } catch {
    return false;
  }
}

function collectWorkflowQuickRunExtensionIds(prefs) {
  const settings = prefs?.extensions?.settings;
  if (!settings || typeof settings !== "object") return [];
  const ids = [];
  for (const [extId, meta] of Object.entries(settings)) {
    if (isWorkflowQuickRunMeta(meta)) ids.push(extId);
  }
  return ids;
}

function removeExtensionFromPrefs(prefs, extId) {
  if (!prefs?.extensions || !extId) return false;
  let changed = false;
  for (const key of PIN_KEYS) {
    const list = prefs.extensions[key];
    if (!Array.isArray(list) || !list.includes(extId)) continue;
    prefs.extensions[key] = list.filter((id) => id !== extId);
    changed = true;
  }
  if (prefs.extensions.toolbar?.pinned_extension_ids?.includes(extId)) {
    prefs.extensions.toolbar.pinned_extension_ids = prefs.extensions.toolbar.pinned_extension_ids.filter(
      (id) => id !== extId,
    );
    changed = true;
  }
  if (prefs.extensions.settings?.[extId]) {
    delete prefs.extensions.settings[extId];
    changed = true;
  }
  return changed;
}

function chromePrefsFiles(userDataDir) {
  const base = path.join(userDataDir, "Default");
  const files = [path.join(base, "Preferences")];
  const secure = path.join(base, "Secure Preferences");
  if (fs.existsSync(secure)) files.push(secure);
  return files;
}

function removeExtensionStore(userDataDir, extId) {
  if (!extId) return;
  const store = path.join(userDataDir, "Default", "Extensions", extId);
  try {
    if (fs.existsSync(store)) fs.rmSync(store, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

function purgeWorkflowQuickRunToolbar(userDataDir, userDataRoot, profileId) {
  const cacheKey = path.resolve(String(userDataDir));
  if (purgedDirs.has(cacheKey)) return { removed: 0, cached: true };

  let removed = 0;

  if (userDataRoot && profileId) {
    const bundleDir = path.join(userDataRoot, EXT_ROOT, String(profileId));
    try {
      if (fs.existsSync(bundleDir)) {
        fs.rmSync(bundleDir, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // best-effort
    }
    const extId = unpackedExtensionId(bundleDir);
    removeExtensionStore(userDataDir, extId);
  }

  for (const prefsFile of chromePrefsFiles(userDataDir)) {
    const prefs = readJson(prefsFile);
    if (!prefs) continue;
    const extIds = collectWorkflowQuickRunExtensionIds(prefs);
    let changed = false;
    for (const extId of extIds) {
      if (removeExtensionFromPrefs(prefs, extId)) changed = true;
      removeExtensionStore(userDataDir, extId);
    }
    if (changed) {
      writeJson(prefsFile, prefs);
      removed += extIds.length;
    }
  }

  purgedDirs.add(cacheKey);
  return { removed };
}

function purgeWorkflowQuickRunRoot(userDataRoot) {
  if (!userDataRoot) return { ok: false, removed: 0 };
  const root = path.join(userDataRoot, EXT_ROOT);
  try {
    if (!fs.existsSync(root)) return { ok: true, removed: 0 };
    fs.rmSync(root, { recursive: true, force: true });
    purgedDirs.clear();
    return { ok: true, removed: 1 };
  } catch (err) {
    return { ok: false, removed: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = {
  EXT_ROOT,
  purgeWorkflowQuickRunToolbar,
  purgeWorkflowQuickRunRoot,
  isWorkflowQuickRunPath,
};
