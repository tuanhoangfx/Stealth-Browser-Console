const fs = require("node:fs");
const path = require("node:path");
const { resolveProfilesRoot } = require("./profiles-location.cjs");
const {
  COOKIE_BRIDGE_STORE_ID,
  cookieBridgeEnabled,
  resolveCookieBridgeExtensionDirSync,
  isVerifiedStoreExtension,
} = require("./cookie-bridge-store.cjs");
const {
  pinStoreExtension,
  pinToolbarExtension,
  unpackedExtensionId,
  unpinExtensionFromProfile,
} = require("./profile-chrome-preferences.cjs");
const {
  purgeDuplicateUnpackedStoreExtensions,
  isCanonicalStoreExtensionEntry,
  removeExtensionFromPrefs,
} = require("./profile-chrome-cleanup.cjs");
const { ensureCloakbrowserExtensionStages } = require("./cloakbrowser-extension-stage.cjs");
const { profileExtensionsEnabled } = require("./extension-launch-mode.cjs");
const {
  isStoreExtensionAllowed,
  isLocalExtensionAllowed,
  allExtensionTogglesEnabled,
} = require("./extension-toggles.cjs");
const { getExtensionToggles } = require("./app-settings.cjs");

const FAST_PREP = String(process.env.STEALTH_FAST_LAUNCH ?? "1").toLowerCase() !== "0";

// Load E0001 natively from prefs once Chromium has installed it (drop the
// redundant per-launch --load-extension). Set STEALTH_E0001_NATIVE_PREFS=0 to
// force the always-CLI-load behavior.
const NATIVE_PREFS_LOAD = String(process.env.STEALTH_E0001_NATIVE_PREFS ?? "1").toLowerCase() !== "0";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/**
 * True only when Chromium itself has already installed + loaded E0001 in this
 * profile: the settings entry is enabled, points at a still-present folder, and
 * carries a Chromium-parsed `manifest` object that our pin writer never sets
 * (Chromium adds it only after successfully loading the unpacked extension).
 * Once this holds, Chromium reloads the pinned unpacked extension (location 4)
 * from prefs on startup, so the per-launch `--load-extension` re-validation is
 * redundant and can be dropped for a faster open.
 */
function isCookieBridgeProvisionedInPrefs(userDataDir) {
  const entry = readJson(path.join(userDataDir, "Default", "Preferences"))?.extensions?.settings?.[
    COOKIE_BRIDGE_STORE_ID
  ];
  if (!entry || Number(entry.state) !== 1) return false;
  const manifest = entry.manifest;
  const chromiumLoaded = Boolean(manifest && typeof manifest === "object" && manifest.name);
  if (!chromiumLoaded) return false;
  const extPath = String(entry.path || "").trim();
  if (!extPath) return false;
  try {
    const resolved = path.resolve(extPath);
    if (!fs.existsSync(path.join(resolved, "manifest.json"))) return false;
    return isVerifiedStoreExtension(resolved);
  } catch {
    return false;
  }
}

function isStoreCacheExtensionPath(extensionDir) {
  const normalized = path.resolve(String(extensionDir || "")).replace(/\\/g, "/");
  return /\/extensions-cache\/[a-p]{32}\/unpacked\/?$/i.test(normalized);
}

function isCloakbrowserStagePath(extensionDir) {
  const normalized = path.resolve(String(extensionDir || "")).replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/.cloakbrowser/") && /\/[a-p]{32}\/?$/i.test(normalized);
}

function resolveSourceDirFromMeta(meta) {
  const raw = String(meta?.path || "").trim();
  if (!raw) return null;
  const abs = path.resolve(raw);
  if (!fs.existsSync(path.join(abs, "manifest.json"))) return null;
  return abs;
}

function defaultCloakCacheDir() {
  try {
    const { listChromiumCacheDirs } = require("./operator-extension-stage.cjs");
    const dirs = listChromiumCacheDirs();
    if (dirs.length) return dirs.sort().reverse()[0];
  } catch {
    /* ignore */
  }
  return null;
}

