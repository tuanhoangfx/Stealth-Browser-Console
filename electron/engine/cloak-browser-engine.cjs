const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const {
  resolveCloakbrowserImportSpecifier,
  resolveCloakbrowserPackageDir,
  isMmdbLibAvailableForGeoip,
} = require("../lib/cloakbrowser-packaged-resolve.cjs");

function packagedRuntime() {
  try {
    const { app } = require("electron");
    return {
      isPackaged: Boolean(app?.isPackaged),
      resourcesPath: process.resourcesPath,
    };
  } catch {
    return { isPackaged: false, resourcesPath: process.resourcesPath };
  }
}
const {
  purgeLegacyProfileIdentityChrome,
  purgeProfileIdentityToolbar,
  purgeBrokenExtensionPrefs,
  purgeStaleCookieBridgePrefs,
} = require("../lib/profile-chrome-cleanup.cjs");
const { markProfileChromeCleanExit, chromeSessionRestoreSuppressionArgs } = require("../lib/profile-chrome-session.cjs");
const { ensureProfileChromeOmniboxSearchPrefs } = require("../lib/profile-chrome-omnibox.cjs");
const { bindOmniboxSearchGuard } = require("../lib/omnibox-search-guard.cjs");
const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");
const { createLaunchTimer } = require("../lib/profile-launch-timer.cjs");
const {
  cookieBridgeEnabled,
  ensureCookieBridgeStoreExtension,
  resolveCookieBridgeExtensionDirSync,
} = require("../lib/cookie-bridge-store.cjs");
const {
  pinToolbarExtension,
  pinStoreExtension,
  unpackedExtensionId,
} = require("../lib/profile-chrome-preferences.cjs");
const { ensureCloakbrowserExtensionStages } = require("../lib/cloakbrowser-extension-stage.cjs");
const { nativeExtensionsEnabled, profileExtensionsEnabled } = require("../lib/extension-launch-mode.cjs");
const { COOKIE_BRIDGE_STORE_ID } = require("../lib/cookie-bridge-store.cjs");
const {
  prepareProfileExtensions,
} = require("../lib/native-extension-load.cjs");
const { purgeDuplicateUnpackedStoreExtensions } = require("../lib/profile-chrome-cleanup.cjs");

/** Per-profile cookie-bridge prefs scrub — once per process after startup bulk purge. */
const cookieBridgeLaunchPrepped = new Set();
const FAST_LAUNCH = String(process.env.STEALTH_FAST_LAUNCH ?? "1").toLowerCase() !== "0";

let binaryInfoCache = null;

/** cloakbrowser is ESM-only — lazy dynamic import for Electron CJS main. */
let cloakModulePromise = null;

const CLOAK_IGNORE_DEFAULT_ARGS = ["--enable-automation", "--enable-unsafe-swiftshader"];
const SANDBOX_FLAGS = ["--no-sandbox", "--no-sandbox-and-elevated"];
const EXTENSION_BLOCK_FLAGS = ["--disable-extensions"];

function loadCloakbrowser() {
  if (!cloakModulePromise) {
    const runtime = packagedRuntime();
    const specifier = resolveCloakbrowserImportSpecifier(runtime);
    cloakModulePromise = import(specifier);
  }
  return cloakModulePromise;
}

function cloakDistImport(relativePath) {
  const runtime = packagedRuntime();
  const pkgDir = resolveCloakbrowserPackageDir(runtime);
  const filePath = path.join(pkgDir, "dist", relativePath);
  return import(pathToFileURL(filePath).href);
}

function profileDataDir(userDataRoot, profileId) {
  return path.join(userDataRoot, "profiles", String(profileId));
}

const { formatProxyForLaunch, toPlaywrightProxy } = require("../lib/proxy-pool.cjs");

function proxyLaunchExtras(proxy) {
  const normalized = formatProxyForLaunch(proxy);
  if (!normalized) return {};
  if (isMmdbLibAvailableForGeoip(packagedRuntime())) {
    return { proxy: normalized, geoip: true };
  }
  return { proxy: normalized };
}

function shouldStripSandboxFlags() {
  return process.platform === "win32" || process.platform === "darwin";
}

/** Spoofed OS reported to detection sites — from the profile, fallback to host. */
function resolveSpoofPlatform(profile) {
  const wanted = String(profile.platform || "").toLowerCase();
  if (wanted === "windows" || wanted === "macos" || wanted === "linux") return wanted;
  if (process.platform === "darwin") return "macos";
  if (process.platform === "linux") return "linux";
  return "windows";
}

