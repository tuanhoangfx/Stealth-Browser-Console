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

const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

if (process.platform === "win32") {
  try {
    const cp = require("node:child_process");
    if (cp.ChildProcess?.prototype?.spawn && !cp.ChildProcess.prototype.__stealthHeadlessHideGuardV4) {
      const origSpawn = cp.ChildProcess.prototype.__stealthOrigSpawn || cp.ChildProcess.prototype.spawn;
      cp.ChildProcess.prototype.__stealthOrigSpawn = origSpawn;
      cp.ChildProcess.prototype.spawn = function stealthSafeSpawn(options) {
        if (options && typeof options === "object") {
          const fileStr = String(options.file || "").toLowerCase();
          const argsArr = Array.isArray(options.args) ? options.args : [];
          const isHeadless = argsArr.some((a) => String(a).startsWith("--headless"));
          if (isHeadless && (fileStr.endsWith("\\chrome.exe") || fileStr.endsWith("/chrome.exe"))) {
            const headlessExe = resolveHeadlessCuiExecutablePath(options.file);
            if (headlessExe && headlessExe !== options.file) {
              options.file = headlessExe;
              if (argsArr.length > 0) {
                argsArr[0] = headlessExe;
              }
            }
          } else if (fileStr.endsWith("\\chrome-headless.exe") || fileStr.endsWith("/chrome-headless.exe")) {
            const siblingGui = String(options.file).replace(/chrome-headless\.exe$/i, "chrome.exe");
            resolveHeadlessCuiExecutablePath(fs.existsSync(siblingGui) ? siblingGui : options.file);
          }
          if (
            isHeadless ||
            String(options.file || "").toLowerCase().endsWith("chrome-headless.exe") ||
            fileStr.endsWith("nodew.exe") ||
            fileStr.endsWith("wireproxy.exe")
          ) {
            options.windowsHide = true;
          }
        }
        return origSpawn.call(this, options);
      };
      cp.ChildProcess.prototype.__stealthHeadlessHideGuardV2 = true;
      cp.ChildProcess.prototype.__stealthHeadlessHideGuardV3 = true;
      cp.ChildProcess.prototype.__stealthHeadlessHideGuardV4 = true;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Ensures a dedicated `chrome-headless.exe` copy with PE Subsystem = 3 (`IMAGE_SUBSYSTEM_WINDOWS_CUI`)
 * exists next to `chrome.exe`.
 *
 * Why Subsystem = 3 (`WINDOWS_CUI`) instead of 2 (`WINDOWS_GUI`):
 * When `libuv` (`uv_spawn`) spawns a `WINDOWS_GUI` (2) binary without `STARTF_FORCEOFFFEEDBACK`,
 * Windows `win32kfull.sys` triggers `IDC_APPSTARTING` (5-7s blue spinning cursor at the mouse pointer)
 * on every headless launch because the headless process never creates a visible message-pumping window.
 * Using `IMAGE_SUBSYSTEM_WINDOWS_CUI` (3) with `windowsHide: true` (`CREATE_NO_WINDOW`) guarantees
 * zero console windows AND zero `IDC_APPSTARTING` cursor spins while preserving the dedicated
 * `chrome-headless.exe` process image name for orphan reaping & NUMA balancing.
 */
function resolveHeadlessCuiExecutablePath(guiExePath) {
  if (process.platform !== "win32" || !guiExePath) return guiExePath;
  let cuiExePath = "";
  try {
    const resolvedInput = path.resolve(String(guiExePath));
    if (!fs.existsSync(resolvedInput)) return guiExePath;
    const dir = path.dirname(resolvedInput);
    try {
      for (const entryName of fs.readdirSync(dir)) {
        if (!/\.(?:cui|gui)-stale(?:-\d+)?\.exe$/i.test(entryName)) continue;
        try {
          fs.unlinkSync(path.join(dir, entryName));
        } catch {
          /* ignore while held by running process */
        }
      }
    } catch {
      /* ignore */
    }
    const isAlreadyHeadlessName = path.basename(resolvedInput).toLowerCase() === "chrome-headless.exe";
    const resolvedGui = isAlreadyHeadlessName ? path.join(dir, "chrome.exe") : resolvedInput;
    cuiExePath = path.join(dir, "chrome-headless.exe");
    if (fs.existsSync(resolvedGui) && resolvedGui !== cuiExePath) {
      const srcStat = fs.statSync(resolvedGui);
      let needsCopy = !fs.existsSync(cuiExePath);
      if (!needsCopy) {
        try {
          const dstStat = fs.statSync(cuiExePath);
          if (dstStat.size !== srcStat.size) needsCopy = true;
        } catch {
          needsCopy = true;
        }
      }
      if (needsCopy) {
        try {
          fs.copyFileSync(resolvedGui, cuiExePath);
        } catch {
          // If locked by running process, atomic rename aside + copy below will handle it if needed.
        }
      }
    }
    // Read-only probe first so concurrent headless Chrome launches never fail with EBUSY
    // (STATUS_SHARING_VIOLATION on write handle "r+") when chrome-headless.exe is already running.
    let needsPatch = false;
    let subOffset = 0;
    const rfd = fs.openSync(cuiExePath, "r");
    try {
      const hdr = Buffer.alloc(1024);
      const bytesRead = fs.readSync(rfd, hdr, 0, 1024, 0);
      if (bytesRead >= 256 && hdr.readUInt16LE(0) === 0x5a4d) {
        const peOffset = hdr.readUInt32LE(0x3c);
        if (peOffset + 96 <= bytesRead && hdr.readUInt32LE(peOffset) === 0x00004550) {
          subOffset = peOffset + 4 + 20 + 68;
          const curSub = hdr.readUInt16LE(subOffset);
          if (curSub !== 3) needsPatch = true;
        }
      }
    } finally {
      fs.closeSync(rfd);
    }
    if (needsPatch && subOffset > 0) {
      const writeSubsystemCui = (targetPath) => {
        const wfd = fs.openSync(targetPath, "r+");
        try {
          const b = Buffer.alloc(2);
          b.writeUInt16LE(3, 0); // 3 = IMAGE_SUBSYSTEM_WINDOWS_CUI (0 IDC_APPSTARTING cursor spin)
          fs.writeSync(wfd, b, 0, 2, subOffset);
        } finally {
          fs.closeSync(wfd);
        }
      };
      try {
        writeSubsystemCui(cuiExePath);
      } catch {
        // Running chrome-headless.exe holds an image section lock against r+ writes,
        // but Windows NTFS permits renaming a running .exe and copying clean chrome.exe into place.
        if (fs.existsSync(resolvedGui) && resolvedGui !== cuiExePath) {
          const stalePath = path.join(dir, "chrome-headless.cui-stale.exe");
          try {
            fs.unlinkSync(stalePath);
          } catch {
            /* ignore if stalePath is also still held */
          }
          const fallbackStale = fs.existsSync(stalePath)
            ? path.join(dir, `chrome-headless.cui-stale-${process.pid}.exe`)
            : stalePath;
          fs.renameSync(cuiExePath, fallbackStale);
          fs.copyFileSync(resolvedGui, cuiExePath);
          writeSubsystemCui(cuiExePath);
          try {
            fs.unlinkSync(fallbackStale);
          } catch {
            /* cleaned on next launch after old process exits */
          }
        }
      }
    }
    return cuiExePath;
  } catch {
    if (cuiExePath && fs.existsSync(cuiExePath)) return cuiExePath;
    return guiExePath;
  }
}

/** Per-profile cookie-bridge prefs scrub — once per process after startup bulk purge. */
const cookieBridgeLaunchPrepped = new Set();
const FAST_LAUNCH = String(process.env.STEALTH_FAST_LAUNCH ?? "1").toLowerCase() !== "0";

/**
 * Frozen CloakBrowser Engine Lock:
 * Locks P0003 to `cloakbrowser@0.6.5` (last keyless wrapper with multi-proxy GeoIP isolation,
 * 70MB DB atomic replace fix, and first-page humanize fix) + `chromium-146.0.7680.177.5`
 * (free unlimited-session tier). Disables background auto-update checks (`CLOAKBROWSER_AUTO_UPDATE=false`)
 * and prevents upgrades to license-gated `>=0.7.0` / `-pro` builds.
 */
const FROZEN_CLOAKBROWSER_WRAPPER_VERSION = "0.6.5";
const FROZEN_CLOAKBROWSER_CHROMIUM_VERSION = "146.0.7680.177.5";
const FROZEN_CLOAKBROWSER_WIN64_SHA256 = "b213795cb32c3169f766c74ce1d0275fc89d3df256de39c04da7fb4c23b7fdbe";
const LENOVO_CLOAKBROWSER_MIRROR_HOST = process.env.LENOVO_SSH || "PC@100.88.80.113";
const LENOVO_CLOAKBROWSER_MIRROR_DIR = "D:/backups/cloakbrowser";

function resolveCloakCacheDir() {
  return process.env.CLOAKBROWSER_CACHE_DIR || path.join(os.homedir(), ".cloakbrowser");
}

let _frozenCloakEnvDiskSynced = false;

function enforceFrozenCloakbrowserEnv() {
  process.env.CLOAKBROWSER_AUTO_UPDATE = "false";
  if (!process.env.CLOAKBROWSER_VERSION) {
    process.env.CLOAKBROWSER_VERSION = FROZEN_CLOAKBROWSER_CHROMIUM_VERSION;
  }
  if (_frozenCloakEnvDiskSynced) return;
  try {
    const cacheDir = resolveCloakCacheDir();
    if (fs.existsSync(cacheDir)) {
      const welcomeMarker = path.join(cacheDir, ".welcome_shown");
      fs.writeFileSync(welcomeMarker, String(Math.floor(Date.now() / 1000)));
      for (const name of ["latest_version_windows-x64", "latest_pro_version_windows-x64"]) {
        const markerPath = path.join(cacheDir, name);
        if (fs.existsSync(markerPath)) {
          const val = fs.readFileSync(markerPath, "utf8").trim();
          if (val && val !== FROZEN_CLOAKBROWSER_CHROMIUM_VERSION) {
            fs.unlinkSync(markerPath);
          }
        }
      }
      _frozenCloakEnvDiskSynced = true;
    }
  } catch {
    /* non-fatal */
  }
}

function extractMirrorZipArchive(mirrorZip, binaryDir) {
  fs.mkdirSync(binaryDir, { recursive: true });
  const sysTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  if (process.platform === "win32" && fs.existsSync(sysTar)) {
    try {
      execFileSync(sysTar, ["-x", "-f", mirrorZip, "-C", binaryDir], {
        timeout: 120_000,
        windowsHide: true,
        stdio: "ignore",
      });
      return true;
    } catch {
      /* fall through to .NET ZipFile fallback */
    }
  }
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:CB_MIRROR_ZIP, $env:CB_MIRROR_DEST)",
    ],
    {
      timeout: 120_000,
      windowsHide: true,
      env: { ...process.env, CB_MIRROR_ZIP: mirrorZip, CB_MIRROR_DEST: binaryDir },
    },
  );
  return true;
}