/** Extensions this profile should load — from prefs (+ E0001 if enabled and missing). */
function resolveOperatorExtensionDir() {
  if (String(process.env.STEALTH_OPERATOR_EXTENSION || "1") === "0") return null;
  const override = String(process.env.STEALTH_OPERATOR_EXTENSION_DIR || "").trim();
  let stageFallback = "";
  try {
    const { operatorStableRoot } = require("./operator-extension-stage.cjs");
    stageFallback = path.join(operatorStableRoot(), "ckalnmjdalpecadefcppeohmdgocgjlj");
  } catch {
    /* ignore */
  }
  const candidates = [
    override,
    path.resolve(__dirname, "../../../../Extension/E0002-browser-operator"),
    process.env.STEALTH_WORKSPACE_ROOT
      ? path.resolve(process.env.STEALTH_WORKSPACE_ROOT, "Extension", "E0002-browser-operator")
      : "",
    path.resolve("E:/Dev/Extension/E0002-browser-operator"),
    stageFallback,
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "manifest.json"))) return path.resolve(dir);
  }
  return null;
}

function readProfileExtensionSources(userDataDir, userDataRoot, effectiveToggles) {
  const toggles = effectiveToggles || getExtensionToggles();
  const prefsFile = path.join(userDataDir, "Default", "Preferences");
  const settings = readJson(prefsFile)?.extensions?.settings || {};
  const entries = [];
  const seenStore = new Set();

  for (const [extId, meta] of Object.entries(settings)) {
    const sourceDir = resolveSourceDirFromMeta(meta);
    if (!sourceDir) continue;
    if (isCanonicalStoreExtensionEntry(extId, meta)) {
      if (seenStore.has(extId)) continue;
      if (!isStoreExtensionAllowed(extId, toggles)) continue;
      seenStore.add(extId);
      const resolvedStoreDir =
        extId === COOKIE_BRIDGE_STORE_ID && cookieBridgeEnabled()
          ? resolveCookieBridgeExtensionDirSync(userDataRoot) || sourceDir
          : sourceDir;
      entries.push({ kind: "store", storeId: extId, sourceDir: resolvedStoreDir });
      continue;
    }
    if (Number(meta?.location) === 4 && !isCloakbrowserStagePath(sourceDir)) {
      if (!isLocalExtensionAllowed(toggles)) continue;
      entries.push({ kind: "local", sourceDir });
    }
  }

  if (toggles.e0002 !== false) {
    const operator = resolveOperatorExtensionDir();
    if (operator && !entries.some((entry) => path.resolve(entry.sourceDir) === operator)) {
      entries.push({ kind: "operator", sourceDir: operator });
    }
  }

  if (
    cookieBridgeEnabled() &&
    toggles.e0001 &&
    !seenStore.has(COOKIE_BRIDGE_STORE_ID) &&
    !entries.some((entry) => entry.storeId === COOKIE_BRIDGE_STORE_ID || isCookieBridgeSourceDir(entry.sourceDir))
  ) {
    const bridge = resolveCookieBridgeExtensionDirSync(userDataRoot);
    if (bridge) {
      entries.unshift({ kind: "store", storeId: COOKIE_BRIDGE_STORE_ID, sourceDir: bridge });
    }
  }

  return entries;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), "utf8");
}

function isCookieBridgeSourceDir(sourceDir) {
  const norm = String(sourceDir || "").replace(/\\/g, "/").toLowerCase();
  if (!norm) return false;
  if (norm.includes(`/${COOKIE_BRIDGE_STORE_ID.toLowerCase()}`)) return true;
  if (norm.includes("/e0001-cookie-bridge")) return true;
  const manifestName = String(readJson(path.join(sourceDir, "manifest.json"))?.name || "");
  return /e0001|cookie bridge/i.test(manifestName);
}

function pinStoreOrUnpackedExtension(userDataDir, storeId, pinPath, sourceDir) {
  const verified =
    isVerifiedStoreExtension(pinPath) || (sourceDir ? isVerifiedStoreExtension(sourceDir) : false);
  if (storeId === COOKIE_BRIDGE_STORE_ID && !verified) {
    unpinExtensionFromProfile(userDataDir, { storeId: COOKIE_BRIDGE_STORE_ID });
    return pinToolbarExtension(userDataDir, pinPath);
  }
  return pinStoreExtension(userDataDir, storeId, pinPath);
}

