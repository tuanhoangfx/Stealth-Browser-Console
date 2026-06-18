const path = require("node:path");
const fs = require("node:fs");
const { closeContext, profileDataDir, openProfile } = require("./cloak-browser-engine.cjs");
const profileService = require("../db/profile-service.cjs");
const { navigateStartupUrl } = require("../automation/navigate-startup.cjs");
const { getFreePort, waitForCdp } = require("../lib/net-port.cjs");
const { extractProfileCode, buildPillTooltip, buildPillChipText } = require("../lib/profile-identity.cjs");
const { applyWindowsTaskbarOverlay, clearWindowsTaskbarOverlay } = require("../lib/profile-taskbar-overlay.cjs");

/** CDP passthrough bật mặc định; tắt bằng STEALTH_CDP_ENABLE=0. */
function cdpEnabled() {
  return String(process.env.STEALTH_CDP_ENABLE || "1") !== "0";
}

const PROFILE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "lockfile"];
const SESSION_WATCHDOG_MS = 8000;

function isLaunchLockError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return /SingletonLock|lockfile|EBUSY|EACCES|user data directory|already in use|ProcessSingleton/i.test(msg);
}

function removeStaleProfileLocks(userDataDir) {
  for (const name of PROFILE_LOCK_FILES) {
    const file = path.join(userDataDir, name);
    if (!fs.existsSync(file)) continue;
    try {
      fs.unlinkSync(file);
    } catch {
      // live process still holds the lock
    }
  }
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
  /** @type {Map<string, { context: import('playwright-core').BrowserContext, userDataDir: string, alive: boolean, watchdog?: NodeJS.Timeout }>} */
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
      void clearWindowsTaskbarOverlay(session.userDataDir, session.profile?.id || id);
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
    void clearWindowsTaskbarOverlay(session.userDataDir, session.profile?.id || id);
    session.alive = false;
    this.#sessions.delete(id);
    await closeContext(session.context);
    removeStaleProfileLocks(session.userDataDir);
  }

  async launch(profile) {
    const id = String(profile.id);
    const existing = this.#sessions.get(id);
    if (existing?.alive) {
      const next = profileService.setProfileStatus(id, "running");
      return { ok: true, status: "running", profile: next };
    }
    if (existing) {
      await this.#dropSession(id);
    }

    profileService.setProfileStatus(id, "opening");
    this.#emitSessionChange(id, profileService.getProfile(id), "opening");
    const userDataDir = profileDataDir(this.#userDataRoot, id);
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (attempt > 0) {
          removeStaleProfileLocks(userDataDir);
          await new Promise((resolve) => setTimeout(resolve, 500));
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
        const profileCode = extractProfileCode(profile.name, profile.id);
        this.#sessions.set(id, {
          context: opened.context,
          userDataDir: opened.userDataDir,
          alive: true,
          debugPort: opened.debugPort || 0,
          profile,
          profileCode,
        });
        this.#bindSessionLifecycle(id, opened.context, profile);

        const launchUrl = profileService.resolveProfileLaunchUrl(profile.startupUrl);
        const chipText = buildPillChipText(profile);
        const tooltip = buildPillTooltip(profile);
        void (async () => {
          try {
            await navigateStartupUrl(opened.context, launchUrl);
          } catch {
            // launch still succeeds — operator can navigate manually
          }
          await applyWindowsTaskbarOverlay(
            opened.userDataDir,
            profileCode,
            tooltip,
            profile.id,
            chipText,
          );
        })();

        profileService.touchLastOpened(id);
        const running = profileService.setProfileStatus(id, "running");
        this.#emitSessionChange(id, running, "running");
        return {
          ok: true,
          status: "running",
          profile: running,
          userDataDir: opened.userDataDir,
          debugPort: opened.debugPort || 0
        };
      } catch (error) {
        lastError = error;
        if (attempt === 0 && isLaunchLockError(error)) continue;
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
      void clearWindowsTaskbarOverlay(session.userDataDir, session.profile?.id || id);
      session.alive = false;
      this.#sessions.delete(id);
      await closeContext(session.context);
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
}

module.exports = { SessionManager, removeStaleProfileLocks, isLaunchLockError, isContextAlive };