function maybeRestoreFrozenBinaryFromLocalMirror() {
  if (process.platform !== "win32") return false;
  const cacheDir = resolveCloakCacheDir();
  const binaryDir = path.join(cacheDir, `chromium-${FROZEN_CLOAKBROWSER_CHROMIUM_VERSION}`);
  const chromeExe = path.join(binaryDir, "chrome.exe");
  if (fs.existsSync(chromeExe)) return true;
  const backupsDir = path.join(cacheDir, "backups");
  const zipFileName = `cloakbrowser-windows-x64-${FROZEN_CLOAKBROWSER_CHROMIUM_VERSION}.zip`;
  const mirrorZip = path.join(backupsDir, zipFileName);
  if (!fs.existsSync(mirrorZip)) {
    try {
      fs.mkdirSync(backupsDir, { recursive: true });
      const tmpZip = `${mirrorZip}.tmp`;
      execFileSync(
        "scp",
        ["-q", `${LENOVO_CLOAKBROWSER_MIRROR_HOST}:${LENOVO_CLOAKBROWSER_MIRROR_DIR}/${zipFileName}`, tmpZip],
        { timeout: 300_000, windowsHide: true },
      );
      if (fs.existsSync(tmpZip)) {
        const sha = crypto.createHash("sha256").update(fs.readFileSync(tmpZip)).digest("hex");
        if (sha === FROZEN_CLOAKBROWSER_WIN64_SHA256) {
          fs.renameSync(tmpZip, mirrorZip);
        } else {
          fs.unlinkSync(tmpZip);
        }
      }
    } catch {
      /* Lenovo mirror offline or unreachable — fall back */
    }
  }
  if (!fs.existsSync(mirrorZip)) return false;
  try {
    extractMirrorZipArchive(mirrorZip, binaryDir);
    return fs.existsSync(chromeExe);
  } catch {
    return false;
  }
}