const VALID_WINDOW_MODES = new Set(["host-maximized", "preset-viewport", "engine-default"]);

function resolveWindowMode(profile) {
  const mode = String(profile.windowMode || "host-maximized").toLowerCase();
  return VALID_WINDOW_MODES.has(mode) ? mode : "host-maximized";
}

function buildProfileMarkerArgs(profile, userDataRoot = "") {
  const profileId = String(profile?.id || "").trim();
  const rootTag = path.basename(path.resolve(String(userDataRoot || ""))).trim().toLowerCase();
  const args = [];
  if (profileId) args.push(`--stealth-profile-id=${profileId}`);
  if (rootTag) args.push(`--stealth-user-data-tag=${rootTag}`);
  return args;
}

function buildStealthChromeArgs(profile, userDataRoot = "") {
  const seed = profile.fingerprintSeed;
  const args = [`--fingerprint=${seed}`, ...buildProfileMarkerArgs(profile, userDataRoot)];

  // Host-level sandbox flag (not the spoofed platform).
  if (process.platform === "linux") {
    args.push("--no-sandbox");
  }

  args.push(`--fingerprint-platform=${resolveSpoofPlatform(profile)}`);

  if (process.platform === "win32" || process.platform === "darwin") {
    args.push("--ignore-gpu-blocklist");
  }

  if (resolveWindowMode(profile) === "host-maximized") {
    args.push("--start-maximized");
  }

  args.push("--disable-infobars");
  for (const flag of chromeSessionRestoreSuppressionArgs()) {
    args.push(flag);
  }
  return args;
}

function buildIgnoreDefaultArgs() {
  if (!shouldStripSandboxFlags()) return [...CLOAK_IGNORE_DEFAULT_ARGS];
  return [...CLOAK_IGNORE_DEFAULT_ARGS, ...SANDBOX_FLAGS, ...EXTENSION_BLOCK_FLAGS];
}

function chromeExtensionArgs(extensionDirs) {
  if (!extensionDirs.length) return [];
  const entries = extensionDirs.map((dir) => {
    const abs = path.resolve(String(dir)).replace(/\\/g, "/");
    return { abs, id: unpackedExtensionId(dir) };
  });
  return [
    `--disable-extensions-except=${entries.map((entry) => entry.id).join(",")}`,
    `--load-extension=${entries.map((entry) => entry.abs).join(",")}`,
  ];
}

/** Native mode: restrict loaded extensions when per-kind toggles are off. */
function buildExtensionAllowlistArg(allowedStoreIds) {
  const ids = [...new Set((allowedStoreIds || []).map((id) => String(id || "").toLowerCase()))].filter(Boolean);
  if (!ids.length) return [];
  return [`--disable-extensions-except=${ids.join(",")}`];
}

/** Native mode: CLI load for Web Store ids staged under `.cloakbrowser/<storeId>/`. */
function buildNativeExtensionCliArgs(cliStoreLoads, allowedStoreIds) {
  const loads = (cliStoreLoads || [])
    .map((row) => path.resolve(String(row.dir || "")).replace(/\\/g, "/"))
    .filter((dir) => dir && fs.existsSync(path.join(dir, "manifest.json")));
  if (!loads.length) return [];

  const ids = [
    ...new Set([
      ...(allowedStoreIds || []).map((id) => String(id || "").toLowerCase()),
      ...(cliStoreLoads || []).map((row) => String(row.storeId || "").toLowerCase()),
    ]),
  ].filter(Boolean);
  if (!ids.length) return [`--load-extension=${loads.join(",")}`];
  return [`--disable-extensions-except=${ids.join(",")}`, `--load-extension=${loads.join(",")}`];
}

/** Native mode: only local unpacked dirs use --load-extension (store ids load via prefs + staging). */
function chromeLocalExtensionArgs(extensionDirs) {
  if (!extensionDirs.length) return [];
  const paths = extensionDirs.map((dir) => path.resolve(String(dir)).replace(/\\/g, "/"));
  return [`--load-extension=${paths.join(",")}`];
}

function sanitizeChromeArgs(args) {
  if (!shouldStripSandboxFlags()) return args;
  return args.filter((arg) => {
    const key = arg.split("=")[0];
    return !SANDBOX_FLAGS.includes(key) && !EXTENSION_BLOCK_FLAGS.includes(key);
  });
}