function profileHasCookieBridge(settings) {
  if (!settings || typeof settings !== "object") return false;
  if (settings[COOKIE_BRIDGE_STORE_ID]) return true;
  const storeNeedle = `/${COOKIE_BRIDGE_STORE_ID}`.toLowerCase();
  for (const meta of Object.values(settings)) {
    const name = String(meta?.manifest?.name || "");
    if (/e0001|cookie bridge/i.test(name)) return true;
    const extPath = String(meta?.path || "").replace(/\\/g, "/").toLowerCase();
    if (extPath.includes(storeNeedle)) return true;
  }
  return false;
}

function migrateUnpackedCookieBridgePins(userDataDir, userDataRoot) {
  const prefsFile = path.join(userDataDir, "Default", "Preferences");
  const prefs = readJson(prefsFile);
  const settings = prefs?.extensions?.settings;
  if (!settings) return false;
  const bridgeSrc = resolveCookieBridgeExtensionDirSync(userDataRoot);
  if (bridgeSrc && !isVerifiedStoreExtension(bridgeSrc)) {
    if (!settings[COOKIE_BRIDGE_STORE_ID]) return false;
    const prevPath = settings[COOKIE_BRIDGE_STORE_ID].path;
    removeExtensionFromPrefs(prefs, COOKIE_BRIDGE_STORE_ID);
    writeJson(prefsFile, prefs);
    if (prevPath) {
      pinToolbarExtension(userDataDir, prevPath);
    }
    return true;
  }
  if (settings[COOKIE_BRIDGE_STORE_ID]) return false;

  const storeNeedle = `/${COOKIE_BRIDGE_STORE_ID}`.toLowerCase();
  let stagePath = null;
  const shadowIds = [];
  for (const [extId, meta] of Object.entries(settings)) {
    const extPath = String(meta?.path || "").replace(/\\/g, "/").toLowerCase();
    if (!extPath.includes(storeNeedle)) continue;
    stagePath = meta.path;
    if (extId !== COOKIE_BRIDGE_STORE_ID) shadowIds.push(extId);
  }
  if (!stagePath || !shadowIds.length) return false;

  for (const extId of shadowIds) {
    removeExtensionFromPrefs(prefs, extId);
  }
  writeJson(prefsFile, prefs);
  pinStoreOrUnpackedExtension(userDataDir, COOKIE_BRIDGE_STORE_ID, stagePath, bridgeSrc || stagePath);
  return true;
}

function splitNativeExtensionDirs(extensionDirs) {
  const stageDirs = [];
  const loadDirs = [];
  for (const dir of extensionDirs || []) {
    if (isStoreCacheExtensionPath(dir) || isCloakbrowserStagePath(dir)) stageDirs.push(dir);
    else loadDirs.push(dir);
  }
  return { stageDirs, loadDirs };
}

/**
 * Stage store extensions once under `.cloakbrowser/<storeId>/` and pin prefs to that path only.
 * Prevents duplicate UI entries (AppData path + CloakBrowser stage path).
 */
/** Keep E0002's manifest in every Chromium cache via a junction to the stable stage. */
function stageOperatorExtension(cloakCacheDir, options = {}) {
  const operator = resolveOperatorExtensionDir();
  if (!operator) return null;
  const resolvedCloakDir = cloakCacheDir || defaultCloakCacheDir();
  const { syncOperatorChromiumStages } = require("./operator-extension-stage.cjs");
  const staged = syncOperatorChromiumStages(operator, resolvedCloakDir ? [resolvedCloakDir] : [], options);
  if (!staged?.extId) return staged;
  const pinDir = resolvedCloakDir ? path.join(path.resolve(resolvedCloakDir), staged.extId) : staged.stageDir;
  const pinReady = pinDir && fs.existsSync(path.join(pinDir, "manifest.json"));
  return { ...staged, pinDir: pinReady ? pinDir : staged.stageDir || operator };
}