enforceFrozenCloakbrowserEnv();

let binaryInfoCache = null;

/** cloakbrowser is ESM-only — lazy dynamic import for Electron CJS main. */
let cloakModulePromise = null;

const CLOAK_IGNORE_DEFAULT_ARGS = [
  "--enable-automation",
  "--enable-unsafe-swiftshader",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-component-update",
  "--disable-background-networking",
  "--disable-client-side-phishing-detection",
  "--disable-popup-blocking",
  "--disable-back-forward-cache",
  "--disable-field-trial-config",
];
const SANDBOX_FLAGS = ["--no-sandbox", "--no-sandbox-and-elevated"];
const EXTENSION_BLOCK_FLAGS = ["--disable-extensions"];

function loadCloakbrowser() {
  if (!cloakModulePromise) {
    const runtime = packagedRuntime();
    const specifier = resolveCloakbrowserImportSpecifier(runtime);
    cloakModulePromise = import(specifier).catch((err) => {
      cloakModulePromise = null;
      throw err;
    });
  }
  return cloakModulePromise;
}

function cloakDistImport(relativePath) {
  const runtime = packagedRuntime();
  const pkgDir = resolveCloakbrowserPackageDir(runtime);
  const filePath = path.join(pkgDir, "dist", relativePath);
  return import(pathToFileURL(filePath).href);
}

const { resolveProfileUserDataDir } = require("../lib/profiles-location.cjs");

function profileDataDir(userDataRoot, profileId) {
  return resolveProfileUserDataDir(userDataRoot, profileId);
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
  const rawSeed = Number(profile?.fingerprintSeed);
  const seed =
    Number.isFinite(rawSeed) && rawSeed > 0
      ? Math.trunc(rawSeed)
      : (crypto.createHash("sha256").update(String(profile?.id || profile?.name || "default")).digest().readUInt32LE(0) % 899999) + 100000;
  const args = [`--fingerprint=${seed}`, ...buildProfileMarkerArgs(profile, userDataRoot)];
  const isHeadless = profile?.headless === true || isAgentSmokeLaunch();

  // Host-level sandbox flag (not the spoofed platform).
  if (process.platform === "linux") {
    args.push("--no-sandbox");
  }

  args.push(`--fingerprint-platform=${resolveSpoofPlatform(profile)}`);

  if (process.platform === "win32" || process.platform === "darwin") {
    args.push("--ignore-gpu-blocklist");
  }

  if (!isHeadless) {
    const winMode = resolveWindowMode(profile);
    if (winMode === "host-maximized") {
      args.push("--start-maximized");
    } else {
      try {
        const { resolveTargetDisplayWorkArea } = require("../lib/app-settings.cjs");
        const resolved = resolveTargetDisplayWorkArea(profile?.targetMonitor);
        const wa = resolved?.workArea;
        if (wa && Number.isFinite(wa.x) && Number.isFinite(wa.y)) {
          args.push(`--window-position=${wa.x + 32},${wa.y + 24}`);
        }
      } catch {
        /* ignore display position lookup failure */
      }
    }
  }

  args.push("--disable-infobars");
  if (isHeadless) {
    // Anti-Freeze Headless Chrome Tuning: cap V8 renderer & compositor raster threads per headless instance
    // and cap disk/media cache to 32 MB / 16 MB so Cloudflare/site JS+WASM stay cached across navigations
    // without hammering the QLC NVMe SSD with unbounded Cache_Data growth.
    // Also set --window-size=1920,1080 so window.outerWidth/outerHeight (1920x1080) matches inner (1920x947) + screen (1920x1080).
    args.push(
      "--window-size=1920,1080",
      "--renderer-process-limit=2",
      "--num-raster-threads=1",
      "--disk-cache-size=33554432",
      "--media-cache-size=16777216",
      "--mute-audio",
      "--disable-logging",
      "--disable-backgrounding-occluded-windows",
      "--disable-direct-composition",
    );
  } else {
    // Headed User Browser Tuning: offload DOM/table tile rasterization from 2.30GHz Xeon cores
    // onto the GPU via GPU rasterization + zero-copy + 4 raster threads.
    args.push(
      "--enable-gpu-rasterization",
      "--enable-zero-copy",
      "--num-raster-threads=4",
    );
  }
  for (const flag of chromeSessionRestoreSuppressionArgs()) {
    args.push(flag);
  }
  if (Array.isArray(profile?.extraChromeArgs)) {
    for (const extra of profile.extraChromeArgs) {
      if (extra) args.push(String(extra));
    }
  }
  return ensureDisabledChromeFeatures(args);
}

