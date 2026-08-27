const path = require("node:path");
const fs = require("node:fs");
const { closeContext, profileDataDir, openProfile } = require("./cloak-browser-engine.cjs");
const profileService = require("../db/profile-service.cjs");
const { navigateStartupUrl, awaitBrowserReady, stabilizePrimaryPage } = require("../automation/navigate-startup.cjs");
const { getFreePort, waitForCdp } = require("../lib/net-port.cjs");
const { extractProfileCode } = require("../lib/profile-code.cjs");
const { applyProfileWindowTitle, formatProfileWindowLabel, scheduleProfileTaskbarBadgeApply, scheduleMissingBadgeSweep } = require("../lib/profile-window-title.cjs");
const {
  focusProfileBrowserWindow,
  hasProfileBrowserProcess,
  killOrphanProfileBrowser,
  listProfileBrowserPids,
  PROFILE_LOCK_FILES,
  readDevToolsActivePort,
} = require("../lib/profile-browser-orphan.cjs");
const { purgeLegacyProfileIdentityChrome } = require("../lib/profile-chrome-cleanup.cjs");
const { markProfileChromeCleanExit } = require("../lib/profile-chrome-session.cjs");
const { repairProfileUserDataDir, purgeProfileUserDataDir, removeStaleProfileLocks, writeSidecarPid, readSidecarPid, removeSidecarPid, waitForProfileUnlock } = require("../lib/profile-user-data-repair.cjs");
const { bindOmniboxSearchGuard } = require("../lib/omnibox-search-guard.cjs");
const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");

function launchMeta(profile) {
  const agentSmoke = isAgentSmokeLaunch();
  return {
    agentSmoke,
    headless: profile.headless === true || agentSmoke,
  };
}
const { isGoogleSessionUrl } = require("../lib/google-session-detect.cjs");
const { isMicrosoftSessionUrl } = require("../lib/microsoft-session-detect.cjs");
const { captureAndQueueStealthSnapshotSafe } = require("../lib/stealth-account-sync.cjs");

/** CDP passthrough bật mặc định; tắt bằng STEALTH_CDP_ENABLE=0. */
function cdpEnabled() {
  return String(process.env.STEALTH_CDP_ENABLE || "1") !== "0";
}

const SESSION_WATCHDOG_MS = 8000;
/** Ignore transient empty pages / watchdog during startup navigation. */
const LAUNCH_GRACE_MS = 45_000;
const STEALTH_NAV_CAPTURE_DELAY_MS = 1200;
const STEALTH_NAV_CAPTURE_DEBOUNCE_MS = 6000;

/** Skip expensive WMI orphan probe when profile dir is clean (typical Run path). */
function shouldSkipOrphanProbe(userDataDir, priorStatus) {
  if (priorStatus === "running" || priorStatus === "opening") return false;
  if (profileDirHasLock(userDataDir)) return false;
  if (readDevToolsActivePort(userDataDir) > 0) return false;
  return true;
}

