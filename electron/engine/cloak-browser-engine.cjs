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
    if (cp.ChildProcess?.prototype?.spawn && !cp.ChildProcess.prototype.__stealthHeadlessHideGuardV2) {
      const origSpawn = cp.ChildProcess.prototype.__stealthOrigSpawn || cp.ChildProcess.prototype.spawn;
      cp.ChildProcess.prototype.__stealthOrigSpawn = origSpawn;
      cp.ChildProcess.prototype.spawn = function stealthSafeSpawn(options) {
        if (options && typeof options === "object") {
          const fileStr = String(options.file || "").toLowerCase();
          const argsArr = Array.isArray(options.args) ? options.args : [];
          const isHeadless = argsArr.some((a) => String(a).startsWith("--headless"));
          if (isHeadless && (fileStr.endsWith("\\chrome.exe") || fileStr.endsWith("/chrome.exe"))) {
            const cuiExe = resolveHeadlessCuiExecutablePath(options.file);
            if (cuiExe && cuiExe !== options.file) {
              options.file = cuiExe;
              if (argsArr.length > 0) {
                argsArr[0] = cuiExe;
              }
            }
          }
          if (
            isHeadless ||
            String(options.file || "").toLowerCase().endsWith("chrome-headless.exe") ||
            fileStr.endsWith("nodew.exe")
          ) {
            options.windowsHide = true;
          }
        }
        return origSpawn.call(this, options);
      };
      cp.ChildProcess.prototype.__stealthHeadlessHideGuardV2 = true;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Ensures a dedicated `chrome-headless.exe` copy with PE Subsystem = 3 (`IMAGE_SUBSYSTEM_WINDOWS_CUI`)
 * exists next to `chrome.exe`. When launched with `windowsHide: true` (`CREATE_NO_WINDOW`), Windows
 * kernel (`win32kfull.sys`) neither allocates a console window NOR triggers the 5-second `IDC_APPSTARTING`
 * blue spinning cursor on the mouse pointer.
 */
function resolveHeadlessCuiExecutablePath(guiExePath) {
  if (process.platform !== "win32" || !guiExePath) return guiExePath;
  let cuiExePath = "";
  try {
    const resolvedGui = path.resolve(String(guiExePath));
    if (!fs.existsSync(resolvedGui)) return guiExePath;
    const dir = path.dirname(resolvedGui);
    cuiExePath = path.join(dir, "chrome-headless.exe");
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
      fs.copyFileSync(resolvedGui, cuiExePath);
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
      const wfd = fs.openSync(cuiExePath, "r+");
      try {
        const b = Buffer.alloc(2);
        b.writeUInt16LE(3, 0); // 3 = IMAGE_SUBSYSTEM_WINDOWS_CUI
        fs.writeSync(wfd, b, 0, 2, subOffset);
      } finally {
        fs.closeSync(wfd);
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
 * Frozen CloakBrowser Engine Lock (`ok 2` & `ok 3`):
 * Locks P0003 to `cloakbrowser@0.4.8` + `chromium-146.0.7680.177.5` (free unlimited-session tier).
 * Disables background npm/GitHub auto-update checks (`CLOAKBROWSER_AUTO_UPDATE=false`) and prevents
 * silent upgrades to license-gated `-pro` builds (`exitCode=76` seat limits in `>=0.4.11` / `0.7.0`).
 */
const FROZEN_CLOAKBROWSER_WRAPPER_VERSION = "0.4.8";
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
];
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
    // and cap disk/media cache to 1 MB (--disk-cache-size=1048576) so background browser launches never
    // spike CPU / DWM or hammer the QLC NVMe SSD with hundreds of Cache_Data random write IOPS.
    // Also set --window-size=1920,1080 so window.outerWidth/outerHeight (1920x1080) matches inner (1920x947) + screen (1920x1080).
    args.push(
      "--window-size=1920,1080",
      "--renderer-process-limit=2",
      "--num-raster-threads=1",
      "--disk-cache-size=1048576",
      "--media-cache-size=1048576",
      "--mute-audio",
      "--disable-logging",
      "--disable-backgrounding-occluded-windows",
    );
  } else {
    // Headed User Browser Tuning: offload DOM/table tile rasterization from 2.30GHz Xeon cores
    // onto the 11GB VRAM NVIDIA GTX 1080 Ti via GPU rasterization + zero-copy + 4 raster threads.
    args.push(
      "--enable-gpu-rasterization",
      "--enable-zero-copy",
      "--ignore-gpu-blocklist",
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
  "HttpsUpgrades",
  "LensOverlay",
  "MediaRouter",
  "PaintHolding",
  "ThirdPartyStoragePartitioning",
  "Translate",
  "AutoDeElevate",
  "RenderDocument",
  "OptimizationHints",
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

function buildIgnoreDefaultArgs({ stripAboutBlank = false } = {}) {
  const base = shouldStripSandboxFlags()
    ? [...CLOAK_IGNORE_DEFAULT_ARGS, ...SANDBOX_FLAGS, ...EXTENSION_BLOCK_FLAGS]
    : [...CLOAK_IGNORE_DEFAULT_ARGS];
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
  return binaryInfo(FROZEN_CLOAKBROWSER_CHROMIUM_VERSION);
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
    await ensureBinary(undefined, FROZEN_CLOAKBROWSER_CHROMIUM_VERSION);
    _binaryVerifiedOnce = true;
  }
  const launchOpts = await cbBuildLaunchOptions({
    ...cloakOptions,
    browserVersion: FROZEN_CLOAKBROWSER_CHROMIUM_VERSION,
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
  if (options.headless !== true) {
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

  if (options.humanize) {
    void (async () => {
      try {
        const { patchContext } = await cloakDistImport("human/index.js");
        const { resolveConfig } = await cloakDistImport("human/config.js");
        const cfg = resolveConfig(options.humanPreset ?? "default", options.humanConfig);
        patchContext(context, cfg);
      } catch {
        // humanize optional — launch still succeeds
      }
    })();
  }

  return context;
}

async function openProfile(profile, userDataRoot, { debugPort = 0, userDataDirOverride = "" } = {}) {
  const timer = createLaunchTimer(profile.id, profile.name);
  timer.mark("prep-start");
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