const DEFAULT_DISABLED_CHROME_FEATURES = [
  "AvoidUnnecessaryBeforeUnloadCheckSync",
  "BoundaryEventDispatchTracksNodeRemoval",
  "DestroyProfileOnBrowserClose",
  "DialMediaRouteProvider",
  "GlobalMediaControls",
  "LensOverlay",
  "MediaRouter",
  "Translate",
  "AutoDeElevate",
  "ExtensionDisableUnsupportedDeveloper",
];

function ensureDisabledChromeFeatures(args) {
  const featureSet = new Set(DEFAULT_DISABLED_CHROME_FEATURES);
  const filtered = [];
  for (const arg of args || []) {
    const str = String(arg || "");
    if (str.startsWith("--disable-features=")) {
      const list = str
        .slice("--disable-features=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const item of list) featureSet.add(item);
      continue;
    }
    filtered.push(str);
  }
  filtered.push(`--disable-features=${[...featureSet].join(",")}`);
  return filtered;
}

/**
 * Playwright matches `ignoreDefaultArgs` by exact string equality (`indexOf`), so we resolve
 * Playwright's raw `--disable-features=...` switch dynamically to strip `ThirdPartyStoragePartitioning`,
 * `HttpsUpgrades`, `PaintHolding`, `RenderDocument`, and `OptimizationHints` before our clean flag applies.
 */
function resolvePlaywrightDisableFeaturesArgs() {
  try {
    const { chromiumSwitches } = require("playwright-core/lib/server/chromium/chromiumSwitches");
    if (typeof chromiumSwitches === "function") {
      return chromiumSwitches(false).filter((arg) => String(arg).startsWith("--disable-features="));
    }
  } catch {
    /* fallback to known Playwright 1.59 default string */
  }
  return [
    "--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints",
  ];
}

function buildIgnoreDefaultArgs({ stripAboutBlank = false } = {}) {
  const base = shouldStripSandboxFlags()
    ? [...CLOAK_IGNORE_DEFAULT_ARGS, ...SANDBOX_FLAGS, ...EXTENSION_BLOCK_FLAGS]
    : [...CLOAK_IGNORE_DEFAULT_ARGS];
  for (const pwFeatureArg of resolvePlaywrightDisableFeaturesArgs()) {
    if (!base.includes(pwFeatureArg)) base.push(pwFeatureArg);
  }
  if (stripAboutBlank && !base.includes("about:blank")) {
    base.push("about:blank");
  }
  return base;
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
  const base = shouldStripSandboxFlags()
    ? (args || []).filter((arg) => {
        const key = String(arg || "").split("=")[0];
        return !SANDBOX_FLAGS.includes(key) && !EXTENSION_BLOCK_FLAGS.includes(key);
      })
    : [...(args || [])];
  return ensureDisabledChromeFeatures(base);
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
  const isHeadless = profile.headless === true || agentSmoke;
  const options = {
    userDataDir,
    headless: isHeadless,
    humanize: profile.humanize !== false,
    stealthArgs: false,
    ...proxyLaunchExtras(proxy),
    args: [...buildStealthChromeArgs(profile, userDataRoot)],
    profile
  };

  // Engine-honored device surface (cloakbrowser routes these to undetectable
  // binary flags / context options). Empty values fall back to geoip/auto.
  // When running on Local IP (`proxy === ""`) without Static IP pin, ignore any
  // stale foreign timezone/locale so the browser matches the host's Local IP.
  const hasProxyOrStaticPin = Boolean(
    proxy ||
      profile.staticIp === true ||
      Number(profile.static_ip) === 1 ||
      profile.activeVpnCountry,
  );
  if (profile.timezone && hasProxyOrStaticPin) options.timezone = String(profile.timezone);
  if (profile.locale && hasProxyOrStaticPin) options.locale = String(profile.locale);
  if (profile.userAgent) options.userAgent = String(profile.userAgent);

  const windowMode = resolveWindowMode(profile);
  const vw = Number(profile.viewportW) || 0;
  const vh = Number(profile.viewportH) || 0;
  if (windowMode === "host-maximized" && !isHeadless) {
    // Playwright viewport:null — use native OS window size (no fixed 1920×947 lock).
    // In headless mode on Chromium 146.x, omit viewport so CloakBrowser's coherent DEFAULT_VIEWPORT (1920×947) is used.
    options.viewport = null;
  } else if (windowMode === "preset-viewport" && vw > 0 && vh > 0) {
    options.viewport = { width: vw, height: vh };
  }
  // engine-default (or headless host-maximized): omit viewport → cloakbrowser DEFAULT_VIEWPORT (1920×947).

  if (profile.colorScheme) options.colorScheme = String(profile.colorScheme);

  return options;
}

async function ensureEngineBinary() {
  enforceFrozenCloakbrowserEnv();
  maybeRestoreFrozenBinaryFromLocalMirror();
  const { ensureBinary, binaryInfo } = await loadCloakbrowser();
  await ensureBinary(undefined, FROZEN_CLOAKBROWSER_CHROMIUM_VERSION);
  const info = binaryInfo(FROZEN_CLOAKBROWSER_CHROMIUM_VERSION);
  const binDir = info?.binaryDir || (info?.binaryPath ? path.dirname(info.binaryPath) : "") || (info?.executablePath ? path.dirname(info.executablePath) : "");
  if (binDir) {
    ensureWindowsWidevineCdm(binDir);
  }
  return info;
}

async function getBinaryInfo() {
  enforceFrozenCloakbrowserEnv();
  const { binaryInfo } = await loadCloakbrowser();
  return binaryInfo(FROZEN_CLOAKBROWSER_CHROMIUM_VERSION);
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

let _binaryVerifiedOnce = false;
let _widevineVerifiedOnce = false;

function parseNumericVersionParts(ver) {
  return String(ver || "")
    .split(".")
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
}

function compareNumericVersionDesc(a, b) {
  const va = parseNumericVersionParts(a);
  const vb = parseNumericVersionParts(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i += 1) {
    const diff = (vb[i] ?? 0) - (va[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return String(b).localeCompare(String(a));
}

function isValidWindowsWidevineDir(dir) {
  if (!dir) return false;
  return (
    fs.existsSync(path.join(dir, "manifest.json")) &&
    fs.existsSync(path.join(dir, "_platform_specific", "win_x64", "widevinecdm.dll"))
  );
}

/**
 * Locate the newest installed Google Chrome / Edge WidevineCdm directory on Windows.
 */
function findInstalledWindowsWidevineCdmDir(extraSearchRoots = []) {
  if (process.platform !== "win32") return null;
  const appRoots = [
    ...extraSearchRoots,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Google", "Chrome", "Application") : "",
    process.env["ProgramFiles(x86)"]
      ? path.join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application")
      : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application") : "",
    process.env["ProgramFiles(x86)"]
      ? path.join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application")
      : "",
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Microsoft", "Edge", "Application") : "",
  ].filter(Boolean);

  for (const appRoot of appRoots) {
    try {
      if (!fs.existsSync(appRoot)) continue;
      const versionDirs = fs
        .readdirSync(appRoot, { withFileTypes: true })
        .filter((ent) => ent.isDirectory() && /^\d+(?:\.\d+)+$/.test(ent.name))
        .map((ent) => ent.name)
        .sort(compareNumericVersionDesc);
      for (const ver of versionDirs) {
        const candidate = path.join(appRoot, ver, "WidevineCdm");
        if (isValidWindowsWidevineDir(candidate)) return candidate;
      }
      const direct = path.join(appRoot, "WidevineCdm");
      if (isValidWindowsWidevineDir(direct)) return direct;
    } catch {
      /* ignore unreadable install dir */
    }
  }
  return null;
}

/**
 * Sideload WidevineCdm once into the CloakBrowser binary directory on Windows so
 * `com.widevine.alpha` (Netflix/DRM) works across all profiles with 0ms per-profile overhead.
 */
function ensureWindowsWidevineCdm(binaryDir, { force = false, sourceDir = "" } = {}) {
  if (process.platform !== "win32" || !binaryDir) return false;
  if (_widevineVerifiedOnce && !force) return true;
  const targetDir = path.join(binaryDir, "WidevineCdm");
  if (isValidWindowsWidevineDir(targetDir)) {
    _widevineVerifiedOnce = true;
    return true;
  }
  const srcDir = sourceDir && isValidWindowsWidevineDir(sourceDir)
    ? sourceDir
    : findInstalledWindowsWidevineCdmDir();
  if (!srcDir) {
    const backupsDir = path.join(resolveCloakCacheDir(), "backups");
    const wvZipName = `cloakbrowser-widevine-win64-${FROZEN_CLOAKBROWSER_CHROMIUM_VERSION}.zip`;
    const localWvZip = path.join(backupsDir, wvZipName);
    if (!fs.existsSync(localWvZip)) {
      try {
        fs.mkdirSync(backupsDir, { recursive: true });
        const tmpZip = `${localWvZip}.tmp`;
        execFileSync(
          "scp",
          ["-q", `${LENOVO_CLOAKBROWSER_MIRROR_HOST}:${LENOVO_CLOAKBROWSER_MIRROR_DIR}/${wvZipName}`, tmpZip],
          { timeout: 120_000, windowsHide: true },
        );
        if (fs.existsSync(tmpZip) && fs.statSync(tmpZip).size > 100_000) {
          fs.renameSync(tmpZip, localWvZip);
        } else {
          fs.rmSync(tmpZip, { force: true });
        }
      } catch {
        /* mirror offline */
      }
    }
    if (fs.existsSync(localWvZip)) {
      try {
        extractMirrorZipArchive(localWvZip, binaryDir);
        if (isValidWindowsWidevineDir(targetDir)) {
          _widevineVerifiedOnce = true;
          return true;
        }
      } catch {
        /* fall through */
      }
    }
    return false;
  }
  const tmpDir = path.join(binaryDir, `.WidevineCdm.tmp.${process.pid}`);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.cpSync(srcDir, tmpDir, { recursive: true, force: true });
    if (isValidWindowsWidevineDir(tmpDir)) {
      if (!isValidWindowsWidevineDir(targetDir)) {
        try {
          fs.renameSync(tmpDir, targetDir);
        } catch {
          fs.cpSync(tmpDir, targetDir, { recursive: true, force: true });
        }
      }
      if (isValidWindowsWidevineDir(targetDir)) {
        _widevineVerifiedOnce = true;
        return true;
      }
    }
  } catch {
    /* non-fatal — concurrent launch or locked file */
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  return isValidWindowsWidevineDir(targetDir);
}

async function resolveExtensionLaunchArgs(options) {
  const userDataRoot = options.userDataRoot || path.resolve(options.userDataDir, "..", "..");
  const { getExtensionToggles } = require("../lib/app-settings.cjs");
  const { resolveEffectiveExtensionToggles, anyExtensionToggleEnabled } = require("../lib/extension-toggles.cjs");
  const effectiveToggles = resolveEffectiveExtensionToggles(
    getExtensionToggles(),
    options.profile?.extensionOverrides,
  );
  if (!anyExtensionToggleEnabled(effectiveToggles)) {
    return ["--disable-extensions"];
  }
  if (nativeExtensionsEnabled()) {
    const plan = options.nativeExtensionPlan || {
      stageDirs: [],
      loadDirs: [],
      cliStoreLoads: [],
      prefStoreIds: [],
      allowedStoreIds: [],
      useAllowlist: false,
    };
    const extArgs = [];
    if (plan.cliStoreLoads?.length) {
      const allowIds = plan.useAllowlist ? plan.allowedStoreIds : plan.prefStoreIds;
      extArgs.push(...buildNativeExtensionCliArgs(plan.cliStoreLoads, allowIds));
    } else if (plan.useAllowlist && plan.allowedStoreIds?.length) {
      extArgs.push(...buildExtensionAllowlistArg(plan.allowedStoreIds));
    }
    if (plan.loadDirs.length) {
      extArgs.push(...chromeLocalExtensionArgs(plan.loadDirs));
    }
    return extArgs;
  }
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
  if (!uniqueExtDirs.length) {
    return ["--disable-extensions"];
  }
  const binary = await getBinaryInfoCached();
  const staged = ensureCloakbrowserExtensionStages(uniqueExtDirs, binary.cacheDir);
  if (staged.length !== uniqueExtDirs.length) {
    console.warn(
      `[extension-stage] incomplete staging (${staged.length}/${uniqueExtDirs.length}) cacheDir=${binary.cacheDir}`,
    );
  }
  return chromeExtensionArgs(uniqueExtDirs);
}

function positionHeadedWindowsAsync(options) {
  if (options.headless === true) return;
  void (async () => {
    try {
      let wa = options.targetWorkArea || null;
      if (!wa) {
        try {
          const { resolveTargetDisplayWorkArea } = require("../lib/app-settings.cjs");
          wa = resolveTargetDisplayWorkArea(options.profile?.targetMonitor)?.workArea || null;
        } catch {
          wa = null;
        }
      }
      if (wa) {
        try {
          const { moveChromeWindowsToTargetWorkAreaNative } = require("../lib/taskbar-apply-worker.cjs");
          const { extractProfileCode } = require("../lib/profile-code.cjs");
          moveChromeWindowsToTargetWorkAreaNative(wa, {
            code: extractProfileCode(options.profile?.name || "", options.profile?.id || ""),
            maximize: options.viewport === null,
          });
        } catch {
          /* ignore */
        }
      }
    } catch {
      // best-effort — non-fatal if the platform rejects window bounds
    }
  })();
}

const _proxyGeoipCache = new Map();
const PROXY_GEOIP_CACHE_TTL_MS = 60_000;

function extractArgValue(args, key) {
  const prefix = `${key}=`;
  for (const a of args || []) {
    const s = String(a || "");
    if (s.startsWith(prefix)) return s.slice(prefix.length);
  }
  return "";
}

async function buildCloakLaunchOptionsSafe(cbBuildLaunchOptions, params) {
  const proxyKey = typeof params?.proxy === "string" ? params.proxy.trim() : "";
  if (params?.geoip && proxyKey && !params?.forceGeoipRefresh) {
    const cached = _proxyGeoipCache.get(proxyKey);
    if (cached && Date.now() - cached.at < PROXY_GEOIP_CACHE_TTL_MS) {
      const extraArgs = [...(params.args || [])];
      if (cached.webrtcIp && !extraArgs.some((a) => String(a).startsWith("--fingerprint-webrtc-ip="))) {
        extraArgs.push(`--fingerprint-webrtc-ip=${cached.webrtcIp}`);
      }
      return await cbBuildLaunchOptions({
        ...params,
        geoip: false,
        ...(!params.timezone && cached.timezone ? { timezone: cached.timezone } : {}),
        ...(!params.locale && cached.locale ? { locale: cached.locale } : {}),
        args: extraArgs,
      });
    }
  }
  try {
    const res = await cbBuildLaunchOptions(params);
    if (params?.geoip && proxyKey && Array.isArray(res?.args)) {
      const timezone = params.timezone || extractArgValue(res.args, "--fingerprint-timezone");
      const locale = params.locale || extractArgValue(res.args, "--fingerprint-locale");
      const webrtcIp = extractArgValue(res.args, "--fingerprint-webrtc-ip");
      if (timezone || locale || webrtcIp) {
        if (_proxyGeoipCache.size > 512) _proxyGeoipCache.clear();
        _proxyGeoipCache.set(proxyKey, { timezone, locale, webrtcIp, at: Date.now() });
      }
    }
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (params?.geoip && /geoip|egress ip/i.test(msg)) {
      console.warn(`[cloakbrowser] GeoIP skipped on launch (${msg}); launching without GeoIP override`);
      return await cbBuildLaunchOptions({ ...params, geoip: false });
    }
    throw err;
  }
}

/**
 * Desktop launch — ignoreDefaultArgs:true blocks Playwright injecting --no-sandbox.
 */
async function launchStealthPersistentContext(profileOptions) {
  enforceFrozenCloakbrowserEnv();
  if (!_binaryVerifiedOnce) {
    maybeRestoreFrozenBinaryFromLocalMirror();
  }
  const cloak = await loadCloakbrowser();
  const { buildLaunchOptions: cbBuildLaunchOptions, buildContextOptions, ensureBinary } = cloak;
  const { chromium } = require("playwright-core");

  const options = profileOptions;
  const userDataDir = options.userDataDir;
  if (!userDataDir) throw new Error("userDataDir is required");

  const cloakOptions = options;

  if (!_binaryVerifiedOnce) {
    const exe = await ensureBinary(undefined, FROZEN_CLOAKBROWSER_CHROMIUM_VERSION);
    if (exe) ensureWindowsWidevineCdm(path.dirname(exe));
    _binaryVerifiedOnce = true;
  }
  const launchOpts = await buildCloakLaunchOptionsSafe(cbBuildLaunchOptions, {
    ...cloakOptions,
    browserVersion: FROZEN_CLOAKBROWSER_CHROMIUM_VERSION,
    stealthArgs: false,
    headless: options.headless ?? false,
  });
  ensureWindowsWidevineCdm(path.dirname(launchOpts.executablePath));

  let args = [
    ...sanitizeChromeArgs(launchOpts.args || []),
    ...(await resolveExtensionLaunchArgs(options)),
  ];

  // CDP passthrough — the only attach path (shared/operator-cdp.json).
  // Other tools use connect_over_cdp on this port. E0002 is the in-profile operator.
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

  const isHeadlessLaunch = Boolean(options.headless);
  const effectiveExePath = isHeadlessLaunch
    ? resolveHeadlessCuiExecutablePath(launchOpts.executablePath)
    : launchOpts.executablePath;

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: effectiveExePath,
    headless: isHeadlessLaunch,
    args,
    ignoreDefaultArgs: buildIgnoreDefaultArgs(),
    ...proxyLaunch,
    ...buildContextOptions(options)
  });

  // Position headed profile windows on the configured Target Monitor (Monitor 2 by default on dual monitors)
  // and force-maximize via CDP when host-maximized (`viewport: null`).
  // Never call `context.newPage()` here — spawning a fallback page created a duplicate "New Tab".
  positionHeadedWindowsAsync(options);

  if (options.humanize) {
    void applyHumanizeToContext(context, options);
  }

  return context;
}

async function applyHumanizeToContext(context, options = {}) {
  if (!context || options.humanize === false) return false;
  try {
    const { patchContext, resolveConfig } = await cloakDistImport("human/index.js");
    const cfg = resolveConfig(options.humanPreset ?? "default", options.humanConfig);
    patchContext(context, cfg);
    return true;
  } catch {
    return false;
  }
}

async function prepareProfileLaunchPlan(profile, userDataRoot, { userDataDirOverride = "" } = {}) {
  const isHeadlessFastPath = Boolean(profile?.headless === true && !profile?.loadExtensionsInHeadless);
  const isHeadless = Boolean(profile?.headless === true || isAgentSmokeLaunch());
  const userDataDir = userDataDirOverride
    ? path.resolve(String(userDataDirOverride))
    : profileDataDir(userDataRoot, profile.id);
  if (!isHeadlessFastPath) {
    purgeLegacyProfileIdentityChrome(userDataDir, userDataRoot, profile.id);
  }
  fs.mkdirSync(userDataDir, { recursive: true });
  let targetWorkArea = null;
  if (!isHeadless) {
    try {
      const { resolveTargetDisplayWorkArea } = require("../lib/app-settings.cjs");
      targetWorkArea = resolveTargetDisplayWorkArea(profile?.targetMonitor)?.workArea || null;
    } catch {
      targetWorkArea = null;
    }
  }
  markProfileChromeCleanExit(userDataDir, {
    targetWorkArea,
    windowMode: resolveWindowMode(profile),
  });
  if (!isHeadlessFastPath) {
    ensureProfileChromeOmniboxSearchPrefs(userDataDir);
    if (!FAST_LAUNCH) {
      purgeProfileIdentityToolbar(userDataDir, userDataRoot, profile.id);
    }
  }

  let nativeExtensionPlan = {
    stageDirs: [],
    loadDirs: [],
    cliStoreLoads: [],
    prefStoreIds: [],
    allowedStoreIds: [],
    useAllowlist: false,
  };
  if (!isHeadlessFastPath && nativeExtensionsEnabled()) {
    nativeExtensionPlan = await prepareNativeExtensionsForLaunch(userDataDir, userDataRoot, profile);
  } else if (!isHeadlessFastPath && cookieBridgeEnabled()) {
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
  launchOptions.targetWorkArea = targetWorkArea;
  return { launchOptions, userDataDir };
}

/**
 * Native Fast-Spawn Headed Launch (zero blocking Playwright pipe handshake at startup).
 * When `debugPort > 0`, exposes `--remote-debugging-port` on localhost so Standard mode
 * launches in <100ms while preserving full lazy CDP (`connectOverCDP`) attachment.
 * When `debugPort === 0`, launches in Pure Window (No CDP) mode.
 */
async function openPureHeadedProfile(
  profile,
  userDataRoot,
  { launchUrl = "", debugPort = 0, userDataDirOverride = "" } = {},
) {
  const timer = createLaunchTimer(profile.id, profile.name);
  timer.mark("prep-start");
  const { launchOptions, userDataDir } = await prepareProfileLaunchPlan(
    { ...profile, headless: false },
    userDataRoot,
    { userDataDirOverride },
  );

  enforceFrozenCloakbrowserEnv();
  if (!_binaryVerifiedOnce) {
    maybeRestoreFrozenBinaryFromLocalMirror();
  }
  const cloak = await loadCloakbrowser();
  const { buildLaunchOptions: cbBuildLaunchOptions, ensureBinary } = cloak;
  if (!_binaryVerifiedOnce) {
    const exe = await ensureBinary(undefined, FROZEN_CLOAKBROWSER_CHROMIUM_VERSION);
    if (exe) ensureWindowsWidevineCdm(path.dirname(exe));
    _binaryVerifiedOnce = true;
  }

  const launchOpts = await buildCloakLaunchOptionsSafe(cbBuildLaunchOptions, {
    ...launchOptions,
    browserVersion: FROZEN_CLOAKBROWSER_CHROMIUM_VERSION,
    stealthArgs: false,
    headless: false,
  });
  ensureWindowsWidevineCdm(path.dirname(launchOpts.executablePath));

  const args = [
    ...sanitizeChromeArgs(launchOpts.args || []),
    ...(await resolveExtensionLaunchArgs(launchOptions)),
  ];
  const hasProxyFlag = args.some((a) => String(a).startsWith("--proxy-server="));
  const proxyServer = launchOptions.proxy || launchOpts.proxy?.server || "";
  if (!hasProxyFlag && proxyServer) {
    args.push(`--proxy-server=${proxyServer}`);
    if (launchOpts.proxy?.bypass) {
      args.push(`--proxy-bypass-list=${launchOpts.proxy.bypass}`);
    }
  }
  const resolvedDebugPort = Number(debugPort) > 0 ? Number(debugPort) : 0;
  if (resolvedDebugPort > 0) {
    args.push(`--remote-debugging-port=${resolvedDebugPort}`, "--remote-debugging-address=127.0.0.1");
  }
  args.push(
    `--user-data-dir=${userDataDir}`,
    "--profile-directory=Default",
    "--no-default-browser-check",
    "--no-first-run",
  );
  if (launchUrl && /^https?:\/\//i.test(String(launchUrl))) {
    args.push(String(launchUrl));
  }

  timer.mark("spawn-start");
  const { spawn } = require("node:child_process");
  const child = spawn(launchOpts.executablePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref?.();
  positionHeadedWindowsAsync(launchOptions);
  timer.mark("spawn-done");
  timer.flush(resolvedDebugPort > 0 ? "openFastSpawnWithCdp" : "openPureHeadedProfile");

  return {
    pid: Number(child.pid) || 0,
    userDataDir,
    debugPort: resolvedDebugPort,
    pureHeaded: resolvedDebugPort === 0,
  };
}

async function openProfile(profile, userDataRoot, { debugPort = 0, userDataDirOverride = "" } = {}) {
  const timer = createLaunchTimer(profile.id, profile.name);
  timer.mark("prep-start");
  const { launchOptions, userDataDir } = await prepareProfileLaunchPlan(profile, userDataRoot, {
    userDataDirOverride,
  });
  if (Number(debugPort) > 0) launchOptions.debugPort = Number(debugPort);
  timer.mark("spawn-start");
  const context = await launchStealthPersistentContext(launchOptions);
  try {
    context.__stealthProfileId = String(profile?.id || "");
    context.__stealthProfileCode = String(profile?.name || "").trim().slice(0, 4).padStart(4, "0");
    context.__stealthUserDataDir = String(userDataDir || "");
  } catch {
    /* ignore */
  }
  bindOmniboxSearchGuard(context);
  timer.mark("spawn-done");
  timer.flush("openProfile");
  return {
    context,
    userDataDir,
    debugPort: Number(debugPort) || 0,
  };
}

function isContextPriorityLocked(context) {
  if (!context) return false;
  try {
    const code = String(context.__stealthProfileCode || "").trim();
    const sid = String(context.__stealthProfileId || "").trim().toLowerCase();
    const udir = String(context.__stealthUserDataDir || "").trim().toLowerCase();
    const fp = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\priority-agent-locks.json";
    if (!fs.existsSync(fp)) return false;
    const raw = fs.readFileSync(fp, "utf8").replace(/\0/g, "").trim();
    if (!raw) return false;
    const parsed = JSON.parse(raw) || {};
    const locks = parsed && typeof parsed.locks === "object" && parsed.locks ? parsed.locks : {};
    const now = Date.now();
    if (code && locks[code] && Number(locks[code].expiresAt || 0) > now) {
      return true;
    }
    for (const val of Object.values(locks)) {
      if (!val || typeof val !== "object") continue;
      if (Number(val.expiresAt || 0) <= now) continue;
      const lockSid = String(val.stealthId || "").trim().toLowerCase();
      if (lockSid && (sid === lockSid || (udir && udir.includes(lockSid)))) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

async function closeContext(context, { forcePriority = false } = {}) {
  if (!context) return;
  if (!forcePriority && isContextPriorityLocked(context)) {
    return;
  }
  try {
    const pages = typeof context.pages === "function" ? context.pages() : [];
    const page = pages.find((p) => p && !p.isClosed?.()) || null;
    if (page && typeof context.newCDPSession === "function") {
      await Promise.race([
        (async () => {
          const cdp = await context.newCDPSession(page);
          await cdp.send("Storage.getCookies").catch(() => undefined);
          await cdp.send("Network.flushCookieStore").catch(() => undefined);
          await cdp.detach().catch(() => undefined);
        })(),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    }
  } catch {
    /* best-effort in-memory SQLite cookie flush before close */
  }
  await Promise.race([
    context.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
}

module.exports = {
  FROZEN_CLOAKBROWSER_WRAPPER_VERSION,
  FROZEN_CLOAKBROWSER_CHROMIUM_VERSION,
  enforceFrozenCloakbrowserEnv,
  extractMirrorZipArchive,
  maybeRestoreFrozenBinaryFromLocalMirror,
  findInstalledWindowsWidevineCdmDir,
  ensureWindowsWidevineCdm,
  resolveHeadlessCuiExecutablePath,
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
  openPureHeadedProfile,
  applyHumanizeToContext,
  closeContext
};
