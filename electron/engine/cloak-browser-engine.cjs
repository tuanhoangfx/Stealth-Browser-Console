const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const {
  purgeLegacyProfileIdentityChrome,
  purgeProfileIdentityToolbar,
  purgeBrokenExtensionPrefs,
  purgeStaleCookieBridgePrefs,
} = require("../lib/profile-chrome-cleanup.cjs");
const { markProfileChromeCleanExit, chromeSessionRestoreSuppressionArgs } = require("../lib/profile-chrome-session.cjs");
const { ensureProfileChromeOmniboxSearchPrefs } = require("../lib/profile-chrome-omnibox.cjs");
const { bindOmniboxSearchGuard } = require("../lib/omnibox-search-guard.cjs");
const { createLaunchTimer } = require("../lib/profile-launch-timer.cjs");
const {
  cookieBridgeEnabled,
  ensureCookieBridgeStoreExtension,
  resolveCookieBridgeExtensionDirSync,
} = require("../lib/cookie-bridge-store.cjs");
const { pinToolbarExtension, unpackedExtensionId } = require("../lib/profile-chrome-preferences.cjs");
const { ensureCloakbrowserExtensionStages } = require("../lib/cloakbrowser-extension-stage.cjs");

/** Per-profile cookie-bridge prefs scrub — once per process after startup bulk purge. */
const cookieBridgeLaunchPrepped = new Set();

let binaryInfoCache = null;

/** cloakbrowser is ESM-only — lazy dynamic import for Electron CJS main. */
let cloakModulePromise = null;

const CLOAK_IGNORE_DEFAULT_ARGS = ["--enable-automation", "--enable-unsafe-swiftshader"];
const SANDBOX_FLAGS = ["--no-sandbox", "--no-sandbox-and-elevated"];
const EXTENSION_BLOCK_FLAGS = ["--disable-extensions"];

function loadCloakbrowser() {
  if (!cloakModulePromise) {
    cloakModulePromise = import("cloakbrowser");
  }
  return cloakModulePromise;
}

function cloakDistImport(relativePath) {
  const pkgJson = require.resolve("cloakbrowser/package.json");
  const filePath = path.join(path.dirname(pkgJson), "dist", relativePath);
  return import(pathToFileURL(filePath).href);
}

function profileDataDir(userDataRoot, profileId) {
  return path.join(userDataRoot, "profiles", String(profileId));
}

function proxyLaunchExtras(proxy) {
  if (!proxy) return {};
  try {
    require.resolve("mmdb-lib");
    return { proxy, geoip: true };
  } catch {
    return { proxy };
  }
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

function buildStealthChromeArgs(profile) {
  const seed = profile.fingerprintSeed;
  const args = [`--fingerprint=${seed}`];

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

function buildLaunchOptions(profile, userDataDir) {
  const proxy = String(profile.proxy || "").trim();
  const options = {
    userDataDir,
    headless: profile.headless === true,
    humanize: profile.humanize !== false,
    stealthArgs: false,
    ...proxyLaunchExtras(proxy),
    args: [...buildStealthChromeArgs(profile)],
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
  if (!cookieBridgeEnabled()) return null;
  let bridgeDir = resolveCookieBridgeExtensionDirSync(userDataRoot);
  if (!bridgeDir) {
    bridgeDir = await ensureCookieBridgeStoreExtension(userDataRoot);
  }
  if (!bridgeDir) return null;

  const prepKey = path.resolve(String(userDataDir));
  if (!cookieBridgeLaunchPrepped.has(prepKey)) {
    purgeBrokenExtensionPrefs(userDataDir);
    purgeStaleCookieBridgePrefs(userDataDir, bridgeDir);
    cookieBridgeLaunchPrepped.add(prepKey);
  }
  pinToolbarExtension(userDataDir, bridgeDir);
  return bridgeDir;
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

  // CDP passthrough: mở remote-debugging-port (localhost-only) để tool workspace
  // khác connect_over_cdp vào context sống. Vô hình với website (chỉ bind 127.0.0.1).
  const debugPort = Number(options.debugPort) || 0;
  if (debugPort > 0) {
    args = [...args, `--remote-debugging-port=${debugPort}`, "--remote-debugging-address=127.0.0.1"];
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: launchOpts.executablePath,
    headless: options.headless ?? false,
    args,
    ignoreDefaultArgs: buildIgnoreDefaultArgs(),
    ...(launchOpts.proxy ? { proxy: launchOpts.proxy } : {}),
    ...buildContextOptions(options)
  });

  // host-maximized (viewport:null): the CloakBrowser binary sizes the window
  // from the fingerprint seed, which silently overrides `--start-maximized`.
  // Force-maximize the OS window via CDP so the profile opens full-screen.
  if (options.viewport === null) {
    void (async () => {
      try {
        const page = context.pages()[0] ?? (await context.newPage());
        const cdp = await context.newCDPSession(page);
        const { windowId } = await cdp.send("Browser.getWindowForTarget");
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "maximized" } });
        await cdp.detach().catch(() => undefined);
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
  purgeProfileIdentityToolbar(userDataDir, userDataRoot, profile.id);

  if (cookieBridgeEnabled()) {
    try {
      await prepareCookieBridgeForLaunch(userDataDir, userDataRoot);
    } catch (error) {
      console.warn("[cookie-bridge] store extension unavailable:", error instanceof Error ? error.message : error);
    }
  }

  const launchOptions = buildLaunchOptions(profile, userDataDir);
  launchOptions.profile = profile;
  launchOptions.userDataRoot = userDataRoot;
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
  buildIgnoreDefaultArgs,
  sanitizeChromeArgs,
  chromeExtensionArgs,
  resolveWindowMode,
  resolveExtraExtensionDirs,
  ensureEngineBinary,
  getBinaryInfo,
  getBinaryInfoCached,
  prepareCookieBridgeForLaunch,
  openProfile,
  closeContext
};