function getOperatorExtensionStatus(userDataRoot) {
  const { getProfileExtensionsEnabled } = require("./app-settings.cjs");
  const {
    operatorStableRoot,
    validateOperatorExtensionPackage,
  } = require("./operator-extension-stage.cjs");
  const toggles = getExtensionToggles();
  const profilesExtensionsEnabled = getProfileExtensionsEnabled();
  const workspacePath = resolveOperatorExtensionDir();
  const unpackedId = workspacePath ? unpackedExtensionId(workspacePath) : null;
  const stagePath = unpackedId ? path.join(operatorStableRoot(), unpackedId) : null;
  const workspaceManifest = workspacePath ? readJson(path.join(workspacePath, "manifest.json")) : {};
  const stageManifest =
    stagePath && fs.existsSync(path.join(stagePath, "manifest.json"))
      ? readJson(path.join(stagePath, "manifest.json"))
      : {};
  const targetForValidation =
    stagePath && fs.existsSync(path.join(stagePath, "manifest.json")) ? stagePath : workspacePath;
  const validation = targetForValidation ? validateOperatorExtensionPackage(targetForValidation) : null;
  const manifestVersion = typeof workspaceManifest?.version === "string" ? workspaceManifest.version.trim() : null;
  const stageVersion = typeof stageManifest?.version === "string" ? stageManifest.version.trim() : null;
  let swHealth = null;
  try {
    const { defaultUserDataRoot } = require("./webstore-extension.cjs");
    const { inspectMv3ServiceWorkerFleetHealth } = require("./extension-sw-health.cjs");
    const rootDir =
      typeof userDataRoot === "function"
        ? userDataRoot()
        : userDataRoot || defaultUserDataRoot();
    swHealth =
      inspectMv3ServiceWorkerFleetHealth(rootDir, {
        expectedE0002Version: stageVersion || manifestVersion || null,
      })?.e0002 ?? null;
  } catch {
    /* best-effort */
  }

  return {
    enabled: Boolean(profilesExtensionsEnabled && toggles.e0002 !== false && workspacePath),
    profilesExtensionsEnabled,
    extensionToggles: toggles,
    productCode: "E0002",
    name: String(workspaceManifest.name || stageManifest.name || "E0002 Browser Operator"),
    unpackedId,
    workspacePath,
    stagePath: stagePath && fs.existsSync(path.join(stagePath, "manifest.json")) ? stagePath : null,
    manifestOk: Boolean(workspaceManifest?.manifest_version || stageManifest?.manifest_version),
    manifestVersion,
    stageVersion,
    swHealth,
    validation,
  };
}

function loadProfileExtensionOverrides() {
  try {
    const { getDb, isDatabaseReady } = require("../db/init.cjs");
    if (typeof isDatabaseReady === "function" && !isDatabaseReady()) return null;
    const rows = getDb().prepare("SELECT id, extension_overrides FROM profiles").all();
    const overridesById = new Map();
    for (const row of rows) {
      let parsed = {};
      try {
        parsed = JSON.parse(row.extension_overrides || "{}");
      } catch {
        parsed = {};
      }
      overridesById.set(String(row.id), parsed && typeof parsed === "object" ? parsed : {});
    }
    return overridesById;
  } catch {
    return null;
  }
}

function stageCookieBridgeExtension(userDataRoot, cloakCacheDir, options = {}) {
  const bridge = resolveCookieBridgeExtensionDirSync(userDataRoot);
  if (!bridge) return null;
  const resolvedCloakDir = cloakCacheDir || defaultCloakCacheDir();
  const { syncOperatorChromiumStages } = require("./operator-extension-stage.cjs");
  const staged = syncOperatorChromiumStages(bridge, resolvedCloakDir ? [resolvedCloakDir] : [], options);
  if (!staged?.extId) return null;
  const pinDir = resolvedCloakDir ? path.join(path.resolve(resolvedCloakDir), staged.extId) : staged.stageDir;
  const pinReady = pinDir && fs.existsSync(path.join(pinDir, "manifest.json"));
  return { ...staged, pinDir: pinReady ? pinDir : staged.stageDir };
}

/**
 * One entry for startup and toggle save. Stages E0001 and E0002 outside the
 * versioned Chromium dir, then pins or unpins both on closed profiles.
 * Other tools attach with the profile debugPort.
 */
