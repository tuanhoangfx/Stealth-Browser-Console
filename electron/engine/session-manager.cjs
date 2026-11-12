const path = require("node:path");
const fs = require("node:fs");
function getCloakEngineModule() {
  return require("./cloak-browser-engine.cjs");
}
const closeContext = (...args) => getCloakEngineModule().closeContext(...args);
const profileDataDir = (...args) => getCloakEngineModule().profileDataDir(...args);
const openProfile = (...args) => getCloakEngineModule().openProfile(...args);
const profileService = require("../db/profile-service.cjs");
const { navigateStartupUrl, awaitBrowserReady, stabilizePrimaryPage } = require("../automation/navigate-startup.cjs");
const { getFreePort, fetchCdpVersion, waitForCdp } = require("../lib/net-port.cjs");
const { extractProfileCode } = require("../lib/profile-code.cjs");
const { applyProfileWindowTitle, formatProfileWindowLabel, scheduleProfileTaskbarBadgeApply, scheduleMissingBadgeSweep } = require("../lib/profile-window-title.cjs");
function getOrphanModule() {
  return require("../lib/profile-browser-orphan.cjs");
}
const PROFILE_LOCK_FILES = getOrphanModule().PROFILE_LOCK_FILES;
const focusProfileBrowserWindow = (...args) => getOrphanModule().focusProfileBrowserWindow(...args);
const hasProfileBrowserProcess = (...args) => getOrphanModule().hasProfileBrowserProcess(...args);
const killOrphanProfileBrowser = (...args) => getOrphanModule().killOrphanProfileBrowser(...args);
const listProfileBrowserPids = (...args) => getOrphanModule().listProfileBrowserPids(...args);
const readDevToolsActivePort = (...args) => getOrphanModule().readDevToolsActivePort(...args);
const resolveBrowserPidByDebugPort = (...args) => getOrphanModule().resolveBrowserPidByDebugPort(...args);
const findLiveHeadedBrowserPidNative = (...args) => getOrphanModule().findLiveHeadedBrowserPidNative?.(...args) || 0;
const reapUntrackedHeadlessBrowsersNative = (...args) =>
  getOrphanModule().reapUntrackedHeadlessBrowsersNative?.(...args) || { scanned: 0, killed: 0, rootTrees: 0 };
const {
  purgeLegacyProfileIdentityChrome,
  trimClosedProfileDisposableCache,
  trimClosedProfileDisposableCacheAsync,
} = require("../lib/profile-chrome-cleanup.cjs");
const markProfileChromeCleanExit = (...args) =>
  require("../lib/profile-chrome-session.cjs").markProfileChromeCleanExit(...args);
const { repairProfileUserDataDir, purgeProfileUserDataDir, removeStaleProfileLocks, writeSidecarPid, readSidecarPid, removeSidecarPid, waitForProfileUnlock } = require("../lib/profile-user-data-repair.cjs");
function getAgentShadowModule() {
  return require("../lib/agent-shadow-profile.cjs");
}
const resolveAgentShadowUserDataDir = (...args) => getAgentShadowModule().resolveAgentShadowUserDataDir(...args);
const hasLiveAgentShadowOnDisk = (...args) => getAgentShadowModule().hasLiveAgentShadowOnDisk(...args);
const seedAgentShadowFromPrimary = (...args) => getAgentShadowModule().seedAgentShadowFromPrimary(...args);
const syncAgentShadowBackToPrimary = (...args) => getAgentShadowModule().syncAgentShadowBackToPrimary(...args);
const sweepOrphanAgentShadows = (...args) => getAgentShadowModule().sweepOrphanAgentShadows(...args);
function getMultiplatformSyncModule() {
  return require("../lib/stealth-multiplatform-sync.cjs");
}
function syncProfileWindowLiveCdpStateToP0020(...args) {
  return getMultiplatformSyncModule().syncProfileWindowLiveCdpStateToP0020?.(...args);
}
const { bindOmniboxSearchGuard } = require("../lib/omnibox-search-guard.cjs");
const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");

function launchMeta(profile) {
  const agentSmoke = isAgentSmokeLaunch();
  return {
    agentSmoke,
    headless: profile.headless === true || agentSmoke,
  };
}

function resolveSessionCallerId(profile) {
  let normalize = (v) => String(v || "").trim() || "agent:inline";
  try {
    const { getAgentCallerId, normalizeAgentCallerId } = require("../lib/agent-smoke-context.cjs");
    if (typeof normalizeAgentCallerId === "function") normalize = normalizeAgentCallerId;
    const explicit = String(profile?.callerId || profile?.agentCaller || profile?.daemonId || "").trim();
    if (explicit) return normalize(explicit);
    const reqCaller = typeof getAgentCallerId === "function" ? getAgentCallerId() : "";
    if (reqCaller) return normalize(reqCaller);
  } catch {
    /* ignore */
  }
  const explicit = String(profile?.callerId || profile?.agentCaller || profile?.daemonId || "").trim();
  return normalize(explicit);
}
/** CDP passthrough bật mặc định; tắt bằng STEALTH_CDP_ENABLE=0. */
function cdpEnabled() {
  return String(process.env.STEALTH_CDP_ENABLE || "1") !== "0";
}

const SESSION_WATCHDOG_MS = 8000;
/** Ignore transient empty pages / watchdog during startup navigation. */
const LAUNCH_GRACE_MS = 45_000;
/** Auto-reap idle headless agent profiles after 120s of no CDP/navigation activity. */
const HEADLESS_AGENT_IDLE_TTL_MS = 120_000;
/** Extended TTL (45 min) for headless profiles holding live support chats or active priority locks. */
const HEADLESS_ACTIVE_TASK_IDLE_TTL_MS = 45 * 60_000;
const ACTIVE_CHAT_OR_TASK_URL_RE =
  /support\.google\.com|embed\/chat|renderframe|cases\.connect/i;
/** Short TTL cache (2s) for lock/session JSON files to avoid synchronous disk I/O thrashing on Electron Main Thread. */
const _jsonFileCache = new Map();
function readCachedJsonFile(fp, ttlMs = 2000) {
  const now = Date.now();
  const hit = _jsonFileCache.get(fp);
  if (hit && now - hit.at < ttlMs) return hit.data;
  let data = null;
  try {
    if (fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, "utf8").replace(/\0/g, "").trim();
      data = raw ? JSON.parse(raw) : {};
    }
  } catch {
    data = null;
  }
  _jsonFileCache.set(fp, { at: now, data });
  return data;
}
/** Unified >=5s minimum spacing between headless Chromium spawns to prevent simultaneous CreateProcess & NVMe I/O spikes. */
const HEADLESS_LAUNCH_MIN_GAP_MS = Math.max(
  1000,
  Number(process.env.STEALTH_HEADLESS_LAUNCH_MIN_GAP_MS) || 5000,
);
const PROTECTED_USER_PROFILE_CODES = new Set([
  "0001",
  "0002",
  "0003",
  "0004",
  "0005",
  "0006",
  "0007",
  "0008",
  "0009",
  "0010",
  "0011",
  "0012",
  "0013",
  "0014",
  "0015",
  "0016",
  "0017",
  "0018",
  "0019",
  "0020",
  "0021",
  "0059",
  "0069",
  "0120",
  "4220",
  "8000",
  "8001",
  "8002",
  "8003",
  "8999",
]);