function resolveExtraExtensionDirs(userDataRoot) {
  if (!cookieBridgeEnabled()) return [];

  const dirs = [];

  const env = String(process.env.STEALTH_EXTRA_EXTENSION_DIRS || "").trim();
  if (env) {
    for (const raw of env.split(";")) {
      const candidate = raw.trim();
      if (!candidate) continue;
      dirs.push(candidate);
    }
  }

  const cached = resolveCookieBridgeExtensionDirSync(userDataRoot);
  if (cached) dirs.push(cached);

  const unique = [];
  const seen = new Set();
  for (const dir of dirs) {
    const abs = path.resolve(String(dir));
    const normalized = abs.replace(/\\/g, "/").toLowerCase();
    if (seen.has(abs)) continue;
    try {
      if (!fs.existsSync(path.join(abs, "manifest.json"))) continue;
      seen.add(abs);
      unique.push(abs);
    } catch {
      // ignore unreadable paths
    }
  }

  return unique;
}

function buildLaunchOptions(profile, userDataDir, userDataRoot = "") {
  const proxy = String(profile.proxy || "").trim();
  const agentSmoke = isAgentSmokeLaunch();
  const options = {
    userDataDir,
    headless: profile.headless === true || agentSmoke,
    humanize: profile.humanize !== false,
    stealthArgs: false,
    ...proxyLaunchExtras(proxy),
    args: [...buildStealthChromeArgs(profile, userDataRoot)],
    profile
  };

  // Engine-honored device surface (cloakbrowser routes these to undetectable
  // binary flags / context options). Empty values fall back to geoip/auto.
  if (profile.timezone) options.timezone = String(profile.timezone);
  if (profile.locale) options.locale = String(profile.locale);
  if (profile.userAgent) options.userAgent = String(profile.userAgent);

  const windowMode = resolveWindowMode(profile);
  const vw = Number(profile.viewportW) || 0;
  const vh = Number(profile.viewportH) || 0;
  if (windowMode === "host-maximized") {
    // Playwright viewport:null — use native OS window size (no fixed 1920×947 lock).
    options.viewport = null;
  } else if (windowMode === "preset-viewport" && vw > 0 && vh > 0) {
    options.viewport = { width: vw, height: vh };
  }
  // engine-default: omit viewport → cloakbrowser DEFAULT_VIEWPORT (1920×947).

  if (profile.colorScheme) options.colorScheme = String(profile.colorScheme);

  return options;
}

async function ensureEngineBinary() {
  const { ensureBinary, binaryInfo } = await loadCloakbrowser();
  await ensureBinary();
  return binaryInfo();
}

async function getBinaryInfo() {
  const { binaryInfo } = await loadCloakbrowser();
  return binaryInfo();
}

async function getBinaryInfoCached() {
  if (!binaryInfoCache) binaryInfoCache = await getBinaryInfo();
  return binaryInfoCache;
}

async function prepareCookieBridgeForLaunch(userDataDir, userDataRoot) {
  const { getExtensionToggles } = require("../lib/app-settings.cjs");
  if (!cookieBridgeEnabled() || !profileExtensionsEnabled() || !getExtensionToggles().e0001) return null;
  let bridgeDir = resolveCookieBridgeExtensionDirSync(userDataRoot);
  if (!bridgeDir) {
    bridgeDir = await ensureCookieBridgeStoreExtension(userDataRoot);
  }
  if (!bridgeDir) return null;

  const prepKey = path.resolve(String(userDataDir));
  if (!cookieBridgeLaunchPrepped.has(prepKey)) {
    if (!FAST_LAUNCH) {
      purgeBrokenExtensionPrefs(userDataDir);
      purgeStaleCookieBridgePrefs(userDataDir, bridgeDir);
    }
    cookieBridgeLaunchPrepped.add(prepKey);
  }
  if (nativeExtensionsEnabled()) {
    return bridgeDir;
  }
  pinToolbarExtension(userDataDir, bridgeDir);
  return bridgeDir;
}