function maintainOperatorExtension(userDataRoot, cloakCacheDir, options = {}) {
  const resolvedCloakDir = cloakCacheDir || defaultCloakCacheDir();
  const operatorDir = resolveOperatorExtensionDir();
  const staged = stageOperatorExtension(resolvedCloakDir, options);
  const bridge = userDataRoot ? stageCookieBridgeExtension(userDataRoot, resolvedCloakDir, options) : null;
  if (!userDataRoot) return { staged, bridge, prefs: null };
  const toggles = getExtensionToggles();
  const { reconcileClosedProfileExtensionPrefs } = require("./profile-chrome-cleanup.cjs");
  const effectiveOperatorPinDir = staged?.pinDir || operatorDir;
  const prefs = reconcileClosedProfileExtensionPrefs(userDataRoot, {
    operatorDir: effectiveOperatorPinDir,
    legacyOperatorDirs: [operatorDir, staged?.stageDir].filter(Boolean),
    operatorEnabled: toggles.e0002 !== false,
    bridgeId: COOKIE_BRIDGE_STORE_ID,
    bridgeDir: bridge?.pinDir || null,
    bridgeEnabled: toggles.e0001 !== false,
    overridesById: loadProfileExtensionOverrides(),
  });
  return { staged, bridge, prefs };
}

function unpinOperatorFromProfile(userDataDir, cloakCacheDir) {
  const operator = resolveOperatorExtensionDir();
  if (!operator || !userDataDir) return { changed: false, ids: [] };
  const resolvedCloakDir = cloakCacheDir || defaultCloakCacheDir();
  const res1 = unpinExtensionFromProfile(userDataDir, { unpackedPath: operator });
  if (resolvedCloakDir) {
    const stagedPath = path.join(path.resolve(resolvedCloakDir), unpackedExtensionId(operator));
    const res2 = unpinExtensionFromProfile(userDataDir, { unpackedPath: stagedPath });
    return {
      changed: Boolean(res1.changed || res2.changed),
      ids: [...new Set([...(res1.ids || []), ...(res2.ids || [])])],
    };
  }
  return res1;
}

const _preparedProfileExtCache = new Map();
const PREPARED_PROFILE_EXT_TTL_MS = 30_000;

