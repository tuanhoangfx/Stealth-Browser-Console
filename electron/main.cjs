const { app, BrowserWindow, ipcMain, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const {
  configureAutoUpdater,
  bindDesktopUpdaterIpc,
  attachDesktopUpdaterWindow
} = require("./desktop-updater.cjs");
const { openDatabase, closeDatabase } = require("./db/init.cjs");
const profileService = require("./db/profile-service.cjs");
const { SessionManager } = require("./engine/session-manager.cjs");
const { createSessionTray } = require("./session-tray.cjs");
const { ensureEngineBinary, getBinaryInfo } = require("./engine/cloak-browser-engine.cjs");
const {
  getIdentityDebugEnabled,
  setIdentityDebugEnabled,
} = require("./lib/app-settings.cjs");
const { runOpenUrl } = require("./automation/open-url.cjs");
const {
  validateProfileId,
  validateCreateProfilePayload,
  validateOpenUrlPayload,
  validateGroupName,
  validateRunsLimit,
  validateRouterRequestPayload
} = require("./ipc-contracts.cjs");

const sessionManager = new SessionManager();
const sessionTray = createSessionTray(sessionManager);
const DEFAULT_DEV_SERVER_URL = "http://127.0.0.1:5175/";

function userDataRoot() {
  return app.getPath("userData");
}

function bindIpc() {
  ipcMain.handle("engine:health", async () => {
    try {
      const info = await ensureEngineBinary();
      return { ok: true, installed: true, info };
    } catch (error) {
      let info = {};
      try {
        info = await getBinaryInfo();
      } catch {
        info = {};
      }
      return {
        ok: false,
        installed: false,
        error: error instanceof Error ? error.message : String(error),
        info
      };
    }
  });

  ipcMain.handle("engine:updateBinary", async () => {
    const info = await ensureEngineBinary();
    return { ok: true, info };
  });

  ipcMain.handle("profile:listPage", (_event, payload = {}) => {
    sessionManager.syncProfileStatuses();
    const page = profileService.listProfilesPage(payload);
    return { ok: true, ...page };
  });

  ipcMain.handle("profile:catalogStats", () => {
    sessionManager.syncProfileStatuses();
    return { ok: true, stats: profileService.getCatalogStats() };
  });

  ipcMain.handle("profile:list", () => {
    sessionManager.syncProfileStatuses();
    return {
      ok: true,
      profiles: profileService.listProfiles(),
      groups: profileService.listGroups()
    };
  });

  ipcMain.handle("profile:create", (_event, payload = {}) => {
    const safe = validateCreateProfilePayload(payload);
    const profile = profileService.createProfile(safe);
    return { ok: true, profile };
  });

  ipcMain.handle("profile:update", async (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    const profile = profileService.updateProfile(id, payload);
    return { ok: true, profile };
  });

  ipcMain.handle("profile:bulkUpdateStartupUrl", (_event, payload = {}) => {
    const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
    const result = profileService.bulkUpdateStartupUrl(ids, payload.startupUrl);
    return { ok: true, ...result };
  });

  ipcMain.handle("profile:delete", (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    if (sessionManager.isRunning(id)) {
      throw new Error("Close the profile before deleting.");
    }
    profileService.deleteProfile(id);
    return { ok: true };
  });

  ipcMain.handle("profile:deleteMany", (_event, payload = {}) => {
    const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
    for (const id of ids) {
      if (sessionManager.isRunning(id)) {
        throw new Error(`Close profile ${id} before deleting.`);
      }
    }
    profileService.deleteProfiles(ids);
    return { ok: true, count: ids.length };
  });

  ipcMain.handle("profile:launch", async (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    const profile = profileService.getProfile(id);
    if (!profile) throw new Error("Profile not found.");
    return sessionManager.launch(profile);
  });

  ipcMain.handle("profile:close", async (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    return sessionManager.close(id);
  });

  ipcMain.handle("profile:focus", async (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    return sessionManager.focusProfile(id);
  });

  ipcMain.handle("profile:listRunning", () => ({
    ok: true,
    sessions: sessionManager.listRunning()
  }));

  ipcMain.handle("group:create", (_event, payload = {}) => {
    const group = profileService.createGroup(validateGroupName(payload.name));
    return { ok: true, group };
  });

  ipcMain.handle("group:update", (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    const group = profileService.updateGroup(id, validateGroupName(payload.name));
    return { ok: true, group };
  });

  ipcMain.handle("group:delete", (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    profileService.deleteGroup(id);
    return { ok: true };
  });

  ipcMain.handle("profiles:export", () => ({
    ok: true,
    bundle: profileService.exportProfilesBundle()
  }));

  ipcMain.handle("profiles:import", (_event, payload = {}) => {
    if (payload.bundle === undefined || payload.bundle === null) {
      throw new Error("Import bundle is required.");
    }
    try {
      return profileService.importProfilesBundle(payload.bundle, { merge: payload.merge !== false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Invalid import bundle: ${message}` };
    }
  });

  ipcMain.handle("runs:list", (_event, payload = {}) => {
    const limit = validateRunsLimit(payload.limit);
    return { ok: true, runs: profileService.listRuns(limit) };
  });

  ipcMain.handle("automation:openUrl", async (_event, payload = {}) => {
    const safe = validateOpenUrlPayload(payload);
    const profile = profileService.getProfile(safe.profileId);
    if (!profile) throw new Error("Profile not found.");

    if (!sessionManager.isRunning(profile.id)) {
      await sessionManager.launch(profile);
    }

    const context = sessionManager.getContext(profile.id);
    if (!context) throw new Error("Unable to obtain browser context.");

    const result = await runOpenUrl({
      context,
      profile,
      targetUrl: safe.targetUrl,
      screenshot: safe.screenshot,
      closeWhenDone: safe.closeWhenDone,
      screenshotsRoot: userDataRoot(),
      onCloseProfile: () => sessionManager.close(profile.id),
      workflowAction: safe.workflowAction,
      steps: safe.steps,
      inspectMode: safe.inspectMode,
      workflowId: safe.workflowId
    });

    profileService.insertRun({
      id: result.runId,
      profileId: profile.id,
      workflow: safe.workflowId || safe.workflowAction || "open-url",
      targetUrl: safe.targetUrl,
      status: result.ok ? "success" : "failed",
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      screenshotPath: result.screenshotPath,
      error: result.error || null,
      logsJson: JSON.stringify(result.logs)
    });

    if (!safe.closeWhenDone && result.ok) {
      profileService.updateProfile(profile.id, { status: "running" });
    }

    return result;
  });

  ipcMain.handle("app:info", () => ({
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    userDataPath: userDataRoot()
  }));

  ipcMain.handle("app:openDataFolder", () => {
    shell.openPath(userDataRoot());
    return { ok: true, path: userDataRoot() };
  });

  ipcMain.handle("settings:getIdentityDebug", () => ({
    ok: true,
    enabled: getIdentityDebugEnabled(),
  }));

  ipcMain.handle("settings:setIdentityDebug", (_event, payload = {}) => ({
    ok: true,
    enabled: setIdentityDebugEnabled(Boolean(payload.enabled)),
  }));
}

function tryLoadJsonFile(candidates) {
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      return { data: JSON.parse(fs.readFileSync(filePath, "utf8")), source: filePath };
    } catch {
      // try next candidate
    }
  }
  return null;
}

function loadRouterLocalConfig() {
  const hit = tryLoadJsonFile([
    path.join(process.cwd(), "config", "router.local.json"),
    path.join(__dirname, "..", "config", "router.local.json"),
    path.join(app.getPath("userData"), "router.local.json")
  ]);
  if (!hit) return null;
  const parsed = hit.data;
  return {
    baseUrl: String(parsed.baseUrl || "").trim(),
    apiKey: String(parsed.apiKey || "").trim(),
    model: String(parsed.model || "cx/gpt-5.3-codex").trim(),
    fallbacks: Array.isArray(parsed.fallbacks) ? parsed.fallbacks.map((item) => String(item).trim()).filter(Boolean) : [],
    maxTokens: Number(parsed.maxTokens) || 4096,
    temperature: Number.isFinite(Number(parsed.temperature)) ? Number(parsed.temperature) : 0.3,
    source: hit.source
  };
}

function loadP0007ApiKey() {
  const hit = tryLoadJsonFile([
    path.join(process.cwd(), "..", "P0007-9router-infra", "data", "api-keys.local.json"),
    path.join(__dirname, "..", "..", "P0007-9router-infra", "data", "api-keys.local.json")
  ]);
  if (!hit) return null;
  const parsed = hit.data;
  const keys = parsed?.keys && typeof parsed.keys === "object" ? parsed.keys : {};
  const apiKey = String(keys["stealth-console"] || keys["gpm-console"] || keys["other-tools"] || "").trim();
  if (!apiKey) return null;
  const baseUrl = String(parsed.canonicalBaseUrl || parsed.activeBaseUrl || "").trim();
  return { apiKey, baseUrl: baseUrl || "https://9router.infi.io.vn/v1", source: hit.source };
}

function bindRouterApi() {
  const { validateRouterRequestPayload: validateRouterPayload } = require("./ipc-contracts.cjs");

  ipcMain.handle("router:loadLocalConfig", () => {
    const local = loadRouterLocalConfig();
    if (local?.apiKey?.trim()) return local;
    return loadP0007ApiKey();
  });

  ipcMain.handle("router:request", async (_event, payload = {}) => {
    let safe;
    try {
      safe = validateRouterPayload(payload);
    } catch (error) {
      return { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) };
    }

    const url = safe.path ? `${safe.baseUrl}/${safe.path}` : safe.baseUrl;
    try {
      const response = await fetch(url, {
        method: safe.method,
        signal: AbortSignal.timeout(safe.timeoutMs),
        headers: {
          ...safe.headers,
          Authorization: `Bearer ${safe.apiKey}`,
          "Content-Type": "application/json"
        },
        body: safe.body !== undefined ? JSON.stringify(safe.body) : undefined
      });
      const body = await response.text();
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed";
      return { ok: false, status: 0, body: message };
    }
  });
}

function normalizeDevServerUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

async function isDevServerReachable(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

/** Reject foreign Vite instances (e.g. workspace default :5173) — must serve this app. */
async function isStealthDevServer(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes("Stealth Browser Console");
  } catch {
    return false;
  }
}

async function resolveDevServerUrl() {
  if (app.isPackaged) return null;

  const fromEnv = normalizeDevServerUrl(process.env.VITE_DEV_SERVER_URL);
  const candidates = [];
  for (const url of [DEFAULT_DEV_SERVER_URL, fromEnv]) {
    if (!url || candidates.includes(url)) continue;
    candidates.push(url);
  }

  for (const url of candidates) {
    if (await isStealthDevServer(url)) return url;
  }

  // Prefer bundled dist when present (portable/prod builds).
  if (fs.existsSync(distIndexPath())) return null;

  for (const url of candidates) {
    if (await isDevServerReachable(url)) return url;
  }
  return null;
}

function distIndexPath() {
  return path.join(__dirname, "..", "dist", "index.html");
}

async function loadApplication(win) {
  const devServerUrl = await resolveDevServerUrl();
  if (devServerUrl) {
    await win.loadURL(devServerUrl);
    return;
  }
  const indexPath = distIndexPath();
  if (!fs.existsSync(indexPath)) {
    throw new Error("dist/index.html not found. Run pnpm build or pnpm dev.");
  }
  await win.loadFile(indexPath);
}

/**
 * Production CSP — removes the dev-only "unsafe-eval" exposure flagged by Electron.
 * Only applied when packaged so Vite HMR (needs eval/inline) keeps working in dev.
 * 'unsafe-inline' on style-src is required by Tailwind + inline colgroup widths.
 */
function bindContentSecurityPolicy() {
  if (!app.isPackaged) return;
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join("; ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy]
      }
    });
  });
}

function broadcastProfileSession(profile, event) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("profile:session", { profile, event });
    }
  }
}

async function createWindow() {
  const iconPath = path.join(__dirname, "..", "build", "icons", "app.ico");
  const win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0b1020",
    title: "Stealth Browser Console",
    show: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });
  await loadApplication(win);
  attachDesktopUpdaterWindow(win);
  return win;
}

app.whenReady().then(async () => {
  configureAutoUpdater();
  bindDesktopUpdaterIpc();
  await openDatabase(userDataRoot());
  profileService.ensureSeedProfiles();
  sessionManager.setUserDataRoot(userDataRoot());
  try {
    const legacyIdentityRoot = path.join(userDataRoot(), "identity-ext");
    if (fs.existsSync(legacyIdentityRoot)) fs.rmSync(legacyIdentityRoot, { recursive: true, force: true });
  } catch {
    // best-effort — remove V4 in-page identity extensions
  }
  bindContentSecurityPolicy();
  bindIpc();
  const { startApiServer } = require("./api-server.cjs");
  startApiServer({ sessionManager, profileService, userDataRoot: userDataRoot() });
  sessionManager.setOnSessionChange((_id, profile, event) => {
    broadcastProfileSession(profile, event);
    sessionTray.refresh();
  });
  sessionTray.start();
  bindRouterApi();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  sessionTray.stop();
  void sessionManager.closeAll();
  closeDatabase();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