function profileDirHasLock(userDataDir) {
  return PROFILE_LOCK_FILES.some((name) => fs.existsSync(path.join(userDataDir, name)));
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
  /** @type {Map<string, { context: import('playwright-core').BrowserContext, userDataDir: string, alive: boolean, watchdog?: NodeJS.Timeout, startupNavigation?: Promise<void>, launchedAt?: number }>} */
  #sessions = new Map();
  #userDataRoot = "";
  /** Profiles mid-launch — reconcile must not mark closed while spawn is in flight. */
  #launchingIds = new Set();
  /** @type {((profileId: string, profile: object, event: string) => void) | null} */
  #onSessionChange = null;

  setUserDataRoot(root) {
    this.#userDataRoot = root;
  }

  setOnSessionChange(handler) {
    this.#onSessionChange = handler ?? null;
  }

  isRunning(profileId) {
    const id = String(profileId);
    if (this.#launchingIds.has(id)) return true;
    const session = this.#sessions.get(id);
    return Boolean(session?.alive);
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
  }

  #scheduleStealthCapture(id, context, profile, source, { delayMs = STEALTH_NAV_CAPTURE_DELAY_MS, force = false } = {}) {
    const session = this.#sessions.get(id);
    if (!session || session.context !== context || session.focusOnly || !session.alive) return;
    const now = Date.now();
    if (!force && session.lastStealthCaptureAt && now - session.lastStealthCaptureAt < STEALTH_NAV_CAPTURE_DEBOUNCE_MS) {
      return;
    }
    if (session.stealthCaptureTimer) clearTimeout(session.stealthCaptureTimer);
    session.stealthCaptureTimer = setTimeout(() => {
      const latest = this.#sessions.get(id);
      if (!latest || latest.context !== context || latest.focusOnly || !latest.alive) return;
      void (async () => {
        try {
          await captureAndQueueStealthSnapshotSafe(context, profile, { source });
          latest.lastStealthCaptureAt = Date.now();
        } catch (error) {
          console.warn("[stealth-sync] nav capture:", error instanceof Error ? error.message : error);
        }
      })();
    }, delayMs);
    if (typeof session.stealthCaptureTimer.unref === "function") {
      session.stealthCaptureTimer.unref();
    }
  }

  /** Boot-time — kill orphan Chrome + reset stale running/opening rows. */
  async reconcileOrphansOnStartup() {
    const root = this.#userDataRoot;
    if (!root) return { cleaned: 0 };
    let cleaned = 0;
    const { resolveProfilesRoot } = require("../lib/profiles-location.cjs");
    const profilesDir = resolveProfilesRoot(root);

    for (const row of profileService.listActiveProfileIds()) {
      if (this.isRunning(row.id)) continue;
      const userDataDir = profileDataDir(root, row.id);
      if (!profileDirHasLock(userDataDir) && !readSidecarPid(userDataDir)?.pid) continue;
      await killOrphanProfileBrowser(userDataDir);
      removeStaleProfileLocks(userDataDir);
      const next = profileService.setProfileStatus(row.id, "closed");
      this.#emitSessionChange(row.id, next, "startup-reconciled");
      cleaned += 1;
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
        const next = profileService.setProfileStatus(id, "closed");
        this.#emitSessionChange(id, next, "startup-reconciled");
        cleaned += 1;
      }
    }

    return { cleaned };
  }

  #registerPlaywrightSession(id, profile, opened, { skipStartupUrl = false } = {}) {
    bindOmniboxSearchGuard(opened.context);
    const profileCode = extractProfileCode(profile.name, profile.id);
    const launchUrl = profileService.resolveProfileLaunchUrl(profile.startupUrl);
    let browserPid = 0;
    try {
      browserPid = opened.context.browser()?.process()?.pid || 0;
    } catch { /* persistent context may not expose process */ }

    // Sidecar before title/badge so apply script can skip WMI via stealth-pid.json.
    if (browserPid > 0) {
      writeSidecarPid(opened.userDataDir, {
        pid: browserPid,
        debugPort: opened.debugPort || 0,
      });
    } else {
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
        { debugPort: opened.debugPort || 0 },
      );
    }

    // Title install before startup nav so about:blank / first paint show code · name
    // (taskbar hover / Alt-Tab). Cheap: one init script + evaluate existing pages.
    // Pass browserPid so taskbar badge skips Get-CimInstance (~2–3s).
    const titleReady = applyProfileWindowTitle(opened.context, profile, {
      userDataDir: opened.userDataDir,
      browserPid,
      headless: launchMeta(profile).headless,
    }).catch(() => undefined);
    const startupNavigation = Promise.resolve(titleReady)
      .then(() =>
        skipStartupUrl
          ? awaitBrowserReady(opened.context)
          : navigateStartupUrl(opened.context, launchUrl),
      )
      .catch(() => undefined);

    const launchedAt = Date.now();
    this.#sessions.set(id, {
      context: opened.context,
      userDataDir: opened.userDataDir,
      alive: true,
      debugPort: opened.debugPort || 0,
      profile,
      profileCode,
      focusOnly: false,
      headless: launchMeta(profile).headless,
      startupNavigation,
      launchedAt,
    });
    this.#bindSessionLifecycle(id, opened.context, profile);

    const profileLabel = formatProfileWindowLabel(profile);
    const badgeHeadless = launchMeta(profile).headless;
    const { ensureBadgeIcoFast } = require("../lib/profile-taskbar-native.cjs");
    void ensureBadgeIcoFast(profileCode).catch(() => undefined);

    const scheduleOpenBadge = (pidHint = 0) => {
      scheduleProfileTaskbarBadgeApply(opened.userDataDir, profileLabel, profileCode, {
        browserPid: pidHint,
        headless: badgeHeadless,
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
          headless: badgeHeadless,
          force: true,
          isReinforce: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (isContextAlive(opened.context)) {
          await captureAndQueueStealthSnapshotSafe(opened.context, profile, { source: "profile_open" });
          const session = this.#sessions.get(id);
          if (session) session.lastStealthCaptureAt = Date.now();
        }
      } catch (error) {
        console.warn("[stealth-sync] open capture:", error instanceof Error ? error.message : error);
      }
    })();

    profileService.touchLastOpened(id);
    const running = profileService.setProfileStatus(id, "running");
    this.#emitSessionChange(id, running, "running");
    return {
      ok: true,
      status: "running",
      profile: running,
      userDataDir: opened.userDataDir,
      debugPort: opened.debugPort || 0,
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
        const next = profileService.setProfileStatus(id, "closed");
        this.#emitSessionChange(id, next, "closed");
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

    if (port > 0) {
      try {
        await waitForCdp(port, { attempts: 8, intervalMs: 120 });
        const { chromium } = await import("playwright-core");
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
    if (isAgentSmokeLaunch()) {
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
  reconcileActiveStatuses() {
    let changed = false;
    // (a) Session đang sống nhưng DB chưa đánh dấu running → set running.
    for (const [id, session] of this.#sessions.entries()) {
      if (!session.alive) continue;
      const profile = profileService.getProfile(id);
      if (profile && profile.status !== "running") {
        const next = profileService.setProfileStatus(id, "running");
        this.#emitSessionChange(id, next, "running");
        changed = true;
      }
    }
    // (b) DB đánh dấu active nhưng không còn session sống → set closed (dọn trạng thái treo).
    for (const row of profileService.listActiveProfileIds()) {
      if (row.status === "opening") continue;
      if (!this.isRunning(row.id)) {
        const next = profileService.setProfileStatus(row.id, "closed");
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

  #bindSessionLifecycle(id, context, profile) {
    let finalized = false;
    const finalize = (reason = "closed") => {
      if (finalized) return;
      finalized = true;
      const session = this.#sessions.get(id);
      if (!session || session.context !== context) return;

      void (async () => {
        try {
          if (!session.focusOnly && isContextAlive(context)) {
            await captureAndQueueStealthSnapshotSafe(context, profile, { source: reason });
          }
        } catch (error) {
          console.warn("[stealth-sync] finalize capture:", error instanceof Error ? error.message : error);
        } finally {
          if (session.watchdog) clearInterval(session.watchdog);
          if (session.stealthCaptureTimer) clearTimeout(session.stealthCaptureTimer);
          session.alive = false;
          this.#sessions.delete(id);
          try {
            const next = profileService.setProfileStatus(id, "closed");
            if (next) this.#emitSessionChange(id, next, reason);
          } catch (error) {
            console.warn("[session] finalize status:", error instanceof Error ? error.message : error);
          }
        }
      })();
    };

    const maybeFinalizeWhenEmpty = () => {
      setTimeout(() => {
        void (async () => {
          const session = this.#sessions.get(id);
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

    const bindPageClose = (page) => {
      page.once("close", maybeFinalizeWhenEmpty);
      const maybeCapture = (frame = null) => {
        try {
          if (frame && frame !== page.mainFrame()) return;
          const session = this.#sessions.get(id);
          if (!session || session.context !== context || !session.alive) return;
          const url = page.url();
          if (!isGoogleSessionUrl(url) && !isMicrosoftSessionUrl(url)) return;
          const navSource = isMicrosoftSessionUrl(url) ? "microsoft_nav" : "google_nav";
          this.#scheduleStealthCapture(id, context, profile, navSource);
        } catch {
          // page may already be closing
        }
      };
      // Chromium resets WM_SETICON on title/nav — re-stamp badge (debounced).
      let badgeNavTimer = null;
      const maybeRestampBadge = () => {
        try {
          const session = this.#sessions.get(id);
          if (!session?.alive || session.focusOnly) return;
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
      page.on("framenavigated", maybeCapture);
      page.on("load", () => maybeCapture());
      page.on("framenavigated", maybeRestampBadge);
      page.on("load", maybeRestampBadge);
      page.on("domcontentloaded", maybeRestampBadge);
    };

    context.on("close", () => finalize("context-closed"));

    for (const page of context.pages()) {
      bindPageClose(page);
    }
    context.on("page", bindPageClose);

    try {
      const browser = context.browser();
      if (browser) {
        browser.on("disconnected", () => finalize("disconnected"));
      }
    } catch {
      // persistent context may not expose browser()
    }

    const watchdog = setInterval(() => {
      const session = this.#sessions.get(id);
      if (!session || session.context !== context || !session.alive) {
        clearInterval(watchdog);
        return;
      }
      if (this.#inLaunchGrace(session)) return;
      if (isContextAlive(context)) return;
      void hasProfileBrowserProcess(session.userDataDir).then((alive) => {
        if (!alive) finalize("watchdog");
      }).catch(() => finalize("watchdog"));
    }, SESSION_WATCHDOG_MS);

    const session = this.#sessions.get(id);
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
      await killOrphanProfileBrowser(session.userDataDir);
    } else {
      await closeContext(session.context);
    }
    removeStaleProfileLocks(session.userDataDir);
    removeSidecarPid(session.userDataDir);
  }

  async awaitLaunchNavigation(profileId, { settle = true } = {}) {
    const session = this.#sessions.get(String(profileId));
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
      const { chromium } = await import("playwright-core");
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

  /**
   * Prepare a live Playwright context for workflow Launch (skip profile startup URL).
   * Warm sessions focus immediately; focus-only sessions upgrade via CDP when possible.
   */
  async ensureAutomationContext(profile) {
    const id = String(profile.id);
    const userDataDir = profileDataDir(this.#userDataRoot, id);

    if (!this.isRunning(id)) {
      await this.launch(profile, { skipStartupUrl: true });
    } else {
      const session = this.#sessions.get(id);
      if (!session?.context || session.focusOnly) {
        const upgraded = await this.#upgradeToPlaywrightContext(id, profile, userDataDir);
        if (!upgraded) {
          const attached = await this.#tryAttachOrFocusOrphan(profile, userDataDir, { skipStartupUrl: true });
          if (!attached || !this.getContext(id)) {
            throw new Error("Unable to obtain browser context for workflow.");
          }
        }
      }
      await this.focusProfile(id);
    }

    await this.awaitLaunchNavigation(id, { settle: false });
    const context = this.getContext(id);
    if (!context) throw new Error("Unable to obtain browser context.");
    return context;
  }

  async launch(profile, { skipStartupUrl = false } = {}) {
    const id = String(profile.id);
    this.#launchingIds.add(id);
    try {
    const existing = this.#sessions.get(id);
    if (existing?.alive) {
      if (existing.context) {
        await this.focusProfile(id);
        scheduleProfileTaskbarBadgeApply(
          existing.userDataDir,
          formatProfileWindowLabel(profile),
          extractProfileCode(profile.name, profile.id),
          {
            browserPid: readSidecarPid(existing.userDataDir)?.pid || 0,
            headless: existing.headless ?? launchMeta(profile).headless,
            force: true,
          },
        );
        profileService.touchLastOpened(id);
        const next = profileService.setProfileStatus(id, "running");
        return { ok: true, status: "running", profile: next, focused: true, ...launchMeta(profile) };
      }
      if (existing.focusOnly) {
        if (!isAgentSmokeLaunch()) {
          await focusProfileBrowserWindow(existing.userDataDir);
        }
        scheduleProfileTaskbarBadgeApply(
          existing.userDataDir,
          formatProfileWindowLabel(profile),
          extractProfileCode(profile.name, profile.id),
          {
            browserPid: readSidecarPid(existing.userDataDir)?.pid || 0,
            headless: existing.headless ?? launchMeta(profile).headless,
            force: true,
          },
        );
        profileService.touchLastOpened(id);
        const next = profileService.setProfileStatus(id, "running");
        return { ok: true, status: "running", profile: next, focused: true, ...launchMeta(profile) };
      }
    }
    if (existing) {
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
    if (attached) return attached;

    await this.#enforceRunningCap(profile);

    // Live orphan found (often Chrome App/PWA on AppData junction path) but attach failed —
    // must repair before first launch or ProcessSingleton Error 32 aborts immediately.
    if (prep?.live || profileDirHasLock(userDataDir)) {
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

  async close(profileId) {
    const id = String(profileId);
    const session = this.#sessions.get(id);
    if (session) {
      if (session.watchdog) clearInterval(session.watchdog);
      session.alive = false;
      this.#sessions.delete(id);
      if (!session.focusOnly && session.context) {
        const profile = profileService.getProfile(id) || session.profile;
        if (profile) {
          await captureAndQueueStealthSnapshotSafe(session.context, profile, { source: "profile_close" });
          session.lastStealthCaptureAt = Date.now();
        }
      }
      if (session.stealthCaptureTimer) clearTimeout(session.stealthCaptureTimer);
      if (session.focusOnly) {
        await killOrphanProfileBrowser(session.userDataDir);
      } else {
        await closeContext(session.context);
        // PWA / Chrome App children (--app-id) can survive Playwright close and keep
        // ProcessSingleton on the AppData junction path — sweep before UI says closed.
        await killOrphanProfileBrowser(session.userDataDir);
      }
      removeStaleProfileLocks(session.userDataDir);
      removeSidecarPid(session.userDataDir);
      await waitForProfileUnlock(session.userDataDir);
    }
    const next = profileService.setProfileStatus(id, "closed");
    this.#emitSessionChange(id, next, "closed");
    return { ok: true, status: "closed", profile: next };
  }

  getContext(profileId) {
    const session = this.#sessions.get(String(profileId));
    return session?.alive ? session.context : null;
  }

  getDebugPort(profileId) {
    const session = this.#sessions.get(String(profileId));
    return session?.alive ? (session.debugPort || 0) : 0;
  }

  /**
   * Thông tin CDP để tool ngoài cắm vào (playwright.connect_over_cdp / puppeteer.connect).
   * @returns {Promise<{ ok: boolean, port?: number, endpoint?: string, webSocketDebuggerUrl?: string, reason?: string }>}
   */
  async getCdpInfo(profileId) {
    const session = this.#sessions.get(String(profileId));
    if (!session?.alive) return { ok: false, reason: "not-running" };
    const port = session.debugPort || 0;
    if (!port) return { ok: false, reason: "cdp-disabled" };
    try {
      const info = await waitForCdp(port);
      return {
        ok: true,
        port,
        endpoint: `http://127.0.0.1:${port}`,
        webSocketDebuggerUrl: info.webSocketDebuggerUrl,
        browser: info.Browser
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

  async #enforceRunningCap(_keepProfile) {
    /* Standing order 2026-08-27: never auto-close, even at 100 running. */
  }

  listRunning() {
    const rows = [];
    for (const [id, session] of this.#sessions.entries()) {
      if (!session.alive) continue;
      const profile = profileService.getProfile(id);
      rows.push({
        id,
        name: profile?.name || id,
        userDataDir: session.userDataDir,
        debugPort: session.debugPort || 0,
        headless: Boolean(session.headless),
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
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "normal" }
      });
      await cdp.detach().catch(() => undefined);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async closeAll() {
    const ids = [...this.#sessions.keys()];
    for (const id of ids) {
      await this.close(id);
    }
  }

  /** Force-release Chrome storage for delete/replace — kill orphan, purge userDataDir. */
  async forceStealthCapture(profile, { source = "workflow_done" } = {}) {
    const id = String(profile?.id || "");
    if (!id) return { ok: false, reason: "missing profile" };
    const context = this.getContext(id);
    if (!context) return { ok: false, reason: "no live context" };
    const result = await captureAndQueueStealthSnapshotSafe(context, profile, { source });
    const session = this.#sessions.get(id);
    if (session) session.lastStealthCaptureAt = Date.now();
    return result;
  }

  async releaseProfileStorage(profileId) {
    const id = String(profileId);
    const userDataDir = profileDataDir(this.#userDataRoot, id);
    const session = this.#sessions.get(id);
    if (session) {
      await this.#dropSession(id);
    } else {
      await killOrphanProfileBrowser(userDataDir);
      removeStaleProfileLocks(userDataDir);
    }
    const purgeResult = await purgeProfileUserDataDir(userDataDir);
    const next = profileService.setProfileStatus(id, "closed");
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
};