function prepareProfileExtensions(userDataDir, userDataRoot, cloakCacheDir, options = {}) {
  const emptyPlan = {
    stageDirs: [],
    loadDirs: [],
    cliStoreLoads: [],
    prefStoreIds: [],
    allowedStoreIds: [],
    useAllowlist: false,
  };
  const { profileExtensionsEnabled } = require("./extension-launch-mode.cjs");
  const toggles = options.effectiveToggles || getExtensionToggles();
  // Shortcuts relaunch Chrome without this prep. The junction must exist even
  // when this profile's toggle is off, or a leftover pin shows "manifest missing".
  const resolvedCloakDir = cloakCacheDir || defaultCloakCacheDir();
  const stagedOperator = stageOperatorExtension(resolvedCloakDir);
  if (cookieBridgeEnabled() && toggles.e0001 !== false && userDataRoot) {
    stageCookieBridgeExtension(userDataRoot, resolvedCloakDir);
  }
  if (toggles.e0002 === false) unpinOperatorFromProfile(userDataDir, resolvedCloakDir);
  if (!profileExtensionsEnabled()) return emptyPlan;

  const prefsFile = userDataDir ? path.join(userDataDir, "Default", "Preferences") : "";
  const securePrefsFile = userDataDir ? path.join(userDataDir, "Default", "Secure Preferences") : "";
  const cacheKey = `${path.resolve(String(userDataDir || ""))}::${path.resolve(String(resolvedCloakDir || ""))}::${JSON.stringify(toggles)}`;
  const nowMs = Date.now();
  if (FAST_PREP && prefsFile && !options.force) {
    const cached = _preparedProfileExtCache.get(cacheKey);
    if (cached && nowMs - cached.at < PREPARED_PROFILE_EXT_TTL_MS) {
      try {
        const st = fs.statSync(prefsFile);
        const secSt = securePrefsFile && fs.existsSync(securePrefsFile) ? fs.statSync(securePrefsFile) : null;
        const secMtime = secSt ? secSt.mtimeMs : 0;
        const secSize = secSt ? secSt.size : 0;
        if (
          st.size > 4096 &&
          st.mtimeMs === cached.prefsMtime &&
          st.size === cached.prefsSize &&
          secMtime === cached.secMtime &&
          secSize === cached.secSize
        ) {
          return cached.plan;
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (!FAST_PREP) {
    purgeDuplicateUnpackedStoreExtensions(userDataDir);
  }

  // Snapshot BEFORE re-pinning: was E0001 already Chromium-installed in this
  // profile? If so we can load it natively from prefs and skip the redundant
  // per-launch --load-extension re-validation (faster opens, 1.0.11-like).
  const cookieBridgePrefsLoad =
    NATIVE_PREFS_LOAD && isCookieBridgeProvisionedInPrefs(userDataDir);

  migrateUnpackedCookieBridgePins(userDataDir, userDataRoot);

  const sources = readProfileExtensionSources(userDataDir, userDataRoot, toggles);
  if (!sources.length) return { ...emptyPlan };

  const cliStoreLoads = [];
  const prefStoreIds = [];

  // Operator (E0002) must be staged too. CloakBrowser Chromium loads an unpacked
  // extension from `<cacheDir>/<unpackedId>/`, not from the workspace path pinned
  // in prefs. Skipping the copy surfaces "Manifest file is missing or unreadable".
  const cacheSourceDirs = [
    ...new Set(
      sources
        .map((entry) => entry.sourceDir)
        .filter((dir) => isStoreCacheExtensionPath(dir) || !isCloakbrowserStagePath(dir)),
    ),
  ];

  const staged = ensureCloakbrowserExtensionStages(cacheSourceDirs, resolvedCloakDir);
  const stageBySource = new Map(staged.map((row) => [path.resolve(row.sourceDir), row.stageDir]));

  const loadDirs = [];
  for (const entry of sources) {
    const src = path.resolve(entry.sourceDir);
    let pinPath = stageBySource.get(src) || src;

    if (entry.kind === "operator") {
      const storeId = unpackedExtensionId(src);
      const operatorPinDir =
        stagedOperator?.pinDir ||
        (resolvedCloakDir ? path.join(path.resolve(resolvedCloakDir), storeId) : pinPath);
      if (operatorPinDir && path.resolve(operatorPinDir) !== src) {
        unpinExtensionFromProfile(userDataDir, { unpackedPath: src });
      }
      pinToolbarExtension(userDataDir, operatorPinDir);
      cliStoreLoads.push({ storeId, dir: operatorPinDir });
      prefStoreIds.push(storeId);
      continue;
    }

    if (entry.kind === "store") {
      if (!stageBySource.has(src) && isStoreCacheExtensionPath(src)) {
        const restaged = ensureCloakbrowserExtensionStages([src], resolvedCloakDir);
        if (restaged[0]?.stageDir) pinPath = restaged[0].stageDir;
      }
      pinStoreOrUnpackedExtension(userDataDir, entry.storeId, pinPath, entry.sourceDir);
      const verifiedStore =
        entry.storeId !== COOKIE_BRIDGE_STORE_ID ||
        isVerifiedStoreExtension(pinPath) ||
        isVerifiedStoreExtension(entry.sourceDir);
      // IMPORTANT: CloakBrowser resolves `--disable-extensions-except=<id>` relative to
      // `chromium-<version>/<storeId>`, so `prefStoreIds` and `cliStoreLoads[].storeId`
      // MUST remain the staged folder basename (`entry.storeId`), while toolbar Preferences
      // pin uses `unpackedExtensionId(pinPath)` inside `pinStoreOrUnpackedExtension`.
      prefStoreIds.push(entry.storeId);
      if (entry.storeId === COOKIE_BRIDGE_STORE_ID && cookieBridgeEnabled()) {
        // First open (or unverified workspace build) forces --load-extension so
        // Chromium registers E0001 cleanly. Verified store installs can skip CLI load later.
        if (!verifiedStore || !cookieBridgePrefsLoad) {
          cliStoreLoads.push({ storeId: entry.storeId, dir: pinPath });
        }
      }
      continue;
    }

    pinToolbarExtension(userDataDir, pinPath);
    if (!isStoreCacheExtensionPath(src)) loadDirs.push(src);
  }

  const plan = {
    stageDirs: cacheSourceDirs,
    loadDirs,
    cliStoreLoads,
    prefStoreIds,
    allowedStoreIds: [...prefStoreIds],
    useAllowlist: !allExtensionTogglesEnabled(toggles),
  };
  if (prefsFile) {
    try {
      const st = fs.statSync(prefsFile);
      const secSt = securePrefsFile && fs.existsSync(securePrefsFile) ? fs.statSync(securePrefsFile) : null;
      if (st.size > 4096) {
        _preparedProfileExtCache.set(cacheKey, {
          at: Date.now(),
          prefsMtime: st.mtimeMs,
          prefsSize: st.size,
          secMtime: secSt ? secSt.mtimeMs : 0,
          secSize: secSt ? secSt.size : 0,
          plan,
        });
      }
    } catch {
      /* ignore */
    }
  }
  return plan;
}

/** Rewrite extensions-cache prefs → `.cloakbrowser/<storeId>/` (fixes duplicate toolbar icons). */
function profileNeedsExtensionPathRepair(userDataDir) {
  const settings = readJson(path.join(userDataDir, "Default", "Preferences"))?.extensions?.settings || {};
  for (const [extId, meta] of Object.entries(settings)) {
    const sourceDir = resolveSourceDirFromMeta(meta);
    if (!sourceDir) continue;
    if (isCanonicalStoreExtensionEntry(extId, meta) && isStoreCacheExtensionPath(sourceDir)) return true;
  }
  return false;
}

function repairAllProfileExtensionPaths(userDataRoot, cloakCacheDir, options = {}) {
  const profilesDir = resolveProfilesRoot(userDataRoot);
  let profiles = 0;
  let rewritten = 0;
  if (!fs.existsSync(profilesDir)) return { profiles, rewritten };
  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    profiles += 1;
    const userDataDir = path.join(profilesDir, entry.name);
    if (!profileNeedsExtensionPathRepair(userDataDir)) continue;
    try {
      prepareProfileExtensions(userDataDir, userDataRoot, cloakCacheDir, {
        effectiveToggles: options.effectiveToggles,
      });
      rewritten += 1;
    } catch {
      // best-effort per profile
    }
  }
  return { profiles, rewritten };
}

/** @deprecated Use maintainOperatorExtension. Kept so older startup callers share that walk. */
function ensureCookieBridgeOnAllProfiles(userDataRoot, cloakCacheDir) {
  const maintained = maintainOperatorExtension(userDataRoot, cloakCacheDir);
  const prefs = maintained.prefs || { profiles: 0, pinned: 0 };
  return { profiles: prefs.profiles || 0, pinned: prefs.pinnedBridge || 0 };
}

/** @deprecated — use readProfileExtensionSources; kept for warm-cache boot. */
function resolveNativeExtensionDirs(userDataRoot) {
  const { listAllLaunchExtensions } = require("./webstore-extension.cjs");
  const dirs = [];
  const seen = new Set();
  for (const ext of listAllLaunchExtensions(userDataRoot)) {
    const abs = path.resolve(ext.unpackedPath);
    if (seen.has(abs)) continue;
    if (!fs.existsSync(path.join(abs, "manifest.json"))) continue;
    seen.add(abs);
    dirs.push(abs);
  }
  return dirs;
}

module.exports = {
  isStoreCacheExtensionPath,
  isCloakbrowserStagePath,
  resolveOperatorExtensionDir,
  readProfileExtensionSources,
  resolveNativeExtensionDirs,
  splitNativeExtensionDirs,
  prepareProfileExtensions,
  stageOperatorExtension,
  stageCookieBridgeExtension,
  getOperatorExtensionStatus,
  maintainOperatorExtension,
  unpinOperatorFromProfile,
  profileNeedsExtensionPathRepair,
  repairAllProfileExtensionPaths,
  ensureCookieBridgeOnAllProfiles,
  profileHasCookieBridge,
  isCookieBridgeProvisionedInPrefs,
  pinStoreOrUnpackedExtension,
};