async function prepareNativeExtensionsForLaunch(userDataDir, userDataRoot, profile) {
  const emptyPlan = {
    stageDirs: [],
    loadDirs: [],
    cliStoreLoads: [],
    prefStoreIds: [],
    allowedStoreIds: [],
    useAllowlist: false,
  };
  const { getExtensionToggles } = require("../lib/app-settings.cjs");
  const { resolveEffectiveExtensionToggles, anyExtensionToggleEnabled } = require("../lib/extension-toggles.cjs");
  const { ensureProfileExtensionPins } = require("../lib/profile-extension-pins.cjs");
  const effectiveToggles = resolveEffectiveExtensionToggles(
    getExtensionToggles(),
    profile?.extensionOverrides,
  );
  if (!nativeExtensionsEnabled() || !anyExtensionToggleEnabled(effectiveToggles)) return emptyPlan;

  if (cookieBridgeEnabled() && effectiveToggles.e0001) {
    try {
      await prepareCookieBridgeForLaunch(userDataDir, userDataRoot);
    } catch (error) {
      console.warn("[cookie-bridge] store extension unavailable:", error instanceof Error ? error.message : error);
    }
  }

  const binary = await getBinaryInfoCached();
  if (profile?.id) {
    // ensureProfileExtensionPins already runs prepareProfileExtensions and returns
    // the launch plan — reuse it to avoid a redundant second prep pass per launch.
    const pins = await ensureProfileExtensionPins(profile, userDataRoot, binary.cacheDir);
    if (pins?.plan) return pins.plan;
  }
  return prepareProfileExtensions(userDataDir, userDataRoot, binary.cacheDir, { effectiveToggles });
}

/**
 * Desktop launch — ignoreDefaultArgs:true blocks Playwright injecting --no-sandbox.
 */
async function launchStealthPersistentContext(profileOptions) {
  const cloak = await loadCloakbrowser();
  const { buildLaunchOptions: cbBuildLaunchOptions, buildContextOptions, ensureBinary } = cloak;
  const { chromium } = await import("playwright-core");

  const options = profileOptions;
  const userDataDir = options.userDataDir;
  if (!userDataDir) throw new Error("userDataDir is required");

  const cloakOptions = options;

  await ensureBinary();
  const launchOpts = await cbBuildLaunchOptions({
    ...cloakOptions,
    stealthArgs: false,
    headless: options.headless ?? false
  });

  let args = sanitizeChromeArgs(launchOpts.args || []);
  const userDataRoot = options.userDataRoot || path.resolve(options.userDataDir, "..", "..");
  const { getExtensionToggles } = require("../lib/app-settings.cjs");
  const { resolveEffectiveExtensionToggles, anyExtensionToggleEnabled } = require("../lib/extension-toggles.cjs");
  const effectiveToggles = resolveEffectiveExtensionToggles(
    getExtensionToggles(),
    options.profile?.extensionOverrides,
  );
  if (!anyExtensionToggleEnabled(effectiveToggles)) {
    args = [...args, "--disable-extensions"];
  } else if (nativeExtensionsEnabled()) {
    const plan = options.nativeExtensionPlan || {
      stageDirs: [],
      loadDirs: [],
      cliStoreLoads: [],
      prefStoreIds: [],
      allowedStoreIds: [],
      useAllowlist: false,
    };
    if (plan.cliStoreLoads?.length) {
      const allowIds = plan.useAllowlist ? plan.allowedStoreIds : plan.prefStoreIds;
      args = [...args, ...buildNativeExtensionCliArgs(plan.cliStoreLoads, allowIds)];
    } else if (plan.useAllowlist && plan.allowedStoreIds?.length) {
      args = [...args, ...buildExtensionAllowlistArg(plan.allowedStoreIds)];
    }
    if (plan.loadDirs.length) {
      args = [...args, ...chromeLocalExtensionArgs(plan.loadDirs)];
    }
  } else {
    const extraExtensionDirs = [...resolveExtraExtensionDirs(userDataRoot)];
    const seenExt = new Set();
    const uniqueExtDirs = [];
    for (const dir of extraExtensionDirs) {
      const abs = path.resolve(String(dir));
      if (seenExt.has(abs)) continue;
      if (!fs.existsSync(path.join(abs, "manifest.json"))) continue;
      seenExt.add(abs);
      uniqueExtDirs.push(abs);
    }
    if (uniqueExtDirs.length) {
      const binary = await getBinaryInfoCached();
      const staged = ensureCloakbrowserExtensionStages(uniqueExtDirs, binary.cacheDir);
      if (staged.length !== uniqueExtDirs.length) {
        console.warn(
          `[extension-stage] incomplete staging (${staged.length}/${uniqueExtDirs.length}) cacheDir=${binary.cacheDir}`,
        );
      }
      args = [...args, ...chromeExtensionArgs(uniqueExtDirs)];
    } else {
      args = [...args, "--disable-extensions"];
    }
  }

  // CDP passthrough: mở remote-debugging-port (localhost-only) để tool workspace
  // khác connect_over_cdp vào context sống. Vô hình với website (chỉ bind 127.0.0.1).
  const debugPort = Number(options.debugPort) || 0;
  if (debugPort > 0) {
    args = [...args, `--remote-debugging-port=${debugPort}`, "--remote-debugging-address=127.0.0.1"];
  }

  const playwrightProxy = toPlaywrightProxy(options.proxy);
  const proxyLaunch = playwrightProxy
    ? { proxy: playwrightProxy }
    : launchOpts.proxy
      ? { proxy: launchOpts.proxy }
      : {};

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: launchOpts.executablePath,
    headless: options.headless ?? false,
    args,
    ignoreDefaultArgs: buildIgnoreDefaultArgs(),
    ...proxyLaunch,
    ...buildContextOptions(options)
  });

  // host-maximized (viewport:null): the CloakBrowser binary sizes the window
  // from the fingerprint seed, which silently overrides `--start-maximized`.
  // Force-maximize the OS window via CDP so the profile opens full-screen.
  if (options.viewport === null) {
    void (async () => {
      try {
        let page = context.pages()[0] ?? null;
        let created = false;
        if (!page) {
          // Avoid leaving an extra "about:blank" tab behind (some runs need a page handle
          // to resolve the windowId via CDP, but we can immediately close it).
          page = await context.newPage();
          created = true;
        }

        const cdp = await context.newCDPSession(page);
        const { windowId } = await cdp.send("Browser.getWindowForTarget");
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "maximized" } });
        await cdp.detach().catch(() => undefined);

        if (created) await page.close().catch(() => undefined);
      } catch {
        // best-effort — non-fatal if the platform rejects window bounds
      }
    })();
  }

  if (options.humanize) {
    try {
      const { patchContext } = await cloakDistImport("human/index.js");
      const { resolveConfig } = await cloakDistImport("human/config.js");
      const cfg = resolveConfig(options.humanPreset ?? "default", options.humanConfig);
      patchContext(context, cfg);
    } catch {
      // humanize optional — launch still succeeds
    }
  }

  return context;
}