function isSupportChatProtectedSession(session) {
  if (!session) return false;
  if (session.taskExempt === true || session.profile?.taskExempt === true) return true;
  const reason = String(session.profile?.agentReason || "");
  if (/support|chat|appeal/i.test(reason)) return true;
  try {
    const ctx = session.context;
    if (ctx && typeof ctx.pages === "function") {
      for (const page of ctx.pages()) {
        if (!page || page.isClosed?.()) continue;
        const pageUrl = String(page.url?.() || "");
        if (ACTIVE_CHAT_OR_TASK_URL_RE.test(pageUrl)) {
          session.lastActivityAt = Date.now();
          return true;
        }
        if (typeof page.frames === "function") {
          for (const frame of page.frames()) {
            const frameUrl = String(frame?.url?.() || "");
            if (ACTIVE_CHAT_OR_TASK_URL_RE.test(frameUrl)) {
              session.lastActivityAt = Date.now();
              return true;
            }
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const code = String(session.profileCode || extractProfileCode(session.profile?.name || "", session.profile?.id || ""))
      .trim()
      .slice(0, 4)
      .padStart(4, "0");
    if (/^\d{4}$/.test(code)) {
      const g1Doc = readCachedJsonFile("E:\\Dev\\.cache\\g1-family-unlock-sessions.json");
      if (g1Doc) {
        const sessions = Array.isArray(g1Doc.sessions)
          ? g1Doc.sessions
          : g1Doc.sessions && typeof g1Doc.sessions === "object"
            ? Object.values(g1Doc.sessions)
            : [];
        if (
          sessions.some(
            (s) =>
              String(s?.status || "") === "running" &&
              String(s?.stage || "") !== "completed" &&
              String(s?.profileCode || s?.senderCode || "").replace(/^#/, "").padStart(4, "0") === code,
          )
        ) {
          return true;
        }
      }
      const parsedPriority = readCachedJsonFile("E:\\Dev\\Tool\\P0002-Social-Hub\\data\\priority-agent-locks.json");
      if (parsedPriority) {
        const entry = parsedPriority?.locks?.[code];
        const exp = typeof entry === "object" && entry ? Number(entry.expiresAt || 0) : Number(entry || 0);
        const entryReason = typeof entry === "object" && entry ? String(entry.reason || "") : "";
        if (exp > Date.now() && /support|chat|appeal/i.test(entryReason)) return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

function isExemptActiveChatOrTaskSession(session) {
  if (isSupportChatProtectedSession(session)) return true;
  if (!session) return false;
  const reason = String(session.profile?.agentReason || "");
  if (/unlock|verify|workflow|care|checkout|payment/i.test(reason)) return true;
  try {
    const code = String(session.profileCode || extractProfileCode(session.profile?.name || "", session.profile?.id || ""))
      .trim()
      .slice(0, 4)
      .padStart(4, "0");
    if (/^\d{4}$/.test(code)) {
      const parsedActive = readCachedJsonFile("E:\\Dev\\Tool\\P0002-Social-Hub\\data\\active-agent-locks.json");
      if (parsedActive) {
        const entry = parsedActive?.locks?.[code];
        const exp = typeof entry === "object" && entry ? Number(entry.expiresAt || 0) : Number(entry || 0);
        if (exp > Date.now()) return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

function isReapableHeadlessCode(profileCode, { shadowLane = false, headless = false, idleMs = 0, session = null } = {}) {
  const code = String(profileCode || "").trim().slice(0, 4).padStart(4, "0");
  if (!/^\d{4}$/.test(code)) return false;
  const num = Number(code);
  if (!shadowLane && (PROTECTED_USER_PROFILE_CODES.has(code) || (num >= 8000 && num < 9000))) {
    return false;
  }
  if (!shadowLane && session?.userDataDir && findLiveHeadedBrowserPidNative(session.userDataDir) > 0) {
    return false;
  }
  if (session && isExemptActiveChatOrTaskSession(session)) {
    return idleMs > HEADLESS_ACTIVE_TASK_IDLE_TTL_MS;
  }
  const isAgentPool = num >= 9000 && num <= 9999;
  if (shadowLane || headless) {
    if (isAgentPool) return idleMs > 15 * 60_000;
    return true;
  }
  if (isAgentPool) return idleMs > 15 * 60_000;
  return true;
}

/** Skip expensive WMI orphan probe when profile dir is clean (typical Run path). */
function shouldSkipOrphanProbe(userDataDir, priorStatus) {
  if (priorStatus === "running" || priorStatus === "opening") return false;
  if (profileDirHasLock(userDataDir)) return false;
  if (readDevToolsActivePort(userDataDir) > 0) return false;
  return true;
}

function profileDirHasLock(userDataDir) {
  return [...PROFILE_LOCK_FILES, "lockfile"].some((name) => fs.existsSync(path.join(userDataDir, name)));
}

async function prepareProfileForLaunch(userDataDir, { aggressive = false } = {}) {
  // Always probe for live Chrome when lock files exist — stale lock + missed orphan
  // was the ProcessSingleton Error 32 failure mode (profile already in use).
  // When a live browser already holds the dir (common: prod cmdline vs -dev junction),
  // do NOT kill — session-manager will attach/focus instead.
  if (aggressive || profileDirHasLock(userDataDir)) {
    if (await hasProfileBrowserProcess(userDataDir)) {
      return { repaired: false, live: true };
    }
    return repairProfileUserDataDir(userDataDir);
  }
  // No lock file → Chromium is not holding this profile (it writes SingletonLock
  // for the whole lifetime of a live profile). Skip the 1–3s WMI Get-CimInstance
  // scan on this hot path; only pay it when a cheap sidecar pid says a process may
  // still be attached without a lock (crash/detach edge case).
  const sidecarPid = readSidecarPid(userDataDir)?.pid;
  if (sidecarPid) {
    let sidecarAlive = false;
    try {
      process.kill(sidecarPid, 0);
      sidecarAlive = true;
    } catch {
      // sidecar pid is dead — profile dir is clean, no repair needed
    }
    if (sidecarAlive && (await hasProfileBrowserProcess(userDataDir))) {
      return { repaired: false, live: true };
    }
    if (sidecarAlive) {
      return repairProfileUserDataDir(userDataDir);
    }
  }
  return { repaired: false };
}

function isLaunchLockError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return /SingletonLock|lockfile|EBUSY|EACCES|user data directory|already in use|ProcessSingleton|existing browser session|Opening in existing/i.test(
    msg,
  );
}

function isContextAlive(context) {
  try {
    const browser = context.browser();
    if (browser && !browser.isConnected()) return false;
    return context.pages().length > 0;
  } catch {
    return false;
  }
}

class SessionManager {
  /** @type {Map<string, { context: import('playwright-core').BrowserContext, userDataDir: string, primaryUserDataDir?: string, alive: boolean, watchdog?: NodeJS.Timeout, startupNavigation?: Promise<void>, launchedAt?: number }>} */
  #sessions = new Map();
  /**
   * Dual-Lane Agent Headless Shadow sessions (`%TEMP%/p0003-agent-shadow/<id>`).
   * Runs completely independently of User Headed sessions (`#sessions`) on the same profile ID.
   */
  #agentSessions = new Map();
  #userDataRoot = "";
  /** Profiles mid-launch — reconcile must not mark closed while spawn is in flight. */
  #launchingIds = new Set();
  #agentLaunchingIds = new Set();
  /** Coalesce double-click / parallel launch() for the same profile. */
  #launchPromises = new Map();
  #agentLaunchPromises = new Map();
  /** Deferred Agent tasks skipped while User Headed window was active (`ok 2`). */
  #deferredAgentTasks = new Map();
  /** Round-robin sequence for multi-socket Processor Group (>64 threads) balancing. */
  #processorGroupSeq = 0;
  /** Serialized headless launch pacer so burst requests never spawn 5+ Chrome trees simultaneously. */
  #headlessLaunchTail = Promise.resolve();
  #lastHeadlessLaunchAt = 0;
  /** @type {((profileId: string, profile: object, event: string) => void) | null} */
  #onSessionChange = null;

  async #waitHeadlessLaunchSlot() {
    const prev = this.#headlessLaunchTail;
    let release;
    this.#headlessLaunchTail = new Promise((r) => {
      release = r;
    });
    try {
      await prev;
      const elapsed = Date.now() - this.#lastHeadlessLaunchAt;
      if (elapsed < HEADLESS_LAUNCH_MIN_GAP_MS) {
        await new Promise((r) => setTimeout(r, HEADLESS_LAUNCH_MIN_GAP_MS - elapsed));
      }
      this.#lastHeadlessLaunchAt = Date.now();
    } finally {
      release();
    }
  }

  #persistDeferredQueueFile(extraReadyItem = null) {
    try {
      const candidateDirs = ["E:\\Dev\\Tool\\P0002-Social-Hub\\data"];
      for (const dir of candidateDirs) {
        if (!fs.existsSync(dir)) continue;
        const fp = path.join(dir, "deferred-user-headed-queue.json");
        let prevReady = [];
        try {
          if (fs.existsSync(fp)) {
            const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) || {};
            if (Array.isArray(parsed.readyForRetry)) {
              const cutoff = Date.now() - 2 * 60 * 60 * 1000;
              prevReady = parsed.readyForRetry.filter((x) => Number(x?.windowClosedAt || 0) > cutoff);
            }
          }
        } catch {
          /* ignore */
        }
        if (extraReadyItem?.code) {
          prevReady = [
            extraReadyItem,
            ...prevReady.filter((x) => x?.code !== extraReadyItem.code && x?.profileId !== extraReadyItem.profileId),
          ].slice(0, 100);
        }
        const pending = this.listDeferredAgentTasks();
        const pendingCodes = new Set(pending.map((x) => x.code));
        prevReady = prevReady.filter((x) => !pendingCodes.has(x?.code));
        fs.writeFileSync(
          fp,
          JSON.stringify(
            {
              updatedAt: new Date().toISOString(),
              pendingWhileUserHeaded: pending,
              readyForRetry: prevReady,
            },
            null,
            2,
          ),
          "utf8",
        );
        break;
      }
    } catch {
      /* ignore */
    }
  }

  enqueueDeferredAgentTask(profileId, { reason = "user_interactive_session" } = {}) {
    const id = String(profileId || "").trim();
    if (!id) return null;
    const prof = profileService.getProfile(id);
    const code = extractProfileCode(prof?.name || "", id);
    const prev = this.#deferredAgentTasks.get(id);
    const entry = {
      profileId: id,
      code: code || id,
      firstDeferredAt: prev?.firstDeferredAt || Date.now(),
      lastDeferredAt: Date.now(),
      count: (prev?.count || 0) + 1,
      reason: String(reason || "user_interactive_session"),
    };
    this.#deferredAgentTasks.set(id, entry);
    this.#persistDeferredQueueFile();
    return entry;
  }

  listDeferredAgentTasks() {
    return [...this.#deferredAgentTasks.values()];
  }

  setUserDataRoot(root) {
    this.#userDataRoot = root;
  }

  setOnSessionChange(handler) {
    this.#onSessionChange = handler ?? null;
  }

  isRunning(profileId) {
    const id = String(profileId);
    if (this.#launchingIds.has(id) || this.#agentLaunchingIds.has(id)) return true;
    const session = this.#sessions.get(id);
    if (session?.alive) return true;
    const agentSession = this.#agentSessions.get(id);
    return Boolean(agentSession?.alive);
  }

  /**
   * Returns true if the profile is currently running in background Headless mode (Agent stream)
   * without an active User Headed window, so the UI shows `Run 👻` allowing the User to open
   * the normal Headed window on the same unified profile data (`D:\StealthBrowser\profiles\<id>`).
   */
  isAgentShadowRunning(profileId) {
    const id = String(profileId);
    if (this.#agentLaunchingIds.has(id)) return true;
    const userSess = this.#sessions.get(id);
    if (userSess?.alive && userSess.headless === true) return true;
    if (this.#agentSessions.get(id)?.alive) return true;
    return false;
  }

  /**
   * Returns true if the profile is currently running as a user-opened interactive (headed) window.
   * Agent/headless background tasks must never close, focus-steal, or hijack the primary tab of
   * a user-interactive session (`ok 1`).
   */
  isUserInteractiveSession(profileId) {
    const id = String(profileId);
    const session = this.#sessions.get(id);
    if (session?.alive) return session.headless !== true;
    if (!this.#userDataRoot) return false;
    try {
      const primaryUserDataDir = profileDataDir(this.#userDataRoot, id);
      if (profileDirHasLock(primaryUserDataDir)) {
        let sidecar = readSidecarPid(primaryUserDataDir);
        const hasLiveHeaded =
          (sidecar && sidecar.headless === false) || findLiveHeadedBrowserPidNative(primaryUserDataDir) > 0;
        if (hasLiveHeaded) {
          sidecar = readSidecarPid(primaryUserDataDir) || sidecar;
          const profile = profileService.getProfile(id);
          const livePort = Number(sidecar?.debugPort || readDevToolsActivePort(primaryUserDataDir) || 0);
          this.#sessions.set(id, {
            context: null,
            userDataDir: primaryUserDataDir,
            alive: true,
            debugPort: livePort,
            profile,
            profileCode: profile ? extractProfileCode(profile.name, profile.id) : "",
            focusOnly: true,
            headless: false,
            launchedAt: Date.now(),
          });
          this.#bindFocusOnlyLifecycle(id, primaryUserDataDir);
          if (profile && profile.status !== "running") {
            const running = profileService.setProfileStatus(id, "running");
            this.#emitSessionChange(id, running, "running");
          }
          return true;
        }
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  #inLaunchGrace(session) {
    if (!session) return false;
    return Date.now() - (session.launchedAt || 0) < LAUNCH_GRACE_MS;
  }

  #emitSessionChange(profileId, profile, event) {
    try {
      this.#onSessionChange?.(String(profileId), profile, event);
    } catch {
      // listener errors should not break session lifecycle
    }
    try {
      const id = String(profileId || "");
      const code = extractProfileCode(profile?.name || id);
      if (code) {
        const ev = String(event || "").toLowerCase();
        const session = this.#sessions.get(id);
        const isLiveEvent =
          ev === "running" ||
          ev === "focused" ||
          ev === "startup-adopted" ||
          (profile?.status === "running" && session?.alive);
        const isCloseEvent =
          ev === "closed" ||
          ev === "window-closed" ||
          ev === "context-closed" ||
          ev === "disconnected" ||
          ev === "watchdog" ||
          ev === "profile_close" ||
          ev === "reconcile" ||
          ev === "startup-reconciled" ||
          profile?.status === "closed";
        if (isLiveEvent || isCloseEvent) {
          const debugPort = isLiveEvent
            ? Number(session?.debugPort || profile?.debugPort || 0)
            : 0;
          const userDataDir =
            (!isLiveEvent && session?.primaryUserDataDir) ||
            session?.userDataDir ||
            (this.#userDataRoot ? profileDataDir(this.#userDataRoot, id) : null) ||
            null;
          void Promise.resolve(
            syncProfileWindowLiveCdpStateToP0020({
              profileCode: code,
              profileId: id,
              userDataDir,
              liveCdp: isLiveEvent && debugPort > 0,
              debugPort: isLiveEvent ? debugPort : 0,
              source: `p0003_window_${ev || "change"}`,
            }),
          ).catch(() => undefined);
          if (isCloseEvent && this.#deferredAgentTasks.has(id)) {
            const deferredEntry = this.#deferredAgentTasks.get(id);
            this.#deferredAgentTasks.delete(id);
            this.#persistDeferredQueueFile({
              ...deferredEntry,
              windowClosedAt: Date.now(),
              readyForAgentRetry: true,
            });
            const closeDir = userDataDir;
            const t = setTimeout(() => {
              try {
                if (this.isRunning(id) || (closeDir && profileDirHasLock(closeDir))) return;
                void Promise.resolve(
                  getMultiplatformSyncModule().syncProfilePlatformsToP0020IfChanged?.({
                    userDataDir: closeDir,
                    profileCode: code,
                    profileId: id,
                    source: "p0003_deferred_post_close",
                  }),
                ).catch(() => undefined);
              } catch {
                /* ignore */
              }
            }, 1800);
            if (typeof t.unref === "function") t.unref();
          }
        }
      }
    } catch {
      /* ignore lifecycle sync error */
    }
  }

  /**
   * Post-Close Cache Trim:
   * Waits 1.5s after Chromium exits for OS file handles to release, verifies the profile was not
   * re-opened and has no lockfile, then purges disposable GPU/Shader/Dawn/Code/Crashpad caches.
   * Note: Cookies, LocalStorage, and IndexedDB are preserved across all profiles (including 9000–9999)
   * so parallel accounts logged in on 9000–9999 retain their sessions across runs.
   */
  #schedulePostCloseCacheTrim(profileId, userDataDir) {
    if (!userDataDir) return;
    const id = String(profileId);
    const t = setTimeout(() => {
      try {
        if (this.isRunning(id) || profileDirHasLock(userDataDir)) return;
        void trimClosedProfileDisposableCacheAsync(userDataDir).catch(() => undefined);
      } catch {
        /* ignore */
      }
    }, 1500);
    if (typeof t.unref === "function") t.unref();
  }

  /** Boot-time — kill orphan Chrome + reset stale running/opening rows. */
  async reconcileOrphansOnStartup() {
    const root = this.#userDataRoot;
    if (!root) return { cleaned: 0 };
    if (process.env.STEALTH_DEV_ISOLATED === "1" || process.env.STEALTH_AGENT_WORKER === "1") {
      try {
        const activeProfileIds = new Set([...this.#agentSessions.keys(), ...this.#agentLaunchingIds]);
        sweepOrphanAgentShadows({ maxIdleMs: 24 * 60 * 60 * 1000, activeProfileIds });
      } catch {
        /* ignore */
      }
      return { cleaned: 0, skippedForProdSafety: true };
    }
    let cleaned = 0;
    const { resolveProfilesRoot } = require("../lib/profiles-location.cjs");
    const profilesDir = resolveProfilesRoot(root);

    for (const row of profileService.listActiveProfileIds()) {
      if (this.isRunning(row.id)) continue;
      const userDataDir = profileDataDir(root, row.id);
      const sidecar = readSidecarPid(userDataDir);
      if (!profileDirHasLock(userDataDir) && !sidecar?.pid) continue;
      const profile = profileService.getProfile(row.id);
      const profileCode = profile ? extractProfileCode(profile.name, profile.id) : "";
      const isSmokePool = /^9\d{3}$/.test(profileCode);
      const liveHeadedPid = findLiveHeadedBrowserPidNative(userDataDir);
      const wasHeadless =
        liveHeadedPid > 0
          ? false
          : Boolean(
              sidecar?.headless === true ||
                (sidecar && !sidecar.pid && sidecar.debugPort) ||
                profile?.headless === true,
            );
      const livePort = Number(sidecar?.debugPort || readDevToolsActivePort(userDataDir) || 0);
      if (profile && !isSmokePool && !wasHeadless) {
        let adoptedCdp = false;
        if (livePort > 0) {
          try {
            const cdpInfo = await fetchCdpVersion(livePort, { timeoutMs: 2500 });
            if (cdpInfo && cdpInfo.webSocketDebuggerUrl) {
              adoptedCdp = true;
            }
          } catch {
            /* fallback to process liveness check below */
          }
        }
        const userWindowAlive = adoptedCdp || (await hasProfileBrowserProcess(userDataDir));
        if (userWindowAlive) {
          this.#sessions.set(row.id, {
            context: null,
            userDataDir,
            alive: true,
            debugPort: livePort,
            profile,
            profileCode,
            focusOnly: true,
            headless: false,
            launchedAt: Date.now(),
          });
          this.#bindFocusOnlyLifecycle(row.id, userDataDir);
          const running = profileService.setProfileStatus(row.id, "running");
          this.#emitSessionChange(row.id, running, "startup-adopted");
          continue;
        }
      }
      await killOrphanProfileBrowser(userDataDir);
      removeStaleProfileLocks(userDataDir);
      const next = profileService.setProfileStatus(row.id, "closed", { reason: "startup-reconciled" });
      this.#emitSessionChange(row.id, next, "startup-reconciled");
      cleaned += 1;
    }

    try {
      profileService.sweepUnpinnedClosedProfileProxies?.();
    } catch {
      /* ignore */
    }

    const runOrphanShadowSweep = () => {
      try {
        const activeProfileIds = new Set([...this.#agentSessions.keys(), ...this.#agentLaunchingIds]);
        const maxIdleMs =
          process.env.STEALTH_FORCE_TEMP_SHADOW_DIR === "1" ? 24 * 60 * 60 * 1000 : 0;
        sweepOrphanAgentShadows({ maxIdleMs, activeProfileIds });
      } catch {
        /* ignore */
      }
    };
    runOrphanShadowSweep();
    if (!globalThis._p0003OrphanShadowSweepTimer && typeof setInterval === "function") {
      globalThis._p0003OrphanShadowSweepTimer = setInterval(runOrphanShadowSweep, 30 * 60_000);
      if (typeof globalThis._p0003OrphanShadowSweepTimer.unref === "function") {
        globalThis._p0003OrphanShadowSweepTimer.unref();
      }
    }

    if (!fs.existsSync(profilesDir)) return { cleaned };
    const fullScan = String(process.env.STEALTH_STARTUP_FULL_ORPHAN_SCAN ?? "0").toLowerCase();
    if (fullScan !== "1" && fullScan !== "true" && fullScan !== "on") return { cleaned };
    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      if (this.isRunning(id)) continue;
      const userDataDir = path.join(profilesDir, id);
      const hasLock = PROFILE_LOCK_FILES.some((name) => fs.existsSync(path.join(userDataDir, name)));
      if (!hasLock) continue;
      if (await hasProfileBrowserProcess(userDataDir)) {
        await killOrphanProfileBrowser(userDataDir);
      }
      removeStaleProfileLocks(userDataDir);
      const profile = profileService.getProfile(id);
      if (profile && (profile.status === "running" || profile.status === "opening")) {
        const next = profileService.setProfileStatus(id, "closed", { reason: "startup-reconciled" });
        this.#emitSessionChange(id, next, "startup-reconciled");
        cleaned += 1;
      }
    }

    return { cleaned };
  }

  #registerPlaywrightSession(id, profile, opened, { skipStartupUrl = false, shadowLane = false } = {}) {
    bindOmniboxSearchGuard(opened.context);
    const profileCode = extractProfileCode(profile.name, profile.id);
    const primaryUserDataDir = opened.primaryUserDataDir || profileDataDir(this.#userDataRoot, id) || opened.userDataDir;

    // One-Way Live Cookie Sync on open: only copy from User Primary (#sessions) into Agent Shadow
    // when a shadow lane opens; NEVER overwrite User Primary cookies from an Agent Shadow context.
    const siblingSession = shadowLane ? this.#sessions.get(id) : null;
    const crossLaneCookieSyncReady =
      siblingSession?.alive && siblingSession.context && isContextAlive(siblingSession.context)
        ? siblingSession.context
            .cookies()
            .then((cookies) =>
              Array.isArray(cookies) && cookies.length > 0
                ? opened.context.addCookies(cookies).catch(() => undefined)
                : undefined,
            )
            .catch(() => undefined)
        : Promise.resolve();

    const launchUrl = profileService.resolveProfileLaunchUrl(profile.startupUrl);
    const liveHeadedPid = !shadowLane && opened.userDataDir ? findLiveHeadedBrowserPidNative(opened.userDataDir) : 0;
    const badgeHeadless = liveHeadedPid > 0 ? false : Boolean(shadowLane || launchMeta(profile).headless);
    let browserPid = liveHeadedPid > 0 ? liveHeadedPid : 0;
    try {
      browserPid = opened.context.browser()?.process()?.pid || browserPid;
    } catch { /* persistent context may not expose process */ }

    // Sidecar before title/badge so apply script can skip WMI via stealth-pid.json.
    // Headless sessions never have a taskbar button — skip startBrowserPidSidecarPoll (which
    // spawns lockfile PowerShell probes) and resolve PID via native netstat.exe in ~10ms.
    const scheduleGroupBalance = (pidToBalance) => {
      if (process.platform !== "win32" || !(Number(pidToBalance) > 0)) return;
      const groupSeq = (this.#processorGroupSeq = (this.#processorGroupSeq + 1) >>> 0);
      const runBalance = () => {
        try {
          const { balanceBrowserProcessorGroup } = require("../lib/taskbar-apply-worker.cjs");
          void balanceBrowserProcessorGroup(pidToBalance, groupSeq, { headless: badgeHeadless });
        } catch {
          /* ignore */
        }
      };
      const timer = setTimeout(runBalance, 350);
      if (typeof timer.unref === "function") timer.unref();
      if (badgeHeadless) {
        const lateTimer = setTimeout(runBalance, 2000);
        if (typeof lateTimer.unref === "function") lateTimer.unref();
      }
    };

    const debugPort = Number(opened.debugPort) || 0;
    if (browserPid > 0 || (badgeHeadless && debugPort > 0)) {
      writeSidecarPid(opened.userDataDir, {
        pid: browserPid,
        debugPort,
        headless: badgeHeadless,
      });
      if (!browserPid && debugPort > 0) {
        void resolveBrowserPidByDebugPort(debugPort)
          .then((resolvedPid) => {
            if (resolvedPid > 0) {
              writeSidecarPid(opened.userDataDir, {
                pid: resolvedPid,
                debugPort,
                headless: badgeHeadless,
              });
              scheduleGroupBalance(resolvedPid);
            }
          })
          .catch(() => undefined);
      }
    } else if (!badgeHeadless) {
      const { startBrowserPidSidecarPoll } = require("../lib/profile-taskbar-native.cjs");
      startBrowserPidSidecarPoll(
        opened.userDataDir,
        () => {
          try {
            return opened.context.browser()?.process()?.pid || 0;
          } catch {
            return 0;
          }
        },
        { debugPort },
      );
    }

    if (browserPid > 0) {
      scheduleGroupBalance(browserPid);
    }

    // Install title prefix concurrently — do NOT block startupNavigation behind page.evaluate on about:blank!
    void applyProfileWindowTitle(opened.context, profile, {
      userDataDir: opened.userDataDir,
      browserPid,
      headless: badgeHeadless,
    }).catch(() => undefined);
    const startupNavigation = crossLaneCookieSyncReady
      .then(() =>
        skipStartupUrl
          ? awaitBrowserReady(opened.context)
          : navigateStartupUrl(opened.context, launchUrl),
      )
      .catch(() => undefined);

    const launchedAt = Date.now();
    const vpnCountry = String(profile.activeVpnCountry || "").trim().toUpperCase();
    const callerId = badgeHeadless ? resolveSessionCallerId(profile) : "user:headed";
    const targetMap = shadowLane ? this.#agentSessions : this.#sessions;
    targetMap.set(id, {
      context: opened.context,
      userDataDir: opened.userDataDir,
      primaryUserDataDir,
      alive: true,
      debugPort: opened.debugPort || 0,
      profile,
      profileCode,
      focusOnly: false,
      headless: badgeHeadless,
      shadowLane: Boolean(shadowLane),
      callerId,
      vpnCountry,
      startupNavigation,
      launchedAt,
      lastActivityAt: launchedAt,
    });
    this.#bindSessionLifecycle(id, opened.context, profile, { shadowLane });

    // Headless sessions have no taskbar button — completely skip render-taskbar-badge.ps1,
    // taskbar badge apply, and missing badge sweeps (0 PowerShell spawns per headless launch).
    if (!badgeHeadless) {
      const profileLabel = formatProfileWindowLabel(profile);
      const { ensureBadgeIcoFast } = require("../lib/profile-taskbar-native.cjs");
      void ensureBadgeIcoFast(profileCode).catch(() => undefined);

      const scheduleOpenBadge = (pidHint = 0) => {
        scheduleProfileTaskbarBadgeApply(opened.userDataDir, profileLabel, profileCode, {
          browserPid: pidHint,
          headless: false,
        });
      };

      // Early apply — do not block on startup URL. Post-nav reinforce updates PID only
      // (same-code in-flight is not cancelled — cancel race caused missing badges).
      scheduleOpenBadge(browserPid || readSidecarPid(opened.userDataDir)?.pid || 0);
      this.#scheduleMissingBadgeSweep();

      void (async () => {
        try {
          if (startupNavigation) await startupNavigation;
          let latePid = 0;
          try {
            if (isContextAlive(opened.context)) {
              latePid = opened.context.browser()?.process()?.pid || 0;
            }
          } catch {
            latePid = 0;
          }
          const sidecarPid = readSidecarPid(opened.userDataDir)?.pid || 0;
          // After nav: re-stamp with best PID. isReinforce avoids aborting in-flight open.
          scheduleProfileTaskbarBadgeApply(opened.userDataDir, profileLabel, profileCode, {
            browserPid: latePid || sidecarPid || browserPid,
            headless: false,
            force: true,
            isReinforce: true,
          });
          // Stealth vault status is written only after Agent Login, not on profile open.
        } catch (error) {
          console.warn("[session] post-open badge:", error instanceof Error ? error.message : error);
        }
      })();
    }

    profileService.touchLastOpened(id);
    const launchReason = badgeHeadless
      ? profile?.agentReason
        ? `👻 Headless — ${profile.agentReason}`
        : "👻 Headless"
      : "";
    const running = profileService.setProfileStatus(
      id,
      "running",
      launchReason ? { reason: launchReason } : undefined,
    );
    const runningWithVpn = vpnCountry ? { ...running, activeVpnCountry: vpnCountry } : running;
    this.#emitSessionChange(id, runningWithVpn, "running");
    return {
      ok: true,
      status: "running",
      profile: runningWithVpn,
      userDataDir: opened.userDataDir,
      primaryUserDataDir,
      debugPort: opened.debugPort || 0,
      shadowLane: Boolean(shadowLane),
      ...launchMeta(profile),
    };
  }

  #bindFocusOnlyLifecycle(id, userDataDir) {
    const watchdog = setInterval(() => {
      void (async () => {
        const session = this.#sessions.get(id);
        if (!session?.alive || !session.focusOnly) {
          clearInterval(watchdog);
          return;
        }
        const alive = await hasProfileBrowserProcess(userDataDir);
        if (alive) return;
        if (session.watchdog) clearInterval(session.watchdog);
        session.alive = false;
        this.#sessions.delete(id);
        const next = profileService.setProfileStatus(id, "closed", { reason: "watchdog" });
        this.#emitSessionChange(id, next, "closed");
        try {
          this.#schedulePostCloseCacheTrim(id, userDataDir);
        } catch {
          /* ignore */
        }
      })();
    }, SESSION_WATCHDOG_MS);
    const session = this.#sessions.get(id);
    if (session) session.watchdog = watchdog;
  }

  async #tryAttachOrFocusOrphan(profile, userDataDir, { skipStartupUrl = false } = {}) {
    const id = String(profile.id);
    const profileCode = extractProfileCode(profile.name, profile.id);
    const sidecar = readSidecarPid(userDataDir);
    const port = sidecar?.debugPort || readDevToolsActivePort(userDataDir);
    const isAgentCaller = Boolean(isAgentSmokeLaunch() || launchMeta(profile).headless);
    const liveHeadedPid = findLiveHeadedBrowserPidNative(userDataDir);

    if (
      isAgentCaller &&
      (liveHeadedPid > 0 || (sidecar?.headless === false && profileDirHasLock(userDataDir)))
    ) {
      if (process.env.STEALTH_FORCE_TEMP_SHADOW_DIR === "1") {
        return this.#launchAgentShadow({ ...profile, headless: true, shadowLane: true }, { skipStartupUrl });
      }
      this.enqueueDeferredAgentTask(id, { reason: "orphan_probe_user_headed" });
      return {
        ok: false,
        skipped: "user_interactive_session",
        error: "user_interactive_session_active",
        status: "running",
        profile: profileService.getProfile(id) || profile,
        userDataDir,
        debugPort: 0,
        focused: false,
        headless: false,
        visibilityMode: "headed",
      };
    }

    if (port > 0) {
      try {
        await waitForCdp(port, { attempts: 8, intervalMs: 120 });
        const { chromium } = require("playwright-core");
        const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        const context = browser.contexts()[0];
        if (context && isContextAlive(context)) {
          return this.#registerPlaywrightSession(id, profile, {
            context,
            userDataDir,
            debugPort: port,
          }, { skipStartupUrl });
        }
      } catch {
        // fall through to focus-only attach
      }
    }

    // A lock file means a browser already holds this profile — skip the extra
    // ~3s WMI confirm and go straight to focus (focusProfileBrowserWindow runs
    // its own scoped lookup). Only pay the WMI probe when there is no lock to
    // disambiguate; a stale lock just yields a MISSING focus → null → respawn.
    if (!profileDirHasLock(userDataDir) && !(await hasProfileBrowserProcess(userDataDir))) return null;
    if (isAgentSmokeLaunch() || launchMeta(profile).headless) {
      // Never kill, focus, or shadow-clone a live user-opened headed browser when an agent/headless task probes the profile.
      // Parallel shadow Chromium instances fork Google DBSC (__Secure-1PSIDTS / SIDCC) rolling token chains and cause Gmail sign-outs.
      const liveHeadedUserWindow =
        findLiveHeadedBrowserPidNative(userDataDir) > 0 ||
        (sidecar?.headless === false && (await hasProfileBrowserProcess(userDataDir)));
      if (liveHeadedUserWindow) {
        if (process.env.STEALTH_FORCE_TEMP_SHADOW_DIR === "1") {
          return this.#launchAgentShadow({ ...profile, headless: true, shadowLane: true }, { skipStartupUrl });
        }
        this.enqueueDeferredAgentTask(id, { reason: "orphan_probe_live_user_headed" });
        return {
          ok: false,
          skipped: "user_interactive_session",
          error: "user_interactive_session_active",
          status: "running",
          profile: profileService.getProfile(id) || profile,
          userDataDir,
          debugPort: 0,
          focused: false,
          headless: false,
          visibilityMode: "headed",
        };
      }
      await killOrphanProfileBrowser(userDataDir);
      removeStaleProfileLocks(userDataDir);
      return null;
    }

    let focused = await focusProfileBrowserWindow(userDataDir);
    // Burst-open: Chromium writes SingletonLock before HWND exists. Killing on the
    // first no-window miss closes the just-spawned profile (“stuck then auto-close”).
    if (!focused.ok && focused.reason === "no-window") {
      for (let i = 0; i < 4 && focused.reason === "no-window"; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        focused = await focusProfileBrowserWindow(userDataDir);
        if (focused.ok) break;
      }
    }
    if (!focused.ok) {
      // Only reap a truly dead process. Never kill no-window (HWND not ready) —
      // burst-open / 100 profiles must stay up (standing order 2026-08-27).
      if (focused.reason === "not-running") {
        await killOrphanProfileBrowser(userDataDir);
        removeStaleProfileLocks(userDataDir);
      }
      return null;
    }

    const focusDebugPort = sidecar?.debugPort || port || 0;
    let focusPid = sidecar?.pid || 0;
    if (!focusPid) {
      const pids = await listProfileBrowserPids(userDataDir);
      focusPid = pids[0] || 0;
    }
    if (focusPid > 0) {
      writeSidecarPid(userDataDir, { pid: focusPid, debugPort: focusDebugPort });
    }

    scheduleProfileTaskbarBadgeApply(
      userDataDir,
      formatProfileWindowLabel(profile),
      profileCode,
      { browserPid: focusPid, headless: launchMeta(profile).headless, force: true },
    );
    this.#scheduleMissingBadgeSweep();

    this.#sessions.set(id, {
      context: null,
      userDataDir,
      alive: true,
      debugPort: focusDebugPort,
      profile,
      profileCode,
      focusOnly: true,
      headless: launchMeta(profile).headless,
      launchedAt: Date.now(),
    });
    this.#bindFocusOnlyLifecycle(id, userDataDir);
    profileService.touchLastOpened(id);
    const running = profileService.setProfileStatus(id, "running");
    this.#emitSessionChange(id, running, "focused");
    return {
      ok: true,
      status: "running",
      profile: running,
      userDataDir,
      debugPort: focusDebugPort,
      focused: true,
    };
  }

  /**
   * Reconcile bounded — O(số session sống + số row active), KHÔNG quét cả catalog.
   * An toàn cho 10k–50k profile (full-scan cũ sẽ rất nặng mỗi lần poll).
   */
  reconcileActiveStatuses({ force = false } = {}) {
    const nowMs = Date.now();
    if (!force && this._lastReconcileAt && nowMs - this._lastReconcileAt < 2500) {
      return false;
    }
    this._lastReconcileAt = nowMs;
    let changed = false;
    // (0) Evict dead sessions whose browser context is no longer alive — MUST terminate lingering headless processes
    // instead of merely deleting the Map entry (which previously orphaned chrome-headless.exe + conhost.exe).
    for (const [id, session] of this.#sessions.entries()) {
      if (!session.alive) continue;
      if (!session.focusOnly && session.context && !this.#inLaunchGrace(session) && !isContextAlive(session.context)) {
        if (session.headless !== true && session.userDataDir && findLiveHeadedBrowserPidNative(session.userDataDir) > 0) {
          if (session.watchdog) clearInterval(session.watchdog);
          session.context = null;
          session.focusOnly = true;
          this.#bindFocusOnlyLifecycle(id, session.userDataDir);
          continue;
        }
        if (session.headless === true) {
          void this.#closeSingleSession(id, session, this.#sessions, { isShadowLane: false, forcePriority: true }).catch(
            () => undefined,
          );
        } else {
          if (session.watchdog) clearInterval(session.watchdog);
          session.alive = false;
          this.#sessions.delete(id);
          removeSidecarPid(session.userDataDir);
        }
        changed = true;
      }
    }
    for (const [id, session] of this.#agentSessions.entries()) {
      if (!session.alive) continue;
      if (!session.focusOnly && session.context && !this.#inLaunchGrace(session) && !isContextAlive(session.context)) {
        void this.#closeSingleSession(id, session, this.#agentSessions, {
          isShadowLane: true,
          forcePriority: true,
        }).catch(() => undefined);
        changed = true;
      }
    }

    // Periodic 60s native sweep for untracked zombie chrome-headless.exe trees (>3m old)
    if (
      process.env.STEALTH_DEV_ISOLATED !== "1" &&
      this.#launchingIds.size === 0 &&
      this.#agentLaunchingIds.size === 0 &&
      (!this._lastUntrackedHeadlessSweepAt || nowMs - this._lastUntrackedHeadlessSweepAt >= 60_000)
    ) {
      this._lastUntrackedHeadlessSweepAt = nowMs;
      try {
        const trackedDirs = [];
        const trackedIds = [...this.#launchingIds, ...this.#agentLaunchingIds];
        const trackedPorts = [];
        for (const [id, s] of this.#sessions.entries()) {
          if (!s.alive) continue;
          trackedIds.push(id);
          if (s.userDataDir) trackedDirs.push(s.userDataDir);
          if (Number(s.debugPort) > 0) trackedPorts.push(Number(s.debugPort));
        }
        for (const [id, s] of this.#agentSessions.entries()) {
          if (!s.alive) continue;
          trackedIds.push(id);
          if (s.userDataDir) trackedDirs.push(s.userDataDir);
          if (Number(s.debugPort) > 0) trackedPorts.push(Number(s.debugPort));
        }
        reapUntrackedHeadlessBrowsersNative({ trackedDirs, trackedIds, trackedPorts, minAgeMs: 180_000 });
      } catch {
        /* best-effort native zombie sweep */
      }
    }
    const activeRows = profileService.listActiveProfileIds();
    const runningInDbSet = new Set(
      activeRows.filter((r) => r.status === "running").map((r) => String(r.id)),
    );
    // (a) Session đang sống (User lane hoặc Agent Shadow lane) nhưng DB chưa đánh dấu running → set running.
    for (const [id, session] of this.#sessions.entries()) {
      if (!session.alive) continue;
      if (!runningInDbSet.has(String(id))) {
        const next = profileService.setProfileStatus(id, "running");
        if (next) this.#emitSessionChange(id, next, "running");
        runningInDbSet.add(String(id));
        changed = true;
      }
    }
    for (const [id, session] of this.#agentSessions.entries()) {
      if (!session.alive) continue;
      if (!runningInDbSet.has(String(id))) {
        const next = profileService.setProfileStatus(id, "running");
        if (next) this.#emitSessionChange(id, next, "running");
        runningInDbSet.add(String(id));
        changed = true;
      }
    }
    // (b) DB đánh dấu active nhưng không còn session sống → set closed (dọn trạng thái treo).
    // Khi Dev dùng chung DB với Prod (:6003), không tự đóng các row đang chạy bên Prod nếu Dev không giữ session đó.
    const isSharedDevSecondary =
      process.env.STEALTH_DEV_ISOLATED === "1" && process.env.STEALTH_ISOLATE_DEV_DB !== "1";
    const openingStaleMs = 5_000;
    for (const row of activeRows) {
      if (row.status === "opening") {
        if (this.isRunning(row.id)) continue;
        if (isSharedDevSecondary) continue;
        const updatedAt = row.updatedAt ? Date.parse(row.updatedAt) : 0;
        if (updatedAt && Date.now() - updatedAt < openingStaleMs) continue;
        const next = profileService.setProfileStatus(row.id, "closed", { reason: "opening-stale" });
        this.#emitSessionChange(row.id, next, "opening-stale");
        changed = true;
        continue;
      }
      if (!this.isRunning(row.id) && !this.isUserInteractiveSession(row.id)) {
        if (isSharedDevSecondary) continue;
        const next = profileService.setProfileStatus(row.id, "closed", { reason: "reconcile" });
        this.#emitSessionChange(row.id, next, "closed");
        changed = true;
      }
    }
    return changed;
  }

  /** @deprecated Giữ cho tương thích — chuyển sang reconcileActiveStatuses (bounded). */
  syncProfileStatuses() {
    return this.reconcileActiveStatuses();
  }

  #bindSessionLifecycle(id, context, profile, { shadowLane = false } = {}) {
    let finalized = false;
    const sessionMap = shadowLane ? this.#agentSessions : this.#sessions;
    const siblingMap = shadowLane ? this.#sessions : this.#agentSessions;

    const finalize = (reason = "closed") => {
      if (finalized) return;
      finalized = true;
      const session = sessionMap.get(id);
      if (!session || session.context !== context) return;

      if (session.watchdog) clearInterval(session.watchdog);
      session.alive = false;
      sessionMap.delete(id);
      const siblingAlive = Boolean(siblingMap.get(id)?.alive);
      try {
        if (!siblingAlive) {
          const next = profileService.setProfileStatus(id, "closed", { reason });
          if (next) this.#emitSessionChange(id, next, reason);
        } else {
          const currentProfile = profileService.getProfile(id);
          if (currentProfile) this.#emitSessionChange(id, currentProfile, "running");
        }
      } catch (error) {
        console.warn("[session] finalize status:", error instanceof Error ? error.message : error);
      }
      const closeDir = session.userDataDir;
      const primaryDir = session.primaryUserDataDir || closeDir;
      setTimeout(() => {
        try {
          if (shadowLane) {
            const primaryLocked = Boolean(this.#sessions.get(id)?.alive || profileDirHasLock(primaryDir));
            syncAgentShadowBackToPrimary(closeDir, primaryDir, {
              primaryLocked,
              cleanupShadow: true,
            });
          } else {
            this.#schedulePostCloseCacheTrim(id, closeDir);
          }
        } catch {
          /* ignore */
        }
      }, 700);
    };

    const maybeFinalizeWhenEmpty = () => {
      setTimeout(() => {
        void (async () => {
          const session = sessionMap.get(id);
          if (!session || session.context !== context || !session.alive) return;
          if (this.#inLaunchGrace(session)) return;
          try {
            if (context.pages().length > 0) return;
            if (await hasProfileBrowserProcess(session.userDataDir)) return;
            finalize("window-closed");
          } catch {
            if (!this.#inLaunchGrace(session)) finalize("window-closed");
          }
        })();
      }, 400);
    };

    const AUTH_FAST_SYNC_HOST_RE =
      /(?:^|\.)(?:facebook|google|gmail|youtube|live|outlook|hotmail|microsoft|microsoftonline|tiktok|chatgpt|openai|claude|cursor|capcut|elevenlabs|grok|x|twitter|instagram|perplexity)\.com$|(?:^|\.)(?:claude\.ai|elevenlabs\.io)$/i;
    const PRIMARY_AUTH_COOKIE_NAMES = new Set([
      "c_user",
      "xs",
      "SID",
      "SAPISID",
      "__Secure-1PSID",
      "__Secure-3PSID",
      "LSID",
      "__Host-1PLSID",
      "RPSSecAuth",
      "__Host-MSAAUTH",
      "__Host-MSAAUTHP",
      "ESTSAUTH",
      "ESTSAUTHPERSISTENT",
      "MSPAuth",
      "WLSSC",
      "sessionid",
      "sessionid_ss",
      "sid_tt",
      "uid_tt",
      "auth_token",
      "__Secure-next-auth.session-token",
      "sessionKey",
      "WorkosCursorSessionToken",
      "sso",
    ]);
    const computeAuthCookieSignature = (cookies) => {
      if (!Array.isArray(cookies) || cookies.length === 0) return "";
      const parts = [];
      for (const c of cookies) {
        if (!c || !PRIMARY_AUTH_COOKIE_NAMES.has(c.name)) continue;
        const val = String(c.value || "").trim();
        if (!val || val === "0" || val.toLowerCase() === "disabled") continue;
        const dom = String(c.domain || "").replace(/^\./, "").toLowerCase();
        parts.push(`${dom}:${c.name}=${val.slice(0, 28)}`);
      }
      if (parts.length === 0) return "";
      parts.sort();
      return parts.join("|");
    };

    const bindPageClose = (page) => {
      page.once("close", maybeFinalizeWhenEmpty);
      // Chromium resets WM_SETICON on title/nav — re-stamp badge (debounced).
      let badgeNavTimer = null;
      let platformSyncNavTimer = null;
      let fastAuthCookieTimer = null;
      const runLiveNavPlatformSync = (fastCookiePairs = null, isExplicitLogout = false) => {
        try {
          const cur = sessionMap.get(id);
          if (!cur?.alive || !(Number(cur.debugPort) > 0)) return;
          const nowMs = Date.now();
          const isFastAuthTrigger =
            (Array.isArray(fastCookiePairs) && fastCookiePairs.length > 0) || Boolean(isExplicitLogout);
          if (!isFastAuthTrigger) {
            const elapsedMs = nowMs - Number(cur.lastLiveNavSyncAt || 0);
            const minIntervalMs = 8000;
            if (elapsedMs < minIntervalMs) {
              if (!cur.trailingLiveNavTimer) {
                cur.trailingLiveNavTimer = setTimeout(() => {
                  cur.trailingLiveNavTimer = null;
                  runLiveNavPlatformSync();
                }, Math.max(1000, minIntervalMs - elapsedMs));
                if (typeof cur.trailingLiveNavTimer.unref === "function") {
                  cur.trailingLiveNavTimer.unref();
                }
              }
              return;
            }
          }
          const code = cur.profileCode || extractProfileCode(profile.name, profile.id);
          if (!code) return;
          cur.lastLiveNavSyncAt = nowMs;
          void Promise.resolve(
            getMultiplatformSyncModule().syncProfilePlatformsToP0020IfChanged?.({
              userDataDir: cur.userDataDir,
              profileCode: code,
              profileId: id,
              cookiePairs: isFastAuthTrigger && Array.isArray(fastCookiePairs) ? fastCookiePairs : undefined,
              source: "p0003_live_nav",
              liveCdp: true,
              debugPort: Number(cur.debugPort),
            }),
          ).catch(() => undefined);
        } catch {
          /* ignore */
        }
      };
      const maybeProbeFastAuthCookieSync = (candidateUrl = "") => {
        try {
          if (shadowLane) return;
          const session = sessionMap.get(id);
          if (!session?.alive || !(Number(session.debugPort) > 0)) return;
          if (candidateUrl) {
            try {
              const host = new URL(candidateUrl).hostname.toLowerCase();
              if (!AUTH_FAST_SYNC_HOST_RE.test(host)) return;
            } catch {
              return;
            }
          }
          if (fastAuthCookieTimer) clearTimeout(fastAuthCookieTimer);
          fastAuthCookieTimer = setTimeout(async () => {
            fastAuthCookieTimer = null;
            try {
              const cur = sessionMap.get(id);
              if (!cur?.alive || !(Number(cur.debugPort) > 0)) return;
              const liveCookies = await context.cookies().catch(() => null);
              if (!Array.isArray(liveCookies) || liveCookies.length === 0) return;
              const nextSig = computeAuthCookieSignature(liveCookies);
              const prevSig = String(cur.lastAuthCookieSig || "");
              if (nextSig === prevSig || (!nextSig && !prevSig)) return;
              cur.lastAuthCookieSig = nextSig;
              runLiveNavPlatformSync(liveCookies, !nextSig && Boolean(prevSig));
            } catch {
              /* ignore */
            }
          }, 600);
          if (typeof fastAuthCookieTimer.unref === "function") fastAuthCookieTimer.unref();
        } catch {
          /* ignore */
        }
      };
      const maybeTriggerPlatformSync = () => {
        try {
          if (shadowLane) return;
          const session = sessionMap.get(id);
          if (!session?.alive || !(Number(session.debugPort) > 0)) return;
          if (platformSyncNavTimer) clearTimeout(platformSyncNavTimer);
          platformSyncNavTimer = setTimeout(runLiveNavPlatformSync, 2500);
          if (typeof platformSyncNavTimer.unref === "function") platformSyncNavTimer.unref();
        } catch {
          /* ignore */
        }
      };
      const maybeRestampBadge = () => {
        try {
          if (shadowLane) return;
          const session = sessionMap.get(id);
          if (!session?.alive || session.focusOnly || session.headless) return;
          if (badgeNavTimer) clearTimeout(badgeNavTimer);
          badgeNavTimer = setTimeout(() => {
            scheduleProfileTaskbarBadgeApply(
              session.userDataDir,
              formatProfileWindowLabel(profile),
              session.profileCode || extractProfileCode(profile.name, profile.id),
              {
                browserPid: readSidecarPid(session.userDataDir)?.pid || 0,
                headless: session.headless,
                force: true,
                isReinforce: true,
              },
            );
          }, 700);
        } catch {
          /* ignore */
        }
      };
      page.on("framenavigated", (frame) => {
        const s = sessionMap.get(id);
        if (s) s.lastActivityAt = Date.now();
        try {
          if (frame && frame !== page.mainFrame()) return;
        } catch {
          /* ignore */
        }
        maybeRestampBadge();
        maybeProbeFastAuthCookieSync(typeof frame?.url === "function" ? frame.url() : page.url());
      });
      page.on("response", (response) => {
        const s = sessionMap.get(id);
        if (s) s.lastActivityAt = Date.now();
        try {
          const st = typeof response?.status === "function" ? response.status() : 0;
          if (st !== 200 && st !== 204 && (st < 300 || st >= 400)) return;
          const reqUrl = typeof response?.url === "function" ? response.url() : "";
          if (!reqUrl) return;
          maybeProbeFastAuthCookieSync(reqUrl);
        } catch {
          /* ignore */
        }
      });
      page.on("load", () => {
        const s = sessionMap.get(id);
        if (s) s.lastActivityAt = Date.now();
        maybeRestampBadge();
        maybeProbeFastAuthCookieSync(page.url());
        maybeTriggerPlatformSync();
      });
      page.on("domcontentloaded", () => {
        const s = sessionMap.get(id);
        if (s) s.lastActivityAt = Date.now();
        maybeRestampBadge();
      });
    };

    context.on("close", () => finalize("context-closed"));

    for (const page of context.pages()) {
      bindPageClose(page);
    }
    context.on("page", (page) => {
      const s = sessionMap.get(id);
      if (s) s.lastActivityAt = Date.now();
      bindPageClose(page);
    });

    try {
      const browser = context.browser();
      if (browser) {
        browser.on("disconnected", () => finalize("disconnected"));
      }
    } catch {
      // persistent context may not expose browser()
    }

    const watchdog = setInterval(() => {
      const session = sessionMap.get(id);
      if (!session || session.context !== context || !session.alive) {
        clearInterval(watchdog);
        return;
      }
      if (this.#inLaunchGrace(session)) return;
      const idleMs = Date.now() - (session.lastActivityAt || session.launchedAt || 0);
      const isExemptTask = session.headless === true && isExemptActiveChatOrTaskSession(session);
      const effectiveIdleTtlMs = isExemptTask ? HEADLESS_ACTIVE_TASK_IDLE_TTL_MS : HEADLESS_AGENT_IDLE_TTL_MS;
      if (
        session.headless === true &&
        idleMs > effectiveIdleTtlMs &&
        isReapableHeadlessCode(session.profileCode || extractProfileCode(profile.name, profile.id), {
          shadowLane,
          headless: true,
          idleMs,
          session,
        })
      ) {
        void this.close(id, { agentOnly: shadowLane, force: true })
          .then((res) => {
            if (!res?.skipped) clearInterval(watchdog);
          })
          .catch(() => undefined);
        return;
      }
      if (isContextAlive(context)) {
        return;
      }
      void hasProfileBrowserProcess(session.userDataDir).then((alive) => {
        if (!alive) finalize("watchdog");
      }).catch(() => finalize("watchdog"));
    }, SESSION_WATCHDOG_MS);

    const session = sessionMap.get(id);
    if (session) session.watchdog = watchdog;
  }

  async #dropSession(id) {
    const session = this.#sessions.get(id);
    if (!session) return;
    if (session.watchdog) clearInterval(session.watchdog);
    session.alive = false;
    this.#sessions.delete(id);
    markProfileChromeCleanExit(session.userDataDir);
    if (session.focusOnly) {
      await killOrphanProfileBrowser(session.userDataDir, {
        forcePriority: true,
        debugPortHint: session.debugPort,
      });
    } else {
      await closeContext(session.context, { forcePriority: true });
      if (session.headless === true || Number(session.debugPort) > 0 || profileDirHasLock(session.userDataDir)) {
        await killOrphanProfileBrowser(session.userDataDir, {
          forcePriority: true,
          debugPortHint: session.debugPort,
        });
      }
    }
    removeStaleProfileLocks(session.userDataDir);
    removeSidecarPid(session.userDataDir);
  }

  async #dropAgentSession(id) {
    const session = this.#agentSessions.get(id);
    if (!session) return;
    if (session.watchdog) clearInterval(session.watchdog);
    session.alive = false;
    this.#agentSessions.delete(id);
    markProfileChromeCleanExit(session.userDataDir);
    await closeContext(session.context, { forcePriority: true });
    await killOrphanProfileBrowser(session.userDataDir, {
      forcePriority: true,
      debugPortHint: session.debugPort,
    });
    removeStaleProfileLocks(session.userDataDir);
    removeSidecarPid(session.userDataDir);
    const primaryDir = session.primaryUserDataDir || profileDataDir(this.#userDataRoot, id);
    if (session.userDataDir && primaryDir && path.resolve(session.userDataDir) !== path.resolve(primaryDir)) {
      const primaryLocked = Boolean(this.#sessions.get(id)?.alive || (primaryDir && profileDirHasLock(primaryDir)));
      syncAgentShadowBackToPrimary(session.userDataDir, primaryDir, {
        primaryLocked,
        cleanupShadow: true,
      });
    }
  }

  async awaitLaunchNavigation(profileId, { settle = true, preferAgent = false } = {}) {
    const id = String(profileId);
    const session =
      preferAgent || isAgentSmokeLaunch()
        ? this.#agentSessions.get(id) || this.#sessions.get(id)
        : this.#sessions.get(id) || this.#agentSessions.get(id);
    if (!session?.alive) return;
    try {
      if (session.startupNavigation) await session.startupNavigation;
    } catch {
      // launch still succeeds — workflow may navigate manually
    }
    if (!settle || !session.context) return;
    try {
      await awaitBrowserReady(session.context);
      await stabilizePrimaryPage(session.context);
    } catch {
      // best-effort settle before workflow navigation
    }
  }

  /** Upgrade focus-only attach to a Playwright context when CDP port is available. */
  async #upgradeToPlaywrightContext(id, profile, userDataDir) {
    const session = this.#sessions.get(id);
    if (session?.context && !session.focusOnly && isContextAlive(session.context)) {
      return true;
    }

    const port = readDevToolsActivePort(userDataDir);
    if (port <= 0) return false;

    try {
      await waitForCdp(port, { attempts: 8, intervalMs: 120 });
      const { chromium } = require("playwright-core");
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      const context = browser.contexts()[0];
      if (!context || !isContextAlive(context)) return false;

      if (session?.watchdog) clearInterval(session.watchdog);
      this.#registerPlaywrightSession(id, profile, {
        context,
        userDataDir,
        debugPort: port,
      }, { skipStartupUrl: true });
      return true;
    } catch {
      return false;
    }
  }

  #shouldUseAgentShadowLane(id, profile) {
    // Single-Directory Unified Cookie Store & Single-Owner Exclusive Turn (ok 1):
    // Never fork Cookies into %TEMP%/p0003-agent-shadow by default because concurrent/forked
    // Chromium instances rotate Google's __Secure-1PSIDTS independently and cause Cookie conflicts.
    // Only use the temp shadow lane if STEALTH_FORCE_TEMP_SHADOW_DIR === "1" is explicitly set.
    if (process.env.STEALTH_FORCE_TEMP_SHADOW_DIR !== "1") {
      return false;
    }
    const isAgentOrHeadless = Boolean(
      isAgentSmokeLaunch() || launchMeta(profile || {}).headless || profile?.shadowLane,
    );
    return isAgentOrHeadless;
  }

  /**
   * Prepare a live Playwright context for workflow Launch (skip profile startup URL).
   * Dual-Lane User Headed + Agent Headless Shadow Isolation:
   * - If User already has a Headed window open (`isUserInteractiveSession(id)`), Agent automatically
   *   spawns and attaches to an isolated Headless Shadow browser (`%TEMP%/p0003-agent-shadow/<id>`)
   *   so zero tabs open in the User's Headed window and zero mouse/window focus is stolen.
   * - If Agent starts first when User is not running the profile, it opens Headless on `D:\StealthBrowser\profiles\<id>`.
   */
  async ensureAutomationContext(profile, { headless } = {}) {
    const id = String(profile.id);
    const launchProfile = typeof headless === "boolean" ? { ...profile, headless } : profile;
    const isAgentCall = Boolean(isAgentSmokeLaunch() || launchMeta(launchProfile).headless);
    const useTempShadow = this.#shouldUseAgentShadowLane(id, launchProfile);

    if (useTempShadow) {
      if (!this.isAgentShadowRunning(id)) {
        await this.launch({ ...launchProfile, headless: true, shadowLane: true }, { skipStartupUrl: true });
      }
      await this.awaitLaunchNavigation(id, { settle: false, preferAgent: true });
      const agentSession = this.#agentSessions.get(id);
      const context = agentSession?.alive ? agentSession.context : this.getContext(id, { preferAgent: true });
      if (!context) throw new Error("Unable to obtain shadow browser context.");
      return context;
    }

    const userDataDir = profileDataDir(this.#userDataRoot, id);
    const userSess = this.#sessions.get(id);
    if (!userSess?.alive) {
      await this.launch(isAgentCall ? { ...launchProfile, headless: true } : launchProfile, {
        skipStartupUrl: true,
      });
    } else {
      if (!userSess.context || userSess.focusOnly) {
        const upgraded = await this.#upgradeToPlaywrightContext(id, profile, userDataDir);
        if (!upgraded) {
          const attached = await this.#tryAttachOrFocusOrphan(profile, userDataDir, { skipStartupUrl: true });
          if (!attached || !this.getContext(id)) {
            throw new Error("Unable to obtain browser context for workflow.");
          }
        }
      }
      if (!isAgentCall && launchProfile.headless !== true) {
        const current = this.#sessions.get(id);
        if (current?.headless !== true) await this.focusProfile(id);
      }
    }

    await this.awaitLaunchNavigation(id, { settle: false });
    const context = this.getContext(id);
    if (!context) throw new Error("Unable to obtain browser context.");
    return context;
  }

  async launch(profile, { skipStartupUrl = false } = {}) {
    const id = String(profile.id);
    const effectiveProfile =
      isAgentSmokeLaunch() && profile.headless !== true ? { ...profile, headless: true } : profile;
    const isShadowLane = this.#shouldUseAgentShadowLane(id, effectiveProfile);
    const promiseMap = isShadowLane ? this.#agentLaunchPromises : this.#launchPromises;
    const inflight = promiseMap.get(id);
    if (inflight) return inflight;
    const promise = isShadowLane
      ? this.#launchAgentShadow({ ...effectiveProfile, headless: true, shadowLane: true }, { skipStartupUrl })
      : this.#launchOnce(effectiveProfile, { skipStartupUrl });
    promiseMap.set(id, promise);
    try {
      return await promise;
    } finally {
      if (promiseMap.get(id) === promise) promiseMap.delete(id);
    }
  }

  /**
   * Dual-Lane Agent Headless Shadow Launch:
   * Seeds `%TEMP%/p0003-agent-shadow/<id>` from `D:/StealthBrowser/profiles/<id>` and spawns
   * an isolated Headless Chromium instance that never locks the User's Primary directory
   * and never touches or closes the User's active Headed window.
   */
  async #launchAgentShadow(profile, { skipStartupUrl = false } = {}) {
    const id = String(profile.id);
    this.#agentLaunchingIds.add(id);
    try {
      const existing = this.#agentSessions.get(id);
      if (existing?.alive && existing.context && isContextAlive(existing.context)) {
        existing.lastActivityAt = Date.now();
        const current = profileService.getProfile(id) || profile;
        return {
          ok: true,
          status: "running",
          profile: current,
          userDataDir: existing.userDataDir,
          primaryUserDataDir: existing.primaryUserDataDir,
          debugPort: existing.debugPort || 0,
          focused: true,
          shadowLane: true,
          ...launchMeta(profile),
        };
      }
      if (existing) {
        await this.#dropAgentSession(id);
      }

      await this.#waitHeadlessLaunchSlot();
      await this.#enforceRunningCap({ ...profile, headless: true });

      const primaryUserDataDir = profileDataDir(this.#userDataRoot, id);
      const shadowUserDataDir = seedAgentShadowFromPrimary(primaryUserDataDir, id);

      if (profileDirHasLock(shadowUserDataDir)) {
        await killOrphanProfileBrowser(shadowUserDataDir);
        removeStaleProfileLocks(shadowUserDataDir);
      }

      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          if (attempt > 0) {
            await killOrphanProfileBrowser(shadowUserDataDir);
            removeStaleProfileLocks(shadowUserDataDir);
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          }
          let debugPort = 0;
          if (cdpEnabled()) {
            try {
              debugPort = await getFreePort();
            } catch {
              debugPort = 0;
            }
          }
          const opened = await openProfile(
            { ...profile, headless: true },
            this.#userDataRoot,
            { debugPort, userDataDirOverride: shadowUserDataDir },
          );
          return this.#registerPlaywrightSession(
            id,
            { ...profile, headless: true },
            { ...opened, primaryUserDataDir },
            { skipStartupUrl: true || skipStartupUrl, shadowLane: true },
          );
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    } finally {
      this.#agentLaunchingIds.delete(id);
    }
  }

  async #launchOnce(profile, { skipStartupUrl = false } = {}) {
    const id = String(profile.id);
    this.#launchingIds.add(id);
    try {
    const existing = this.#sessions.get(id);
    const callerWantsHeaded = profile.headless !== true && !isAgentSmokeLaunch();
    if (!callerWantsHeaded && ((existing?.alive && existing.headless !== true) || this.isUserInteractiveSession(id))) {
      // Single-Owner Exclusive Turn (ok 1):
      // While the User has this profile open in Headed mode, automated Agent/Headless tasks must NEVER
      // hijack the User's window or fork Cookies. Defer/skip until the User closes the window.
      if (process.env.STEALTH_ALLOW_AGENT_ON_USER_HEADED !== "1" && profile?.allowUserHeadedAttach !== true) {
        this.enqueueDeferredAgentTask(id, { reason: "agent_launch_while_user_headed" });
        const currentProfile = profileService.getProfile(id) || existing?.profile || profile;
        return {
          ok: false,
          skipped: "user_interactive_session",
          error: "user_interactive_session_active",
          status: "running",
          profile: currentProfile,
          userDataDir: existing?.userDataDir || profileDataDir(this.#userDataRoot, id),
          debugPort: 0,
          focused: false,
          headless: false,
          visibilityMode: "headed",
        };
      }
    }
    if (existing?.alive && existing.headless === true && callerWantsHeaded) {
      // User clicked "Run 👻" while Agent had the profile open in Headless mode on the primary directory:
      // seamlessly promote the unified profile directory from Headless -> Headed window!
      await this.#dropSession(id);
    } else if (existing?.alive) {
      existing.lastActivityAt = Date.now();
      if (existing.focusOnly && (isAgentSmokeLaunch() || profile.headless === true)) {
        const userDataDir = existing.userDataDir || profileDataDir(this.#userDataRoot, id);
        await this.#upgradeToPlaywrightContext(id, profile, userDataDir).catch(() => false);
      }
      const currentSess = this.#sessions.get(id) || existing;
      if (currentSess.context) {
        if (currentSess.headless !== true && callerWantsHeaded) {
          await this.focusProfile(id);
          scheduleProfileTaskbarBadgeApply(
            currentSess.userDataDir,
            formatProfileWindowLabel(profile),
            extractProfileCode(profile.name, profile.id),
            {
              browserPid: readSidecarPid(currentSess.userDataDir)?.pid || 0,
              headless: currentSess.headless ?? launchMeta(profile).headless,
              force: true,
            },
          );
        }
        profileService.touchLastOpened(id);
        const next = profileService.setProfileStatus(id, "running");
        return {
          ok: true,
          status: "running",
          profile: next,
          userDataDir: currentSess.userDataDir,
          debugPort: currentSess.debugPort || 0,
          focused: callerWantsHeaded && currentSess.headless !== true,
          headless: Boolean(currentSess.headless),
          visibilityMode: currentSess.headless ? "headless" : "headed",
        };
      }
      if (currentSess.focusOnly) {
        if (callerWantsHeaded) {
          await focusProfileBrowserWindow(currentSess.userDataDir);
          scheduleProfileTaskbarBadgeApply(
            currentSess.userDataDir,
            formatProfileWindowLabel(profile),
            extractProfileCode(profile.name, profile.id),
            {
              browserPid: readSidecarPid(currentSess.userDataDir)?.pid || 0,
              headless: currentSess.headless ?? launchMeta(profile).headless,
              force: true,
            },
          );
        }
        profileService.touchLastOpened(id);
        const next = profileService.setProfileStatus(id, "running");
        return {
          ok: true,
          status: "running",
          profile: next,
          userDataDir: currentSess.userDataDir,
          debugPort: currentSess.debugPort || 0,
          focused: callerWantsHeaded,
          headless: Boolean(currentSess.headless),
          visibilityMode: currentSess.headless ? "headless" : "headed",
        };
      }
    }
    if (this.#sessions.get(id)) {
      await this.#dropSession(id);
    }

    const priorStatus = profile.status;
    profileService.setProfileStatus(id, "opening");
    this.#emitSessionChange(id, profileService.getProfile(id), "opening");
    const userDataDir = profileDataDir(this.#userDataRoot, id);
    const needsAggressivePrep = priorStatus === "failed" || priorStatus === "opening";
    let lastError = null;

    let attached = null;

    // Repair stale locks/orphans before WMI attach probe — dead lockfile used to cost 20s+.
    // Live browser (incl. prod cmdline while Dev uses -dev junction) → attach/focus, do not kill.
    const prep = await prepareProfileForLaunch(userDataDir, {
      aggressive: needsAggressivePrep || profileDirHasLock(userDataDir),
    });

    if (prep?.live || !shouldSkipOrphanProbe(userDataDir, priorStatus)) {
      attached = await this.#tryAttachOrFocusOrphan(profile, userDataDir, { skipStartupUrl });
    }
    if (attached) {
      if (!callerWantsHeaded) {
      await this.#waitHeadlessLaunchSlot();
    }
    await this.#enforceRunningCap(profile);
      return attached;
    }

    if (!callerWantsHeaded) {
      await this.#waitHeadlessLaunchSlot();
    }
    await this.#enforceRunningCap(profile);

    // Live orphan found (often Chrome App/PWA on AppData junction path) but attach failed —
    // must repair before first launch or ProcessSingleton Error 32 aborts immediately.
    // However, NEVER kill a live headed / Taskbar PWA browser window (`findLiveHeadedBrowserPidNative > 0`).
    if (prep?.live || profileDirHasLock(userDataDir)) {
      const liveHeadedPid = findLiveHeadedBrowserPidNative(userDataDir);
      if (liveHeadedPid > 0) {
        if (!callerWantsHeaded) {
          this.enqueueDeferredAgentTask(id, { reason: "live_headed_pwa_window" });
          return {
            ok: false,
            skipped: "user_interactive_session",
            error: "user_interactive_session_active",
            status: "running",
            profile: profileService.getProfile(id) || profile,
            userDataDir,
            debugPort: 0,
            focused: false,
            headless: false,
            visibilityMode: "headed",
          };
        }
        const livePort = Number(readSidecarPid(userDataDir)?.debugPort || readDevToolsActivePort(userDataDir) || 0);
        this.#sessions.set(id, {
          context: null,
          userDataDir,
          alive: true,
          debugPort: livePort,
          profile,
          profileCode: extractProfileCode(profile.name, profile.id),
          focusOnly: true,
          headless: false,
          launchedAt: Date.now(),
        });
        this.#bindFocusOnlyLifecycle(id, userDataDir);
        profileService.touchLastOpened(id);
        const running = profileService.setProfileStatus(id, "running");
        this.#emitSessionChange(id, running, "focused");
        return {
          ok: true,
          status: "running",
          profile: running,
          userDataDir,
          debugPort: livePort,
          focused: true,
          headless: false,
          visibilityMode: "headed",
        };
      }
      await repairProfileUserDataDir(userDataDir);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (attempt > 0) {
          const retried = await this.#tryAttachOrFocusOrphan(profile, userDataDir, {
            skipStartupUrl,
          });
          if (retried) return retried;
          await repairProfileUserDataDir(userDataDir);
          await new Promise((resolve) => setTimeout(resolve, 280 * attempt));
        }

        let debugPort = 0;
        if (cdpEnabled()) {
          try {
            debugPort = await getFreePort();
          } catch {
            debugPort = 0; // không cấp được port → vẫn launch, chỉ thiếu CDP passthrough
          }
        }
        const opened = await openProfile(profile, this.#userDataRoot, { debugPort });
        return this.#registerPlaywrightSession(id, profile, opened, { skipStartupUrl });
      } catch (error) {
        lastError = error;
        if (attempt < 2 && isLaunchLockError(error)) {
          const retried = await this.#tryAttachOrFocusOrphan(profile, userDataDir, {
            skipStartupUrl,
          });
          if (retried) return retried;
          const alive = await hasProfileBrowserProcess(userDataDir);
          if (alive) {
            await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
            const retried2 = await this.#tryAttachOrFocusOrphan(profile, userDataDir, {
              skipStartupUrl,
            });
            if (retried2) return retried2;
            continue;
          }
          await killOrphanProfileBrowser(userDataDir);
          await repairProfileUserDataDir(userDataDir);
          continue;
        }
        const failed = profileService.setProfileStatus(id, "failed");
        this.#emitSessionChange(id, failed, "failed");
        throw error;
      }
    }

    const failed = profileService.setProfileStatus(id, "failed");
    this.#emitSessionChange(id, failed, "failed");
    throw lastError;
    } finally {
      this.#launchingIds.delete(id);
    }
  }

  /**
   * Headless agent hit a captcha — show the window. A headed window stays as-is.
   * Login completion is watched separately and closes only that process.
   */
  async revealCaptcha(profile, url) {
    const id = String(profile.id);
    const agentSess = this.#agentSessions.get(id);
    if (agentSess?.alive) {
      await this.close(id, { agentOnly: true });
    }
    const session = this.#sessions.get(id);
    if (!session?.alive) {
      await this.launch({ ...profile, headless: false }, { skipStartupUrl: true });
      const context = this.getContext(id);
      const page = context?.pages?.().find((item) => !item.isClosed());
      if (page && url) {
        await page.goto(url, { waitUntil: "commit", timeout: 45000 }).catch(() => undefined);
      }
    }
    const latest = this.#sessions.get(id);
    if (latest) latest.captchaVisible = true;
    await this.focusProfile(id);
    return { ok: true };
  }

  /** After the visible captcha is solved, stamp the stored mailbox and close this process. */
  startAgentLoginWatch(profile, { accountId, email, serviceFamily = "google" } = {}) {
    const id = String(profile.id);
    const session = this.#sessions.get(id) || this.#agentSessions.get(id);
    if (!session?.alive || !accountId || session.agentLoginWatch) return;
    const { stampStoredMailLoginSnapshot } = require("../lib/stealth-account-sync.cjs");
    const started = Date.now();
    session.agentLoginWatch = setInterval(() => {
      void (async () => {
        const current = this.#sessions.get(id) || this.#agentSessions.get(id);
        if (!current?.alive || !current.context) {
          clearInterval(session.agentLoginWatch);
          return;
        }
        if (Date.now() - started > 20 * 60 * 1000) {
          clearInterval(session.agentLoginWatch);
          return;
        }
        try {
          const page = current.context.pages().find((item) => !item.isClosed());
          const url = page?.url?.() || "";
          if (/recaptcha/i.test(url)) return;
          const result = await stampStoredMailLoginSnapshot(current.context, profile, {
            accountId,
            email,
            serviceFamily,
          });
          if (result?.snapshot?.status === "logged_in") {
            clearInterval(session.agentLoginWatch);
            await this.close(id);
          }
        } catch {
          /* keep the captcha window open */
        }
      })();
    }, 8000);
    if (typeof session.agentLoginWatch.unref === "function") session.agentLoginWatch.unref();
  }

  async #closeSingleSession(id, session, sessionMap, { isShadowLane = false, forcePriority = false } = {}) {
    if (!session) return;
    if (session.watchdog) clearInterval(session.watchdog);
    session.alive = false;
    sessionMap.delete(id);
    const closeCode = session.profileCode || extractProfileCode(session.profile?.name, id);
    const primaryDir = session.primaryUserDataDir || profileDataDir(this.#userDataRoot, id) || session.userDataDir;

    if (session.focusOnly) {
      await killOrphanProfileBrowser(session.userDataDir, {
        forcePriority,
        debugPortHint: session.debugPort,
      });
      removeStaleProfileLocks(session.userDataDir);
    } else {
      if (session.context) {
        // One-Way Live Cookie Sync on close: only copy from User Primary into Agent Shadow if open;
        // NEVER overwrite User Primary (#sessions) cookies from a closing Agent Shadow context.
        const sibling = !isShadowLane ? this.#agentSessions.get(id) : null;
        if (sibling?.alive && sibling.context && isContextAlive(sibling.context)) {
          await session.context
            .cookies()
            .then((cookies) =>
              Array.isArray(cookies) && cookies.length > 0
                ? sibling.context.addCookies(cookies).catch(() => undefined)
                : undefined,
            )
            .catch(() => undefined);
        }
      }
      markProfileChromeCleanExit(session.userDataDir);
      await closeContext(session.context, { forcePriority });
      const sidecarPid = readSidecarPid(session.userDataDir)?.pid || 0;
      let sidecarAlive = false;
      if (sidecarPid > 0) {
        try {
          process.kill(sidecarPid, 0);
          sidecarAlive = true;
        } catch {
          sidecarAlive = false;
        }
      }
      if (
        sidecarAlive ||
        session.headless === true ||
        isShadowLane ||
        Number(session.debugPort) > 0 ||
        profileDirHasLock(session.userDataDir)
      ) {
        await killOrphanProfileBrowser(session.userDataDir, {
          forcePriority,
          debugPortHint: session.debugPort,
        });
      }
      removeStaleProfileLocks(session.userDataDir);
    }
    removeSidecarPid(session.userDataDir);
    await waitForProfileUnlock(session.userDataDir);
    try {
      if (isShadowLane && session.userDataDir && primaryDir && path.resolve(session.userDataDir) !== path.resolve(primaryDir)) {
        const primaryLocked = Boolean(this.#sessions.get(id)?.alive || profileDirHasLock(primaryDir));
        syncAgentShadowBackToPrimary(session.userDataDir, primaryDir, {
          primaryLocked,
          cleanupShadow: true,
        });
      } else {
        this.#schedulePostCloseCacheTrim(id, session.userDataDir);
      }
    } catch {
      /* ignore */
    }
  }

  async close(profileId, { ignoreIfUserInteractive = false, agentOnly = false, force = false, forcePriority = false } = {}) {
    const id = String(profileId);
    const isAgentCaller = Boolean(agentOnly || ignoreIfUserInteractive || isAgentSmokeLaunch());
    const agentSession = this.#agentSessions.get(id);
    const userSession = this.#sessions.get(id);

    // 0. Unconditionally protect Priority-Locked sessions unless forcePriority === true
    if (!forcePriority) {
      try {
        const prof = profileService.getProfile(id);
        const codeStr = extractProfileCode(prof?.name || userSession?.profileCode || agentSession?.profileCode || "", id);
        const fp = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\priority-agent-locks.json";
        const parsed = readCachedJsonFile(fp);
        if (parsed) {
          const locks = parsed?.locks || {};
          const normCode = codeStr ? String(codeStr).padStart(4, "0") : "";
          const byCode = normCode ? locks[normCode] : null;
          const byId = Object.values(locks).find(
            (v) => v && typeof v === "object" && v.stealthId && String(v.stealthId) === id && Number(v.expiresAt || 0) > Date.now(),
          );
          const entry = (byCode && Number(byCode.expiresAt || 0) > Date.now()) ? byCode : byId;
          if (entry) {
            return {
              ok: true,
              skipped: "priority_agent_locked",
              status: "running",
              profile: prof,
            };
          }
        }
      } catch {
        /* ignore */
      }
    }

    // 1. If called by an Agent (or agentOnly), close the Agent Shadow session and NEVER close User Headed session or Priority-Locked / Active-Task session.
    if (isAgentCaller) {
      if (!force) {
        try {
          const prof = profileService.getProfile(id);
          const targetSession = agentSession || userSession;
          if (targetSession && isExemptActiveChatOrTaskSession(targetSession)) {
            return {
              ok: true,
              skipped: "active_chat_or_task_exempt",
              status: "running",
              profile: prof,
            };
          }
        } catch {
          /* ignore */
        }
      }
      if (agentSession) {
        await this.#closeSingleSession(id, agentSession, this.#agentSessions, {
          isShadowLane: true,
          forcePriority,
        });
      }
      if ((userSession?.alive && userSession.headless !== true) || this.isUserInteractiveSession(id)) {
        const runningProfile = profileService.setProfileStatus(id, "running");
        if (runningProfile) this.#emitSessionChange(id, runningProfile, "running");
        return {
          ok: true,
          skipped: agentSession ? undefined : "user_interactive_session",
          status: "running",
          profile: runningProfile,
        };
      }
      if (userSession?.alive && userSession.headless === true) {
        await this.#closeSingleSession(id, userSession, this.#sessions, {
          isShadowLane: false,
          forcePriority,
        });
      }
      const next = profileService.setProfileStatus(id, "closed", { reason: "profile_close" });
      this.#emitSessionChange(id, next, "profile_close");
      return { ok: true, status: "closed", profile: next };
    }

    // 2. Called by User UI: close User Headed session first; if no User Headed session is open, close Agent Shadow session.
    if (userSession) {
      await this.#closeSingleSession(id, userSession, this.#sessions, {
        isShadowLane: false,
        forcePriority: true,
      });
      if (this.#agentSessions.get(id)?.alive) {
        const runningProfile = profileService.setProfileStatus(id, "running");
        this.#emitSessionChange(id, runningProfile, "running");
        return { ok: true, status: "running", profile: runningProfile };
      }
    } else if (agentSession) {
      await this.#closeSingleSession(id, agentSession, this.#agentSessions, {
        isShadowLane: true,
        forcePriority: true,
      });
    }

    const next = profileService.setProfileStatus(id, "closed", { reason: "profile_close" });
    this.#emitSessionChange(id, next, "profile_close");
    return { ok: true, status: "closed", profile: next };
  }

  getContext(profileId, { preferAgent = false } = {}) {
    const id = String(profileId);
    if (preferAgent || isAgentSmokeLaunch()) {
      const agentSession = this.#agentSessions.get(id);
      if (agentSession?.alive) return agentSession.context;
    }
    const session = this.#sessions.get(id);
    if (session?.alive) return session.context;
    const agentFallback = this.#agentSessions.get(id);
    return agentFallback?.alive ? agentFallback.context : null;
  }

  getDebugPort(profileId) {
    const id = String(profileId);
    if (isAgentSmokeLaunch()) {
      const agentSession = this.#agentSessions.get(id);
      if (agentSession?.alive) return agentSession.debugPort || 0;
    }
    const session = this.#sessions.get(id);
    if (session?.alive && session.debugPort) return session.debugPort;
    const agentSession = this.#agentSessions.get(id);
    return agentSession?.alive ? (agentSession.debugPort || 0) : 0;
  }

  getActiveVpnCountry(profileId) {
    const id = String(profileId);
    const session = this.#sessions.get(id) || this.#agentSessions.get(id);
    return session?.alive ? String(session.vpnCountry || "") : "";
  }

  /**
   * Thông tin CDP để tool ngoài cắm vào (playwright.connect_over_cdp / puppeteer.connect).
   * Dual-Lane User Headed + Agent Headless Shadow Isolation:
   * - Khi caller là Agent (`preferAgent || isAgentSmokeLaunch()`) và User đang mở Profile ở chế độ Headed (`userSession.headless !== true`),
   *   TỰ ĐỘNG khởi tạo và trả về `debugPort` của nhánh Headless Shadow (`#agentSessions`, `%TEMP%/p0003-agent-shadow/<id>`)
   *   để Agent chạy song song 100% Headless, tuyệt đối KHÔNG mở tab hay chiếm chuột trên cửa sổ Headed của User.
   * @returns {Promise<{ ok: boolean, port?: number, endpoint?: string, webSocketDebuggerUrl?: string, reason?: string }>}
   */
  async getCdpInfo(profileId, { preferAgent = false } = {}) {
    const id = String(profileId);
    const isAgentCaller = Boolean(preferAgent || isAgentSmokeLaunch());
    let agentSession = this.#agentSessions.get(id);
    const userHeadedActive = Boolean(
      (this.#sessions.get(id)?.alive && this.#sessions.get(id)?.headless !== true) ||
        this.isUserInteractiveSession(id),
    );
    const userSession = this.#sessions.get(id);
    if (isAgentCaller && userHeadedActive && process.env.STEALTH_ALLOW_AGENT_ON_USER_HEADED !== "1") {
      if (process.env.STEALTH_FORCE_TEMP_SHADOW_DIR === "1" && !agentSession?.alive) {
        const baseProfile = profileService.getProfile(id) || userSession?.profile || { id, name: id };
        await this.launch({ ...baseProfile, id, headless: true, shadowLane: true }, { skipStartupUrl: true }).catch(
          () => null,
        );
        agentSession = this.#agentSessions.get(id);
      } else if (!agentSession?.alive) {
        this.enqueueDeferredAgentTask(id, { reason: "agent_cdp_while_user_headed" });
        return {
          ok: false,
          reason: "user_interactive_session",
          skipped: "user_interactive_session",
          headless: false,
        };
      }
    }
    const session = agentSession?.alive ? agentSession : userSession;
    if (!session?.alive) return { ok: false, reason: "not-running" };
    session.lastActivityAt = Date.now();
    const port = session.debugPort || 0;
    if (!port) return { ok: false, reason: "cdp-disabled" };
    try {
      const info = await waitForCdp(port);
      return {
        ok: true,
        port,
        endpoint: `http://127.0.0.1:${port}`,
        webSocketDebuggerUrl: info.webSocketDebuggerUrl,
        browser: info.Browser,
        shadowLane: Boolean(session.shadowLane),
        headless: Boolean(session.headless),
      };
    } catch (error) {
      return { ok: false, port, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  #scheduleMissingBadgeSweep() {
    scheduleMissingBadgeSweep(() =>
      this.listRunning()
        .filter((row) => !row.headless)
        .map((row) => ({
          userDataDir: row.userDataDir,
          label: formatProfileWindowLabel(profileService.getProfile(row.id) || { name: row.name, id: row.id }),
          code: extractProfileCode(row.name, row.id),
          browserPid: readSidecarPid(row.userDataDir)?.pid || 0,
          headless: row.headless,
        })),
    );
  }

  async #enforceRunningCap(keepProfile) {
    /* Standing order 2026-08-27: never auto-close headed user windows, even at 100 running. */
    if (!keepProfile || !launchMeta(keepProfile).headless) return;
    const keepId = String(keepProfile.id || "");
    let configuredMaxHeadless = 8;
    try {
      const { getMaxHeadlessSessions } = require("../lib/app-settings.cjs");
      configuredMaxHeadless = Math.min(12, Number(getMaxHeadlessSessions()) || 8);
    } catch {
      configuredMaxHeadless = Number(process.env.STEALTH_MAX_HEADLESS_SESSIONS) || 8;
    }
    const MAX_CONCURRENT_HEADLESS = Math.max(1, Math.min(20, Math.round(configuredMaxHeadless)));
    const MIN_EVICT_AGE_MS = 15_000;
    const now = Date.now();
    const isPidAlive = (pid) => {
      const n = Number(pid);
      if (!Number.isInteger(n) || n <= 0) return true;
      try {
        process.kill(n, 0);
        return true;
      } catch (err) {
        return err && err.code === "EPERM";
      }
    };
    const lockedCodes = new Set();
    const priorityLockedCodes = new Set();
    const priorityLockedIds = new Set();
    try {
      const candidateDirs = ["E:\\Dev\\Tool\\P0002-Social-Hub\\data"];
      for (const dataDir of candidateDirs) {
        for (const fileName of ["active-agent-locks.json", "priority-agent-locks.json"]) {
          try {
            const fp = path.join(dataDir, fileName);
            const parsed = readCachedJsonFile(fp);
            if (!parsed) continue;
            const locks = parsed && typeof parsed.locks === "object" && parsed.locks ? parsed.locks : {};
            for (const [c, val] of Object.entries(locks)) {
              const exp = typeof val === "object" && val ? Number(val.expiresAt || 0) : Number(val || 0);
              const ownerPid = typeof val === "object" && val ? Number(val.pid || val.ownerPid || 0) : 0;
              if (exp > now && (!ownerPid || isPidAlive(ownerPid))) {
                const normCode = String(c).trim().padStart(4, "0");
                lockedCodes.add(normCode);
                if (fileName === "priority-agent-locks.json") {
                  priorityLockedCodes.add(normCode);
                  if (val && typeof val === "object" && val.stealthId) {
                    priorityLockedIds.add(String(val.stealthId));
                  }
                }
              }
            }
          } catch {
            /* ignore single corrupted lock file */
          }
        }
      }
    } catch {
      /* ignore */
    }
    // 1. Per-Agent / Per-Daemon Concurrency Ceiling (default: max 3 profiles per Agent/Daemon caller)
    const MAX_PER_CALLER = Math.max(
      1,
      Math.min(20, Number(process.env.STEALTH_MAX_HEADLESS_PER_CALLER) || 3),
    );
    const callerId = resolveSessionCallerId(keepProfile);
    const sameCallerUnlocked = [];
    const sameCallerLocked = [];
    for (const [id, session] of this.#agentSessions.entries()) {
      if (!session?.alive || id === keepId) continue;
      if (resolveSessionCallerId(session) !== callerId) continue;
      const codeStr = String(session.profileCode || "").slice(0, 4).padStart(4, "0");
      const item = { id, lastActive: Number(session.lastActivityAt || session.launchedAt || 0), agentOnly: true };
      if (
        lockedCodes.has(codeStr) ||
        priorityLockedCodes.has(codeStr) ||
        priorityLockedIds.has(id) ||
        isExemptActiveChatOrTaskSession(session)
      ) {
        sameCallerLocked.push(item);
      } else {
        sameCallerUnlocked.push(item);
      }
    }
    for (const [id, session] of this.#sessions.entries()) {
      if (!session?.alive || id === keepId || session.headless !== true) continue;
      if (resolveSessionCallerId(session) !== callerId) continue;
      const codeStr = String(session.profileCode || "").slice(0, 4).padStart(4, "0");
      const codeNum = Number(codeStr);
      if (PROTECTED_USER_PROFILE_CODES.has(codeStr) || (Number.isInteger(codeNum) && codeNum >= 8000 && codeNum < 9000)) {
        continue;
      }
      if (session.userDataDir && findLiveHeadedBrowserPidNative(session.userDataDir) > 0) {
        session.headless = false;
        continue;
      }
      const item = { id, lastActive: Number(session.lastActivityAt || session.launchedAt || 0), agentOnly: false };
      if (
        lockedCodes.has(codeStr) ||
        priorityLockedCodes.has(codeStr) ||
        priorityLockedIds.has(id) ||
        isExemptActiveChatOrTaskSession(session)
      ) {
        sameCallerLocked.push(item);
      } else {
        sameCallerUnlocked.push(item);
      }
    }
    sameCallerUnlocked.sort((a, b) => a.lastActive - b.lastActive);
    sameCallerLocked.sort((a, b) => a.lastActive - b.lastActive);
    const sameCallerCandidates = [...sameCallerUnlocked, ...sameCallerLocked];
    if (sameCallerCandidates.length >= MAX_PER_CALLER) {
      const callerEvict = sameCallerCandidates.slice(0, sameCallerCandidates.length - MAX_PER_CALLER + 1);
      for (const item of callerEvict) {
        await this.close(item.id, {
          agentOnly: item.agentOnly,
          ignoreIfUserInteractive: true,
          force: true,
          forcePriority: true,
        }).catch(() => undefined);
      }
    }

    // 2. Global Headless Concurrency Ceiling across all callers
    const headlessSessions = [];
    const lockedHeadlessSessions = [];
    for (const [id, session] of this.#agentSessions.entries()) {
      if (!session?.alive || id === keepId) continue;
      if (now - Number(session.launchedAt || 0) < MIN_EVICT_AGE_MS) continue;
      const codeStr = String(session.profileCode || "").slice(0, 4).padStart(4, "0");
      if (priorityLockedCodes.has(codeStr) || priorityLockedIds.has(id)) continue;
      const codeNum = Number(codeStr);
      if (Number.isInteger(codeNum) && codeNum >= 9000 && codeNum <= 9999) continue;
      const item = { id, lastActive: Number(session.lastActivityAt || session.launchedAt || 0), agentOnly: true };
      if (lockedCodes.has(codeStr) || isExemptActiveChatOrTaskSession(session)) lockedHeadlessSessions.push(item);
      else headlessSessions.push(item);
    }
    for (const [id, session] of this.#sessions.entries()) {
      if (!session?.alive || id === keepId || session.headless !== true) continue;
      if (now - Number(session.launchedAt || 0) < MIN_EVICT_AGE_MS) continue;
      const codeStr = String(session.profileCode || "").slice(0, 4).padStart(4, "0");
      if (priorityLockedCodes.has(codeStr) || priorityLockedIds.has(id)) continue;
      const codeNum = Number(codeStr);
      if (
        PROTECTED_USER_PROFILE_CODES.has(codeStr) ||
        (Number.isInteger(codeNum) && codeNum >= 8000 && codeNum <= 9999)
      ) {
        continue;
      }
      if (session.userDataDir && findLiveHeadedBrowserPidNative(session.userDataDir) > 0) {
        session.headless = false;
        continue;
      }
      const item = { id, lastActive: Number(session.lastActivityAt || session.launchedAt || 0), agentOnly: false };
      if (lockedCodes.has(codeStr) || isExemptActiveChatOrTaskSession(session)) lockedHeadlessSessions.push(item);
      else headlessSessions.push(item);
    }
    headlessSessions.sort((a, b) => a.lastActive - b.lastActive);
    lockedHeadlessSessions.sort((a, b) => a.lastActive - b.lastActive);
    const allEvictCandidates = [...headlessSessions, ...lockedHeadlessSessions];
    if (allEvictCandidates.length < MAX_CONCURRENT_HEADLESS) return;
    const toEvict = allEvictCandidates.slice(0, allEvictCandidates.length - MAX_CONCURRENT_HEADLESS + 1);
    for (const item of toEvict) {
      await this.close(item.id, { agentOnly: item.agentOnly, ignoreIfUserInteractive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  async closeProfile(profileId, opts = {}) {
    return this.close(profileId, { ignoreIfUserInteractive: true, ...opts });
  }

  adoptLiveSessionsFrom(prevSm) {
    if (!prevSm || prevSm === this || typeof prevSm.listRunning !== "function") return 0;
    let adopted = 0;
    try {
      const rows = prevSm.listRunning() || [];
      for (const r of Array.isArray(rows) ? rows : []) {
        const id = String(r?.id || r?.profileId || "").trim();
        if (!id) continue;
        const shadowLane = Boolean(r.shadowLane);
        const targetMap = shadowLane ? this.#agentSessions : this.#sessions;
        if (targetMap.has(id)) continue;
        let ctx = null;
        try {
          ctx = prevSm.getContext?.(id, { preferAgent: shadowLane }) || null;
        } catch {
          ctx = null;
        }
        const prof = profileService.getProfile(id) || { id, name: r.name || id };
        const profileCode = extractProfileCode(prof.name || r.name || "", id);
        const userDataDir = String(r.userDataDir || profileDataDir(this.#userDataRoot, id) || "");
        const liveHeadedPid = !shadowLane && userDataDir ? findLiveHeadedBrowserPidNative(userDataDir) : 0;
        const headless = liveHeadedPid > 0 ? false : Boolean(r.headless);
        const focusOnly = !ctx;
        targetMap.set(id, {
          context: ctx,
          userDataDir,
          primaryUserDataDir: profileDataDir(this.#userDataRoot, id) || userDataDir,
          alive: true,
          debugPort: Number(r.debugPort) || 0,
          profile: prof,
          profileCode,
          focusOnly,
          headless,
          shadowLane,
          callerId: headless ? String(r.callerId || "agent:inline") : "user:headed",
          vpnCountry: String(r.vpnCountry || ""),
          launchedAt: Number(r.launchedAt || Date.now()),
          lastActivityAt: Number(r.lastActivityAt || r.launchedAt || Date.now()),
        });
        if (ctx) {
          this.#bindSessionLifecycle(id, ctx, prof, { shadowLane });
        } else if (userDataDir) {
          this.#bindFocusOnlyLifecycle(id, userDataDir);
        }
        adopted += 1;
      }
      prevSm.close = async (pid, opts) => this.close(pid, opts);
      prevSm.closeProfile = async (pid, opts) => this.closeProfile(pid, opts);
    } catch {
      /* ignore migration errors */
    }
    return adopted;
  }

  listRunning() {
    const rows = [];
    for (const [id, session] of this.#sessions.entries()) {
      if (!session.alive) continue;
      const name = session.profile?.name || session.profileCode || id;
      const supportChatProtected = Boolean(session.headless && isSupportChatProtectedSession(session));
      rows.push({
        id,
        profileId: id,
        name,
        userDataDir: session.userDataDir,
        debugPort: session.debugPort || 0,
        headless: Boolean(session.headless),
        shadowLane: false,
        callerId: session.callerId || undefined,
        supportChatProtected: supportChatProtected || undefined,
        launchedAt: session.launchedAt || 0,
        lastActivityAt: session.lastActivityAt || session.launchedAt || 0,
        startedAt: session.launchedAt ? new Date(session.launchedAt).toISOString() : undefined,
        vpnCountry: session.vpnCountry || undefined,
      });
    }
    for (const [id, session] of this.#agentSessions.entries()) {
      if (!session.alive) continue;
      const name = session.profile?.name || session.profileCode || id;
      const supportChatProtected = Boolean(isSupportChatProtectedSession(session));
      rows.push({
        id,
        profileId: id,
        name,
        userDataDir: session.userDataDir,
        debugPort: session.debugPort || 0,
        headless: true,
        shadowLane: true,
        callerId: session.callerId || undefined,
        supportChatProtected: supportChatProtected || undefined,
        launchedAt: session.launchedAt || 0,
        lastActivityAt: session.lastActivityAt || session.launchedAt || 0,
        startedAt: session.launchedAt ? new Date(session.launchedAt).toISOString() : undefined,
        vpnCountry: session.vpnCountry || undefined,
      });
    }
    return rows;
  }

  /**
   * Minimize ĐÚNG cửa sổ của profile này qua CDP (windowState: minimized).
   * Thay cho hack PowerShell "minimize mọi cửa sổ Chrome" — vốn đụng cả Chrome cá nhân.
   * Cross-platform, best-effort. Dùng khi launch qua API để không cướp focus.
   */
  async minimizeProfile(profileId) {
    const session = this.#sessions.get(String(profileId));
    if (!session?.alive) return { ok: false, reason: "not-running" };
    if (session.focusOnly) return { ok: false, reason: "focus-only" };
    const page = session.context.pages().filter((p) => !p.isClosed())[0];
    if (!page) return { ok: false, reason: "no-page" };
    try {
      const cdp = await session.context.newCDPSession(page);
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
      await cdp.detach().catch(() => undefined);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async focusProfile(profileId) {
    const id = String(profileId);
    const session = this.#sessions.get(id);
    if (!session?.alive) return { ok: false, reason: "not-running" };
    if (session.headless) return { ok: true, skipped: "headless" };

    if (session.focusOnly) {
      if (isAgentSmokeLaunch()) return { ok: true };
      const focused = await focusProfileBrowserWindow(session.userDataDir);
      return focused.ok ? { ok: true } : { ok: false, reason: focused.reason || "focus-failed" };
    }

    const pages = session.context.pages().filter((page) => !page.isClosed());
    const page = pages[0];
    if (!page) return { ok: false, reason: "no-page" };

    try {
      await page.bringToFront();
      const cdp = await session.context.newCDPSession(page);
      const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
      let wa = null;
      try {
        const { resolveTargetDisplayWorkArea } = require("../lib/app-settings.cjs");
        wa = resolveTargetDisplayWorkArea(session.profile?.targetMonitor)?.workArea || null;
      } catch {
        wa = null;
      }
      const wantMaximized = String(session.profile?.windowMode || "host-maximized").toLowerCase() === "host-maximized";
      if (wa && Number.isFinite(wa.x) && Number.isFinite(wa.y) && Number.isFinite(wa.width) && Number.isFinite(wa.height)) {
        const curLeft = Number(bounds?.left);
        const curTop = Number(bounds?.top);
        const onTarget =
          Number.isFinite(curLeft) &&
          Number.isFinite(curTop) &&
          curLeft >= wa.x - 16 &&
          curLeft < wa.x + wa.width &&
          curTop >= wa.y - 16 &&
          curTop < wa.y + wa.height;
        if (!onTarget || bounds?.windowState === "minimized") {
          if (bounds?.windowState === "maximized" || bounds?.windowState === "fullscreen" || bounds?.windowState === "minimized") {
            await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } }).catch(() => undefined);
          }
          const padX = Math.min(48, Math.max(16, Math.round(wa.width * 0.03)));
          const padY = Math.min(36, Math.max(16, Math.round(wa.height * 0.03)));
          await cdp
            .send("Browser.setWindowBounds", {
              windowId,
              bounds: {
                left: wa.x + padX,
                top: wa.y + padY,
                width: Math.max(800, Math.min(1440, wa.width - padX * 2)),
                height: Math.max(600, Math.min(900, wa.height - padY * 2)),
                windowState: "normal",
              },
            })
            .catch(() => undefined);
        }
      } else if (bounds?.windowState === "minimized") {
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } }).catch(() => undefined);
      }
      if (wantMaximized && bounds?.windowState !== "maximized") {
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "maximized" } }).catch(() => undefined);
      }
      await cdp.detach().catch(() => undefined);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async closeAll({ headlessOnly = false } = {}) {
    const onlyHeadless = Boolean(headlessOnly || isAgentSmokeLaunch());
    const agentIds = [...this.#agentSessions.keys()];
    for (const id of agentIds) {
      await this.close(id, { agentOnly: true, ignoreIfUserInteractive: true });
    }
    const ids = [...this.#sessions.keys()];
    for (const id of ids) {
      const session = this.#sessions.get(id);
      if (onlyHeadless && session?.alive && session.headless !== true) continue;
      await this.close(id, { ignoreIfUserInteractive: onlyHeadless });
    }
  }

  /** Force-release Chrome storage for delete/replace — kill orphan, purge userDataDir. */
  async releaseProfileStorage(profileId) {
    const id = String(profileId);
    const userDataDir = profileDataDir(this.#userDataRoot, id);
    if (this.#agentSessions.has(id)) {
      await this.#dropAgentSession(id);
    }
    const session = this.#sessions.get(id);
    if (session) {
      await this.#dropSession(id);
    } else {
      await killOrphanProfileBrowser(userDataDir);
      removeStaleProfileLocks(userDataDir);
    }
    const purgeResult = await purgeProfileUserDataDir(userDataDir);
    const next = profileService.setProfileStatus(id, "closed", { reason: "storage-released" });
    this.#emitSessionChange(id, next, "storage-released");
    return { ok: true, userDataDir, storagePurged: purgeResult.purged };
  }
}

module.exports = {
  SessionManager,
  removeStaleProfileLocks,
  isLaunchLockError,
  isContextAlive,
  prepareProfileForLaunch,
  shouldSkipOrphanProbe,
  isExemptActiveChatOrTaskSession,
  isReapableHeadlessCode,
  HEADLESS_ACTIVE_TASK_IDLE_TTL_MS,
};
