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
  purgeIdentityToolbarRoot,
  purgeAllProfilesIdentityToolbar,
  purgeAllProfilesBrokenExtensionPrefs,
  purgeAllProfilesStaleCookieBridgePrefs,
  purgeAllProfilesSurfshark,
  purgeSurfsharkExtensionCache,
} = require("./lib/profile-chrome-cleanup.cjs");
const {
  warmCookieBridgeStoreCache,
  resolveCookieBridgeExtensionDirSync,
} = require("./lib/cookie-bridge-store.cjs");
const { getBinaryInfoCached } = require("./engine/cloak-browser-engine.cjs");
const { ensureCloakbrowserExtensionStage } = require("./lib/cloakbrowser-extension-stage.cjs");
const { packagedContentSecurityPolicy } = require("./lib/packaged-csp.cjs");
const { getCookieBridgeStatus } = require("./lib/cookie-bridge-status.cjs");
const { runOpenUrl } = require("./automation/open-url.cjs");
const {
  validateProfileId,
  validateCreateProfilePayload,
  validateBulkCreateProfilesByNamesPayload,
  validateBulkCreateProfilesByRangePayload,
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
    const page = profileService.listProfilesPage(payload);
    return { ok: true, ...page };
  });

  ipcMain.handle("profile:catalogStats", () => {
    return { ok: true, stats: profileService.getCatalogStats() };
  });

  ipcMain.handle("profile:bootstrap", () => {
    return {
      ok: true,
      groups: profileService.listGroups(),
      stats: profileService.getCatalogStats(),
    };
  });

  ipcMain.handle("profile:list", () => {
    return {
      ok: true,
      profiles: profileService.listProfilesLite(),
      groups: profileService.listGroups(),
    };
  });

  ipcMain.handle("profile:create", (_event, payload = {}) => {
    const safe = validateCreateProfilePayload(payload);
    const profile = profileService.createProfile(safe);
    return { ok: true, profile };
  });

  ipcMain.handle("profile:createBulkByNames", (_event, payload = {}) => {
    const safe = validateBulkCreateProfilesByNamesPayload(payload);
    const result = profileService.createProfilesBulkByNames({
      names: safe.names,
      defaults: safe,
    });
    return { ok: true, ...result };
  });

  ipcMain.handle("profile:createBulkByRange", (_event, payload = {}) => {
    const safe = validateBulkCreateProfilesByRangePayload(payload);
    const result = profileService.createProfilesBulkByRange({
      start: safe.start,
      end: safe.end,
      pad: safe.pad,
      defaults: safe,
    });
    return { ok: true, ...result };
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

  ipcMain.handle("profile:delete", async (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    const profile = profileService.getProfile(id);
    const release = await sessionManager.releaseProfileStorage(id);
    profileService.deleteProfile(id);
    return {
      ok: true,
      count: 1,
      names: [profile?.name || id],
      storagePurged: release.storagePurged ? 1 : 0,
    };
  });

  ipcMain.handle("profile:deleteMany", async (_event, payload = {}) => {
    const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
    const names = ids.map((id) => profileService.getProfile(id)?.name || id);
    let storagePurged = 0;
    for (const id of ids) {
      const release = await sessionManager.releaseProfileStorage(id);
      if (release.storagePurged) storagePurged += 1;
    }
    const result = profileService.deleteProfiles(ids);
    return { ok: true, count: result.count, names, storagePurged };
  });

  ipcMain.handle("profile:launch", async (_event, payload = {}) => {
    const profile = profileService.resolveProfileForLaunch({
      id: validateProfileId(payload.id),
      name: payload.name,
    });
    if (!profile) throw new Error("Profile not found.");
    return sessionManager.launch(profile);
  });

  ipcMain.handle("profile:close", async (_event, payload = {}) => {
    const profile = profileService.resolveProfileForLaunch({
      id: validateProfileId(payload.id),
      name: payload.name,
    });
    if (!profile) throw new Error("Profile not found.");
    return sessionManager.close(profile.id);
  });

  ipcMain.handle("profile:focus", async (_event, payload = {}) => {
    const profile = profileService.resolveProfileForLaunch({
      id: validateProfileId(payload.id),
      name: payload.name,
    });
    if (!profile) throw new Error("Profile not found.");
    return sessionManager.focusProfile(profile.id);
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
    const profile =
      profileService.resolveProfileForLaunch({ id: safe.profileId, name: payload.profileName }) ||
      profileService.getProfile(safe.profileId);
    if (!profile) throw new Error("Profile not found.");

    const context = await sessionManager.ensureAutomationContext(profile);

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

  const { listLaunchPerf, clearLaunchPerf } = require("./lib/profile-launch-perf.cjs");
  const { readLaunchBench } = require("./lib/launch-bench-store.cjs");

  ipcMain.handle("launchPerf:list", (_event, payload = {}) => ({
    ok: true,
    entries: listLaunchPerf(payload?.limit),
  }));

  ipcMain.handle("launchPerf:clear", () => clearLaunchPerf());

  ipcMain.handle("launchPerf:baseline", () => ({
    ok: true,
    baseline: readLaunchBench(path.join(__dirname, "..")),
  }));

  ipcMain.handle("legacy:purgeIdentityToolbar", () => {
    const result = purgeAllProfilesIdentityToolbar(userDataRoot());
    return { ok: true, ...result };
  });

  ipcMain.handle("extension:cookieBridgeStatus", () => ({
    ok: true,
    status: getCookieBridgeStatus(userDataRoot()),
  }));

  ipcMain.handle("extension:purgeBrokenPrefs", () => {
    const result = purgeAllProfilesBrokenExtensionPrefs(userDataRoot());
    return { ok: true, ...result };
  });
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
  const apiKey = String(
    keys["platform-tools"] || keys["other-tools"] || keys["stealth-console"] || keys["cursor-ide"] || "",
  ).trim();
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
    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes("Stealth Browser Console");
  } catch {
    return false;
  }
}

/** Wait until Vite serves HTML + main entry (avoids Electron boot timeout on zombie port). */
async function waitForStealthDevServer(url, { timeoutMs = 60000 } = {}) {
  const base = normalizeDevServerUrl(url);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isStealthDevServer(base))) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    try {
      const entry = await fetch(new URL("src/main.tsx", base), { signal: AbortSignal.timeout(8000) });
      if (entry.ok) return true;
    } catch {
      // Vite still compiling or zombie — retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
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
    const ready = await waitForStealthDevServer(devServerUrl);
    if (!ready) {
      console.error(`[load] dev server not ready: ${devServerUrl} — run pnpm dev:recover`);
    }
    await win.loadURL(devServerUrl);
    return;
  }
  const indexPath = distIndexPath();
  if (!fs.existsSync(indexPath)) {
    const html = [
      "<!doctype html><html><body style=\"margin:0;background:#0b1020;color:#e6e8ef;font:14px/1.5 system-ui,sans-serif\">",
      "<div style=\"padding:2rem;max-width:40rem\">",
      "<h1 style=\"margin:0 0 .75rem;font-size:1.125rem\">Stealth Browser Console</h1>",
      "<p>Dev server is not running and <code>dist/index.html</code> is missing.</p>",
      "<p>Run <code>pnpm dev</code> or <code>pnpm dev:reload</code> from the project folder.</p>",
      "</div></body></html>",
    ].join("");
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return;
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
  const policy = packagedContentSecurityPolicy();

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

  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[load] failed ${code} ${description} ${url}`);
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[load] render gone ${details.reason}`);
  });

  await loadApplication(win);

  const showWindow = () => {
    if (win.isDestroyed()) return;
    if (!win.isVisible()) {
      win.maximize();
      win.show();
      win.focus();
    }
  };

  win.once("ready-to-show", showWindow);
  // ready-to-show may fire before listener attaches when loading from file:// or fast dev server.
  setImmediate(showWindow);

  attachDesktopUpdaterWindow(win);
  return win;
}

