const path = require("node:path");
const fs = require("node:fs");
const { closeContext, profileDataDir, openProfile } = require("./cloak-browser-engine.cjs");
const profileService = require("../db/profile-service.cjs");
const { navigateStartupUrl, awaitBrowserReady, stabilizePrimaryPage } = require("../automation/navigate-startup.cjs");
const { getFreePort, waitForCdp } = require("../lib/net-port.cjs");
const { extractProfileCode } = require("../lib/profile-identity.cjs");
const {
  focusProfileBrowserWindow,
  hasProfileBrowserProcess,
  killOrphanProfileBrowser,
  readDevToolsActivePort,
} = require("../lib/profile-browser-orphan.cjs");
const { purgeLegacyProfileIdentityChrome } = require("../lib/profile-chrome-cleanup.cjs");
const { markProfileChromeCleanExit } = require("../lib/profile-chrome-session.cjs");
const { repairProfileUserDataDir, purgeProfileUserDataDir, removeStaleProfileLocks } = require("../lib/profile-user-data-repair.cjs");
const { bindOmniboxSearchGuard } = require("../lib/omnibox-search-guard.cjs");

/** CDP passthrough bật mặc định; tắt bằng STEALTH_CDP_ENABLE=0. */
function cdpEnabled() {
  return String(process.env.STEALTH_CDP_ENABLE || "1") !== "0";
}

const PROFILE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "lockfile"];
const SESSION_WATCHDOG_MS = 8000;

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
  if (aggressive || profileDirHasLock(userDataDir)) {
    return repairProfileUserDataDir(userDataDir);
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
  /** @type {Map<string, { context: import('playwright-core').BrowserContext, userDataDir: string, alive: boolean, watchdog?: NodeJS.Timeout, startupNavigation?: Promise<void> }>} */
  #sessions = new Map();
  #userDataRoot = "";
  /** @type {((profileId: string, profile: object, event: string) => void) | null} */
  #onSessionChange = null;

  setUserDataRoot(root) {
    this.#userDataRoot = root;
  }

  setOnSessionChange(handler) {
    this.#onSessionChange = handler ?? null;
  }

  isRunning(profileId) {
    const session = this.#sessions.get(String(profileId));
    return Boolean(session?.alive);
  }

  #emitSessionChange(profileId, profile, event) {
    try {
      this.#onSessionChange?.(String(profileId), profile, event);
    } catch {
      // listener errors should not break session lifecycle
    }
  }

  /** Boot-time — kill orphan Chrome + reset stale running/opening rows. */
  async reconcileOrphansOnStartup() {
    const root = this.#userDataRoot;
    if (!root) return { cleaned: 0 };
    let cleaned = 0;
    const profilesDir = path.join(root, "profiles");

    for (const row of profileService.listActiveProfileIds()) {
      if (this.isRunning(row.id)) continue;
      const userDataDir = profileDataDir(root, row.id);
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
    const startupNavigation = skipStartupUrl
      ? awaitBrowserReady(opened.context)
      : navigateStartupUrl(opened.context, launchUrl)
    .catch(() => undefined);

    this.#sessions.set(id, {
      context: opened.context,
      userDataDir: opened.userDataDir,
      alive: true,
      debugPort: opened.debugPort || 0,
      profile,
      profileCode,
      focusOnly: false,
      startupNavigation,
    });
    this.#bindSessionLifecycle(id, opened.context, profile);

    profileService.touchLastOpened(id);
    const running = profileService.setProfileStatus(id, "running");
    this.#emitSessionChange(id, running, "running");
    return {
      ok: true,
      status: "running",
      profile: running,
      userDataDir: opened.userDataDir,
      debugPort: opened.debugPort || 0,
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
    const port = readDevToolsActivePort(userDataDir);

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

    if (!(await hasProfileBrowserProcess(userDataDir))) return null;

    const focused = await focusProfileBrowserWindow(userDataDir);
    if (!focused.ok) return null;

    this.#sessions.set(id, {
      context: null,
      userDataDir,
      alive: true,
      debugPort: 0,
      profile,
      profileCode,
      focusOnly: true,
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
      debugPort: 0,
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
      if (session.watchdog) clearInterval(session.watchdog);
      session.alive = false;
      this.#sessions.delete(id);
      const next = profileService.setProfileStatus(id, "closed");
      this.#emitSessionChange(id, next, reason);
    };

    const maybeFinalizeWhenEmpty = () => {
      setTimeout(() => {
        try {
          if (context.pages().length === 0) finalize("window-closed");
        } catch {
          finalize("window-closed");
        }
      }, 200);
    };

    const bindPageClose = (page) => {
      page.once("close", maybeFinalizeWhenEmpty);
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
      if (!isContextAlive(context)) {
        finalize("watchdog");
      }
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
    const existing = this.#sessions.get(id);
    if (existing?.alive) {
      if (existing.context) {
        await this.focusProfile(id);
        profileService.touchLastOpened(id);
        const next = profileService.setProfileStatus(id, "running");
        return { ok: true, status: "running", profile: next, focused: true };
      }
      if (existing.focusOnly) {
        await focusProfileBrowserWindow(existing.userDataDir);
        profileService.touchLastOpened(id);
        const next = profileService.setProfileStatus(id, "running");
        return { ok: true, status: "running", profile: next, focused: true };
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
    if (!shouldSkipOrphanProbe(userDataDir, priorStatus)) {
      attached = await this.#tryAttachOrFocusOrphan(profile, userDataDir, { skipStartupUrl });
    }
    if (attached) return attached;

    await prepareProfileForLaunch(userDataDir, {
      aggressive: needsAggressivePrep || profileDirHasLock(userDataDir),
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (attempt > 0) {
          const retried = await this.#tryAttachOrFocusOrphan(profile, userDataDir, { skipStartupUrl });
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
          const retried = await this.#tryAttachOrFocusOrphan(profile, userDataDir, { skipStartupUrl });
          if (retried) return retried;
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
  }

  async close(profileId) {
    const id = String(profileId);
    const session = this.#sessions.get(id);
    if (session) {
      if (session.watchdog) clearInterval(session.watchdog);
      session.alive = false;
      this.#sessions.delete(id);
      if (session.focusOnly) {
        await killOrphanProfileBrowser(session.userDataDir);
      } else {
        await closeContext(session.context);
      }
      removeStaleProfileLocks(session.userDataDir);
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

  listRunning() {
    const rows = [];
    for (const [id, session] of this.#sessions.entries()) {
      if (!session.alive) continue;
      const profile = profileService.getProfile(id);
      rows.push({
        id,
        name: profile?.name || id,
        userDataDir: session.userDataDir,
        debugPort: session.debugPort || 0
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

module.exports = { SessionManager, removeStaleProfileLocks, isLaunchLockError, isContextAlive };