async function openProfile(profile, userDataRoot, { debugPort = 0 } = {}) {
  const timer = createLaunchTimer(profile.id, profile.name);
  timer.mark("prep-start");
  const userDataDir = profileDataDir(userDataRoot, profile.id);
  purgeLegacyProfileIdentityChrome(userDataDir, userDataRoot, profile.id);
  fs.mkdirSync(userDataDir, { recursive: true });
  markProfileChromeCleanExit(userDataDir);
  ensureProfileChromeOmniboxSearchPrefs(userDataDir);
  if (!FAST_LAUNCH) {
    purgeProfileIdentityToolbar(userDataDir, userDataRoot, profile.id);
  }

  let nativeExtensionPlan = {
    stageDirs: [],
    loadDirs: [],
    cliStoreLoads: [],
    prefStoreIds: [],
    allowedStoreIds: [],
    useAllowlist: false,
  };
  if (nativeExtensionsEnabled()) {
    nativeExtensionPlan = await prepareNativeExtensionsForLaunch(userDataDir, userDataRoot, profile);
  } else if (cookieBridgeEnabled()) {
    try {
      await prepareCookieBridgeForLaunch(userDataDir, userDataRoot);
    } catch (error) {
      console.warn("[cookie-bridge] store extension unavailable:", error instanceof Error ? error.message : error);
    }
  }

  const launchOptions = buildLaunchOptions(profile, userDataDir, userDataRoot);
  launchOptions.profile = profile;
  launchOptions.userDataRoot = userDataRoot;
  launchOptions.nativeExtensionPlan = nativeExtensionPlan;
  if (Number(debugPort) > 0) launchOptions.debugPort = Number(debugPort);
  timer.mark("spawn-start");
  const context = await launchStealthPersistentContext(launchOptions);
  bindOmniboxSearchGuard(context);
  timer.mark("spawn-done");
  timer.flush("openProfile");
  return {
    context,
    userDataDir,
    debugPort: Number(debugPort) || 0,
  };
}

async function closeContext(context) {
  if (context) {
    await context.close().catch(() => undefined);
  }
}

module.exports = {
  profileDataDir,
  buildLaunchOptions,
  buildStealthChromeArgs,
  buildProfileMarkerArgs,
  buildIgnoreDefaultArgs,
  sanitizeChromeArgs,
  chromeExtensionArgs,
  chromeLocalExtensionArgs,
  buildNativeExtensionCliArgs,
  resolveWindowMode,
  resolveExtraExtensionDirs,
  ensureEngineBinary,
  getBinaryInfo,
  getBinaryInfoCached,
  prepareCookieBridgeForLaunch,
  prepareNativeExtensionsForLaunch,
  openProfile,
  closeContext
};