app.whenReady().then(async () => {
  configureAutoUpdater();
  bindDesktopUpdaterIpc();
  await openDatabase(userDataRoot());
  profileService.ensureSeedProfiles();
  sessionManager.setUserDataRoot(userDataRoot());
  setImmediate(() => {
    void sessionManager.reconcileOrphansOnStartup().catch(() => undefined);
    if (typeof warmCookieBridgeStoreCache === "function") {
      void (async () => {
        try {
          const root = userDataRoot();
          await warmCookieBridgeStoreCache(root);
          const bridgeDir = resolveCookieBridgeExtensionDirSync(root);
          if (bridgeDir) {
            const binary = await getBinaryInfoCached();
            ensureCloakbrowserExtensionStage(bridgeDir, binary.cacheDir);
          }
        } catch (error) {
          console.warn("[cookie-bridge] warm cache:", error instanceof Error ? error.message : error);
        }
      })();
    } else {
      console.warn("[cookie-bridge] warm cache unavailable: missing startup hook");
    }
  });
  try {
    const legacyIdentityRoot = path.join(userDataRoot(), "identity-ext");
    if (fs.existsSync(legacyIdentityRoot)) fs.rmSync(legacyIdentityRoot, { recursive: true, force: true });
  } catch {
    // best-effort — remove V4 in-page identity extensions
  }
  try {
    const legacyWorkflowQuickRun = path.join(userDataRoot(), "workflow-quick-run");
    if (fs.existsSync(legacyWorkflowQuickRun)) fs.rmSync(legacyWorkflowQuickRun, { recursive: true, force: true });
  } catch {
    // best-effort — remove rolled-back workflow side panel bundles
  }
  try {
    purgeSurfsharkExtensionCache(userDataRoot());
  } catch {
    // fast sync — block Surfshark load-extension path before first profile launch
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

  setImmediate(() => {
    try {
      purgeIdentityToolbarRoot(userDataRoot());
      const bulk = purgeAllProfilesIdentityToolbar(userDataRoot());
      if (bulk.removed > 0) {
        console.log(
          `[legacy-purge] startup profiles=${bulk.profiles} removed=${bulk.removed} prefsCleaned=${bulk.prefsCleaned}`,
        );
      }
      const surfshark = purgeAllProfilesSurfshark(userDataRoot());
      if (!surfshark.skipped && (surfshark.removed > 0 || surfshark.cacheRemoved)) {
        console.log(
          `[surfshark-purge] startup profiles=${surfshark.profiles} removed=${surfshark.removed} prefsCleaned=${surfshark.prefsCleaned} cacheRemoved=${surfshark.cacheRemoved}`,
        );
      }
      const broken = purgeAllProfilesBrokenExtensionPrefs(userDataRoot());
      if (broken.removed > 0) {
        console.log(
          `[extension-purge] startup profiles=${broken.profiles} brokenRemoved=${broken.removed} prefsCleaned=${broken.prefsCleaned}`,
        );
      }
      const bridgeDir = resolveCookieBridgeExtensionDirSync(userDataRoot());
      if (bridgeDir) {
        const stale = purgeAllProfilesStaleCookieBridgePrefs(userDataRoot(), bridgeDir);
        if (stale.removed > 0) {
          console.log(
            `[cookie-bridge-purge] startup profiles=${stale.profiles} staleRemoved=${stale.removed} prefsCleaned=${stale.prefsCleaned}`,
          );
        }
      }
    } catch {
      // best-effort — drop cached identity-toolbar bundles from pre-v0.5.23 installs
    }
  });

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
