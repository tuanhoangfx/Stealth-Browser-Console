"use strict";
/**
 * Shared HTTP route helpers, mail preflight checks, agent/headed lock safety guards,
 * deferred user-headed queue persistence, and hot-patch module cache refresh utilities.
 *
 * Leaf module under `electron/routes/` — imports zero sibling route modules so the
 * dependency graph across `electron/api-routes.cjs` -> `electron/routes/*.cjs` is strictly acyclic.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { validateOpenUrlPayload } = require("../ipc-contracts.cjs");
const {
  patchProfile: patchProfileOp,
  performOpenUrl: performOpenUrlOp,
  resolveProfileId: resolveProfileIdOp,
} = require("../services/profile-ops.cjs");
const { extractProfileCode } = require("../lib/profile-code.cjs");
const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");
const {
  parseAgentSmokeFlag,
  runWithAgentSmokeRequest,
} = require("../lib/agent-smoke-context.cjs");
const { diagnoseMailCredentials } = require("../lib/twofa-vault-bridge.cjs");

const ELECTRON_DIR = path.resolve(__dirname, "..");
const PRODUCT_ROOT = path.resolve(ELECTRON_DIR, "..");
const SOCIAL_HUB_DATA_DIR = "E:\\Dev\\Tool\\P0002-Social-Hub\\data";
const PRIORITY_AGENT_LOCKS_PATH = path.join(SOCIAL_HUB_DATA_DIR, "priority-agent-locks.json");
const ACTIVE_AGENT_LOCKS_PATH = path.join(SOCIAL_HUB_DATA_DIR, "active-agent-locks.json");
const DEFERRED_USER_HEADED_QUEUE_PATH = path.join(SOCIAL_HUB_DATA_DIR, "deferred-user-headed-queue.json");
const P0020_DEFERRED_QUEUE_PATH = "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\deferred-user-headed-queue.json";
const P0020_REVOKE_EXPIRED_SCRIPT_PATH = "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\revoke-expired-action-orders.mjs";

function stepsNeedMailCredentials(steps) {
  return (
    Array.isArray(steps) &&
    steps.some((s) => /\{\{(gmail|outlook|mail)(Email|Password|Recovery|TotpCode)\}\}/i.test(String(s?.value || "")))
  );
}

function resolveMailVaultService(steps) {
  const blob = Array.isArray(steps) ? steps.map((s) => String(s?.value || "")).join(" ") : "";
  if (/\{\{outlook/i.test(blob)) return "Outlook";
  if (/\{\{mail(Email|Password|Recovery|TotpCode)\}\}/i.test(blob) && !/\{\{gmail/i.test(blob)) {
    return "Outlook";
  }
  return "Gmail";
}

async function preflightMailCredentials(profile, steps) {
  if (!stepsNeedMailCredentials(steps)) return;
  const profileCode = extractProfileCode(profile.name, profile.id);
  const vaultService = resolveMailVaultService(steps);
  const diagnosis = await diagnoseMailCredentials(profileCode, vaultService, { allowInactive: true });
  if (!diagnosis.ok || !diagnosis.credentials) {
    throw new Error(diagnosis.reason || `No ${vaultService} credentials found for profile ${profileCode}.`);
  }
}

function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return true;
  try {
    process.kill(n, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === "EPERM");
  }
}

/**
 * Creates a non-throwing priority & active agent lock guard state with short TTL file caching.
 */
function createLockGuardState({ enabled = true } = {}) {
  const lockFileCache = new Map();

  function clearLockFileCache() {
    lockFileCache.clear();
  }

  function readCachedLockJson(fp, ttlMs = 2000) {
    const now = Date.now();
    const hit = lockFileCache.get(fp);
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
    lockFileCache.set(fp, { at: now, data });
    return data;
  }

  function readPriorityLocks() {
    try {
      if (!fs.existsSync(PRIORITY_AGENT_LOCKS_PATH)) return {};
      const raw = fs.readFileSync(PRIORITY_AGENT_LOCKS_PATH, "utf8").replace(/\0/g, "").trim();
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed.locks === "object" && parsed.locks) {
        return { ...parsed.locks };
      }
    } catch {
      /* ignore */
    }
    return {};
  }

  function writePriorityLocks(locks) {
    try {
      if (!fs.existsSync(SOCIAL_HUB_DATA_DIR)) return false;
      let baseObj = {};
      if (fs.existsSync(PRIORITY_AGENT_LOCKS_PATH)) {
        try {
          const raw = fs.readFileSync(PRIORITY_AGENT_LOCKS_PATH, "utf8").replace(/\0/g, "").trim();
          baseObj = raw ? JSON.parse(raw) || {} : {};
        } catch {
          baseObj = {};
        }
      }
      const nextPayload = {
        ...baseObj,
        updatedAt: new Date().toISOString(),
        locks: locks && typeof locks === "object" ? locks : {},
      };
      fs.writeFileSync(PRIORITY_AGENT_LOCKS_PATH, JSON.stringify(nextPayload, null, 2), "utf8");
      clearLockFileCache();
      return true;
    } catch {
      return false;
    }
  }

  function readActivePriorityLockedCodes() {
    const out = new Set();
    try {
      if (fs.existsSync(PRIORITY_AGENT_LOCKS_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(PRIORITY_AGENT_LOCKS_PATH, "utf8")) || {};
        const now = Date.now();
        for (const [k, v] of Object.entries(parsed?.locks || {})) {
          if (Number(v?.expiresAt) > now) {
            out.add(String(k).padStart(4, "0"));
          }
        }
      }
    } catch {
      /* ignore */
    }
    return out;
  }

  function removeCallerActiveLocks(item) {
    try {
      if (fs.existsSync(ACTIVE_AGENT_LOCKS_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(ACTIVE_AGENT_LOCKS_PATH, "utf8")) || {};
        if (parsed.locks && typeof parsed.locks === "object") {
          const normC = item?.code ? String(item.code).padStart(4, "0") : "";
          if (normC) delete parsed.locks[normC];
          for (const [k, v] of Object.entries(parsed.locks)) {
            if (v && typeof v === "object" && String(v.stealthId || "") === String(item?.id || "")) {
              delete parsed.locks[k];
            }
          }
          fs.writeFileSync(ACTIVE_AGENT_LOCKS_PATH, JSON.stringify(parsed, null, 2), "utf8");
        }
      }
      clearLockFileCache();
    } catch {
      /* ignore */
    }
  }

  function isCodePriorityLocked(codeStr, callerPid = 0, profileId = "") {
    if (!enabled) return false;
    const hasCode = Boolean(codeStr && /^\d{4,5}$/.test(codeStr));
    const hasId = Boolean(profileId && String(profileId).length >= 8);
    if (!hasCode && !hasId) return false;
    const now = Date.now();
    try {
      const parsed = readCachedLockJson(PRIORITY_AGENT_LOCKS_PATH);
      if (!parsed) return false;
      const locks = parsed && typeof parsed.locks === "object" && parsed.locks ? parsed.locks : {};
      let val = hasCode ? locks[codeStr] || parsed[codeStr] : null;
      if (!val && hasId) {
        val = Object.values(locks).find(
          (v) => v && typeof v === "object" && v.stealthId && String(v.stealthId) === String(profileId),
        );
      }
      if (!val) return false;
      const exp = typeof val === "object" && val ? Number(val.expiresAt || 0) : Number(val || 0);
      const ownerPid = typeof val === "object" && val ? Number(val.pid || val.ownerPid || 0) : 0;
      if (callerPid && ownerPid && Number(callerPid) === ownerPid) return false;
      if (exp > now && (!ownerPid || isPidAlive(ownerPid))) {
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  function isCodeLockedByActiveAgent(codeStr, profileId = "") {
    if (!enabled) return false;
    const hasCode = Boolean(codeStr && /^\d{4,5}$/.test(codeStr));
    const hasId = Boolean(profileId && String(profileId).length >= 8);
    if (!hasCode && !hasId) return false;
    if (isCodePriorityLocked(codeStr, 0, profileId)) return true;
    const now = Date.now();
    try {
      for (const fp of [ACTIVE_AGENT_LOCKS_PATH, PRIORITY_AGENT_LOCKS_PATH]) {
        try {
          const parsed = readCachedLockJson(fp);
          if (!parsed) continue;
          const locks = parsed && typeof parsed.locks === "object" && parsed.locks ? parsed.locks : {};
          let val = hasCode ? locks[codeStr] : null;
          if (!val && hasId) {
            val = Object.values(locks).find(
              (v) => v && typeof v === "object" && v.stealthId && String(v.stealthId) === String(profileId),
            );
          }
          if (!val) continue;
          const exp = typeof val === "object" && val ? Number(val.expiresAt || 0) : Number(val || 0);
          const ownerPid = typeof val === "object" && val ? Number(val.pid || val.ownerPid || 0) : 0;
          if (exp > now && (!ownerPid || isPidAlive(ownerPid))) {
            return true;
          }
        } catch {
          /* ignore single lock file error */
        }
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  return {
    clearLockFileCache,
    readPriorityLocks,
    writePriorityLocks,
    readActivePriorityLockedCodes,
    removeCallerActiveLocks,
    isCodePriorityLocked,
    isCodeLockedByActiveAgent,
  };
}

/**
 * Deferred agent task persistence when a profile is actively open in User Headed mode.
 */
function createDeferredAgentQueueHelpers({ sessionManager, profileService, deferredMap }) {
  function persistDeferredFile(extraReadyItem = null) {
    try {
      if (!fs.existsSync(SOCIAL_HUB_DATA_DIR)) return;
      let prevReady = [];
      try {
        if (fs.existsSync(DEFERRED_USER_HEADED_QUEUE_PATH)) {
          const parsed = JSON.parse(fs.readFileSync(DEFERRED_USER_HEADED_QUEUE_PATH, "utf8")) || {};
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
      const pending = [...deferredMap.values()];
      const pendingCodes = new Set(pending.map((x) => x.code));
      prevReady = prevReady.filter((x) => !pendingCodes.has(x?.code));
      fs.writeFileSync(
        DEFERRED_USER_HEADED_QUEUE_PATH,
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
    } catch {
      /* ignore */
    }
  }

  function removeReadyDeferredEntry(codeOrId) {
    try {
      if (!fs.existsSync(DEFERRED_USER_HEADED_QUEUE_PATH)) return;
      const parsed = JSON.parse(fs.readFileSync(DEFERRED_USER_HEADED_QUEUE_PATH, "utf8")) || {};
      if (!Array.isArray(parsed.readyForRetry)) return;
      const nextReady = parsed.readyForRetry.filter(
        (x) => x?.code !== codeOrId && x?.profileId !== codeOrId,
      );
      fs.writeFileSync(
        DEFERRED_USER_HEADED_QUEUE_PATH,
        JSON.stringify(
          {
            ...parsed,
            updatedAt: new Date().toISOString(),
            readyForRetry: nextReady,
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch {
      /* ignore */
    }
  }

  function triggerDeferredExpiredOrderDrain(codeOrId) {
    try {
      const rawCode = String(codeOrId || "").replace(/^#/, "").trim();
      const code4 = /^\d{1,4}$/.test(rawCode) ? rawCode.padStart(4, "0") : "";
      if (!fs.existsSync(P0020_DEFERRED_QUEUE_PATH)) return;
      const raw = fs.readFileSync(P0020_DEFERRED_QUEUE_PATH, "utf8").trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
      if (list.length === 0) return;
      const hasMatch =
        !code4 ||
        list.some((x) => String(x?.profileSlot || x?.code || "").replace(/^#/, "").padStart(4, "0") === code4);
      if (!hasMatch) return;

      const winShellCandidates = [
        path.resolve(ELECTRON_DIR, "../../scripts/lib/win-shell-env.cjs"),
        "E:\\Dev\\Tool\\scripts\\lib\\win-shell-env.cjs",
      ];
      const winShellPath = winShellCandidates.find((p) => fs.existsSync(p));
      if (!winShellPath || !fs.existsSync(P0020_REVOKE_EXPIRED_SCRIPT_PATH)) return;
      const { startHiddenDetachedProcess } = require(winShellPath);
      const args = [P0020_REVOKE_EXPIRED_SCRIPT_PATH, "--drain-deferred"];
      if (code4) args.push(code4);
      args.push("--apply", "--telegram");
      startHiddenDetachedProcess("E:\\Dev\\.tools\\nodew.exe", args, {
        cwd: "E:\\Dev",
        pidFile: path.join(SOCIAL_HUB_DATA_DIR, "deferred-order-drain.pid"),
        logFile: path.join(SOCIAL_HUB_DATA_DIR, "deferred-order-drain.log"),
        env: { ...process.env, STEALTH_AGENT_CALLER: "agent:deferred-order-drain" },
      });
    } catch {
      /* ignore */
    }
  }

  function scheduleDeferredAgentAutoDrain(defEntry) {
    const pid = String(defEntry?.profileId || "").trim();
    const code = String(defEntry?.code || "").trim();
    if (!pid) return;
    const timer = setTimeout(async () => {
      try {
        if (sessionManager.isUserInteractiveSession(pid)) return;
        const prof = profileService?.getProfile?.(pid);
        if (!prof) return;
        await runWithAgentSmokeRequest(true, async () => {
          const launched = await sessionManager.launch({ ...prof, headless: true }, {});
          if (launched?.ok) {
            await new Promise((r) => setTimeout(r, 4000));
            await sessionManager.close(pid, { agentOnly: true, ignoreIfUserInteractive: true }).catch(() => null);
          }
        });
        removeReadyDeferredEntry(code || pid);
        triggerDeferredExpiredOrderDrain(code || pid);
      } catch {
        /* ignore */
      }
    }, 5000);
    timer.unref?.();
  }

  return {
    persistDeferredFile,
    removeReadyDeferredEntry,
    triggerDeferredExpiredOrderDrain,
    scheduleDeferredAgentAutoDrain,
  };
}

/**
 * Refreshes stateless module caches and propagates fresh exports onto previously held references
 * when `buildRoutes()` / `services.rebuildRoutes()` runs.
 */
function refreshCoreRouteModuleCaches({ profileService, userDataRoot }) {
  try {
    for (const ck of Object.keys(require.cache || {})) {
      if (
        ck.endsWith("waiting-agent-profiles.cjs") ||
        ck.endsWith("profile-service.cjs") ||
        ck.endsWith("profile-ops.cjs") ||
        ck.endsWith("agent-smoke-context.cjs")
      ) {
        delete require.cache[ck];
      }
    }
    if (profileService) {
      const freshProfileService = require("../db/profile-service.cjs");
      Object.assign(profileService, freshProfileService);
      profileService._autoReindexPatched = false;
    }
  } catch {
    /* ignore */
  }

  patchProfileServiceAutoReindex(profileService);

  try {
    globalThis.__STEALTH_ORPHAN_NATIVE_API__ = null;
    globalThis.__STEALTH_TASKBAR_NATIVE_WIN32__ = null;
    const oldOrphanEntries = [];
    const oldCleanupEntries = [];
    const oldShadowEntries = [];
    const oldEngineEntries = [];
    const oldQueryEntries = [];
    const oldGuardEntries = [];
    const oldSyncEntries = [];
    const oldStepsEntries = [];
    const oldPsExecEntries = [];
    for (const ck of Object.keys(require.cache || {})) {
      if (
        ck.endsWith("taskbar-apply-worker.cjs") ||
        ck.endsWith("powershell-exec.cjs") ||
        ck.endsWith("profile-browser-orphan.cjs") ||
        ck.endsWith("profile-chrome-cleanup.cjs") ||
        ck.endsWith("agent-shadow-profile.cjs") ||
        ck.endsWith("cloak-browser-engine.cjs") ||
        ck.endsWith("chrome-process-query.cjs") ||
        ck.endsWith("agent-worker-memory-guard.cjs") ||
        ck.endsWith("profile-cookie-guard.cjs") ||
        ck.endsWith("stealth-multiplatform-sync.cjs") ||
        ck.endsWith("script-steps.cjs") ||
        ck.endsWith("cookie-bridge-store.cjs") ||
        ck.endsWith("cookie-bridge-status.cjs") ||
        ck.endsWith("extensions-status.cjs") ||
        ck.endsWith("native-extension-load.cjs") ||
        ck.endsWith("profile-chrome-preferences.cjs") ||
        ck.endsWith("operator-extension-stage.cjs") ||
        ck.endsWith("cloakbrowser-extension-stage.cjs") ||
        ck.endsWith("webstore-extension.cjs") ||
        ck.endsWith("profile-ops.cjs") ||
        ck.endsWith("app-settings.cjs")
      ) {
        if (ck.endsWith("powershell-exec.cjs") && require.cache[ck]?.exports) {
          oldPsExecEntries.push(require.cache[ck].exports);
        }
        if (ck.endsWith("profile-browser-orphan.cjs") && require.cache[ck]?.exports) {
          oldOrphanEntries.push(require.cache[ck].exports);
        }
        if (ck.endsWith("profile-chrome-cleanup.cjs") && require.cache[ck]?.exports) {
          oldCleanupEntries.push(require.cache[ck].exports);
        }
        if (ck.endsWith("agent-shadow-profile.cjs") && require.cache[ck]?.exports) {
          oldShadowEntries.push(require.cache[ck].exports);
        }
        if (ck.endsWith("cloak-browser-engine.cjs") && require.cache[ck]?.exports) {
          oldEngineEntries.push(require.cache[ck].exports);
        }
        if (ck.endsWith("chrome-process-query.cjs") && require.cache[ck]?.exports) {
          oldQueryEntries.push(require.cache[ck].exports);
        }
        if (ck.endsWith("profile-cookie-guard.cjs") && require.cache[ck]?.exports) {
          oldGuardEntries.push(require.cache[ck].exports);
        }
        if (ck.endsWith("stealth-multiplatform-sync.cjs") && require.cache[ck]?.exports) {
          oldSyncEntries.push(require.cache[ck].exports);
        }
        if (ck.endsWith("script-steps.cjs") && require.cache[ck]?.exports) {
          oldStepsEntries.push(require.cache[ck].exports);
        }
        delete require.cache[ck];
      }
    }

    const propagate = (freshMod, bucket) => {
      for (const oldExp of bucket) {
        if (oldExp && typeof oldExp === "object") {
          Object.assign(oldExp, freshMod);
        }
      }
    };

    propagate(require("../lib/powershell-exec.cjs"), oldPsExecEntries);
    propagate(require("../lib/profile-cookie-guard.cjs"), oldGuardEntries);
    propagate(require("../lib/stealth-multiplatform-sync.cjs"), oldSyncEntries);
    propagate(require("../automation/script-steps.cjs"), oldStepsEntries);
    propagate(require("../lib/chrome-process-query.cjs"), oldQueryEntries);
    const freshOrphan = require("../lib/profile-browser-orphan.cjs");
    propagate(freshOrphan, oldOrphanEntries);
    if (typeof freshOrphan.reapOrphanAdbScrcpyProcessesNative === "function") {
      try {
        freshOrphan.reapOrphanAdbScrcpyProcessesNative({ maxIdleMs: 90_000, viteMaxIdleMs: 30 * 60_000 });
      } catch {
        /* ignore */
      }
    }
    propagate(require("../lib/profile-chrome-cleanup.cjs"), oldCleanupEntries);
    propagate(require("../lib/agent-shadow-profile.cjs"), oldShadowEntries);
    propagate(require("../engine/cloak-browser-engine.cjs"), oldEngineEntries);

    const { startCookieBridgeWorkspaceAutoSync } = require("../lib/cookie-bridge-store.cjs");
    if (typeof startCookieBridgeWorkspaceAutoSync === "function") {
      startCookieBridgeWorkspaceAutoSync(userDataRoot || undefined);
    }
  } catch {
    /* ignore */
  }
}

function patchProfileServiceAutoReindex(profileService) {
  if (!profileService || profileService._autoReindexPatched) return;
  const { getDb } = require("../db/init.cjs");
  const isCorruptErr = (err) => {
    const msg = String(err?.message || err || "");
    return (
      String(err?.code || "") === "SQLITE_CORRUPT" ||
      /database disk image is malformed|missing from index|wrong # of entries in index|row \d+ missing/i.test(msg)
    );
  };
  const reindexNow = () => {
    const db = getDb();
    if (!db || typeof db.exec !== "function") return;
    db.exec(`
      DROP INDEX IF EXISTS idx_profiles_updated_at;
      DROP INDEX IF EXISTS idx_profiles_group_id;
      DROP INDEX IF EXISTS idx_profiles_fingerprint_seed;
      DROP INDEX IF EXISTS idx_profiles_status;
      CREATE INDEX IF NOT EXISTS idx_profiles_group_id ON profiles(group_id);
      CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_profiles_fingerprint_seed ON profiles(fingerprint_seed);
      CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
      REINDEX;
    `);
  };
  for (const k of Object.keys(profileService)) {
    const orig = profileService[k];
    if (typeof orig === "function" && !orig._autoReindexWrapped) {
      const wrapped = function autoReindexWrapped(...args) {
        try {
          return orig.apply(this, args);
        } catch (err) {
          if (isCorruptErr(err)) {
            try {
              reindexNow();
            } catch {
              throw err;
            }
            return orig.apply(this, args);
          }
          throw err;
        }
      };
      wrapped._autoReindexWrapped = true;
      profileService[k] = wrapped;
    }
  }
  profileService._autoReindexPatched = true;
}

function startDevLiveVersionWatcher(sessionManager) {
  if (!sessionManager || sessionManager._devLiveVersionWatcherV1) return;
  sessionManager._devLiveVersionWatcherV1 = true;
  try {
    const { app, BrowserWindow } = require("electron");
    const isDevRuntime = !app?.isPackaged || process.env.STEALTH_DEV_ISOLATED === "1";
    if (!isDevRuntime) return;
    const repoPkgPath = "E:\\Dev\\Tool\\P0003-Stealth-Browser-Console\\package.json";
    const repoDistIndex = "E:\\Dev\\Tool\\P0003-Stealth-Browser-Console\\dist\\index.html";
    let lastSeenVer = "";
    let lastDistMtime = 0;
    const pollDevLiveVersion = async () => {
      try {
        if (!fs.existsSync(repoPkgPath)) return;
        const diskVer = String(JSON.parse(fs.readFileSync(repoPkgPath, "utf8"))?.version || "").trim();
        const distMtime = fs.existsSync(repoDistIndex) ? fs.statSync(repoDistIndex).mtimeMs : 0;
        const verChanged = Boolean(diskVer && diskVer !== lastSeenVer);
        const distChanged = Boolean(distMtime > 0 && lastDistMtime > 0 && distMtime > lastDistMtime);
        if (diskVer) lastSeenVer = diskVer;
        if (distMtime > 0) lastDistMtime = distMtime;
        if (!verChanged && !distChanged) return;
        for (const win of BrowserWindow.getAllWindows()) {
          if (win.isDestroyed()) continue;
          if (distChanged && fs.existsSync(repoDistIndex)) {
            await win.loadFile(repoDistIndex).catch(() => {});
          }
          if (diskVer) {
            win.webContents
              .executeJavaScript(
                `window.__HUB_ELECTRON_VERSION__ = ${JSON.stringify(diskVer)}; window.dispatchEvent(new Event("hub:electron-dev-ready"));`,
                true,
              )
              .catch(() => {});
          }
        }
      } catch {
        /* ignore */
      }
    };
    const timer = setInterval(() => {
      void pollDevLiveVersion();
    }, 2500);
    if (typeof timer.unref === "function") timer.unref();
    void pollDevLiveVersion();
  } catch {
    /* standalone node worker has no electron */
  }
}

function createRouteRuntimeHelpers({ sessionManager, profileService, userDataRoot, send }) {
  function screenshotsRoot() {
    return (typeof userDataRoot === "function" ? userDataRoot() : userDataRoot) || path.join(os.tmpdir(), "stealth-browser-api");
  }

  function resolveUserDataRoot() {
    return typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
  }

  async function ensureProfileContext(profileId, { skipStartupUrl = false } = {}) {
    const profile = profileService.getProfile(profileId);
    if (!profile) throw new Error("Profile không tồn tại");
    try {
      const { touchWorkerSessionActivity } = require("../lib/agent-worker-memory-guard.cjs");
      touchWorkerSessionActivity(profile.id);
    } catch {
      /* ignore */
    }
    if (skipStartupUrl) {
      const context = await sessionManager.ensureAutomationContext(profile);
      return { profile, context };
    }
    if (!sessionManager.isRunning(profileId)) {
      await sessionManager.launch(profile, { skipStartupUrl: false });
    } else {
      await sessionManager.focusProfile(profileId);
    }
    await sessionManager.awaitLaunchNavigation(profileId);
    const context = sessionManager.getContext(profileId);
    if (!context) throw new Error("Không lấy được browser context — launch profile trước");
    return { profile, context };
  }

  function resolveProfileId(body) {
    return resolveProfileIdOp(profileService, body || {});
  }

  async function performOpenUrl(rawBody, emit = () => {}) {
    const profileId = resolveProfileIdOp(profileService, rawBody);
    if (!profileId) throw new Error("profile_id hoặc profile_name là bắt buộc");
    const safe = validateOpenUrlPayload({
      profileId,
      targetUrl: rawBody.target_url ?? rawBody.targetUrl,
      screenshot: rawBody.screenshot !== false,
      closeWhenDone: Boolean(rawBody.close_when_done ?? rawBody.closeWhenDone),
      agentTask: Boolean(rawBody.agent_task ?? rawBody.agentTask),
      headless: rawBody.headless !== undefined ? Boolean(rawBody.headless) : undefined,
      workflowAction: rawBody.workflow_action ?? rawBody.workflowAction,
      workflowId: rawBody.workflow_id ?? rawBody.workflowId,
      steps: rawBody.steps,
      inspectMode: Boolean(rawBody.inspect_mode ?? rawBody.inspectMode),
    });
    emit({ event: "progress", msg: `Mở URL: ${safe.targetUrl}` });
    const profile = profileService.getProfile(safe.profileId);
    if (!profile) throw new Error("Profile không tồn tại");
    await preflightMailCredentials(profile, safe.steps);
    return performOpenUrlOp(
      { sessionManager, profileService, userDataRoot: screenshotsRoot() },
      safe,
      { emit },
    );
  }

  const jobRunners = {
    "open-url": (payload, emit) => performOpenUrl(payload || {}, emit),
    "fb-create-pages": async (payload, emit) => {
      const names = Array.isArray(payload?.names) ? payload.names : [];
      const profileId = resolveProfileId(payload || {});
      if (!profileId || !names.length) throw new Error("profile_id và names[] là bắt buộc");
      const { context } = await ensureProfileContext(profileId);
      const { createFacebookPage } = require("../automation/facebook.cjs");
      const out = [];
      for (let i = 0; i < names.length; i += 1) {
        const name = String(names[i]).trim();
        if (!name) continue;
        emit({ event: "progress", index: i + 1, total: names.length, name, step: "creating" });
        try {
          const r = await createFacebookPage(context, name);
          out.push({ name, ok: true, url: r.url });
          emit({ event: "progress", index: i + 1, total: names.length, name, step: "done", url: r.url });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          out.push({ name, ok: false, error: msg });
          emit({ event: "progress", index: i + 1, total: names.length, name, step: "error", error: msg });
        }
      }
      return { ok: true, results: out };
    },
  };

  function patchProfileHandler(ctx) {
    const profileId = ctx.params[1];
    const body = ctx.body && typeof ctx.body === "object" ? ctx.body : {};
    const isAgentRequest = Boolean(
      body.allowStaticIpPin !== true &&
        (parseAgentSmokeFlag(ctx.req, body) || isAgentSmokeLaunch() || body.staticIp === true || body.staticIp === 1),
    );
    return patchProfileOp(
      { profileService },
      profileId,
      body,
      {
        userDataRoot: (typeof userDataRoot === "function" ? userDataRoot() : userDataRoot) || path.join(os.tmpdir(), "stealth-browser-api"),
        isAgentRequest,
      },
    )
      .then((profile) => send.json(ctx.res, 200, { ok: true, profile }))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "Profile not found.") {
          return send.json(ctx.res, 404, { ok: false, error: "Profile không tồn tại" });
        }
        if (message === "Empty patch body.") {
          return send.json(ctx.res, 400, { ok: false, error: "Body rỗng — không có field nào để cập nhật" });
        }
        return send.json(ctx.res, 400, { ok: false, error: message });
      });
  }

  return {
    electronDir: ELECTRON_DIR,
    productRoot: PRODUCT_ROOT,
    screenshotsRoot,
    resolveUserDataRoot,
    ensureProfileContext,
    resolveProfileId,
    performOpenUrl,
    jobRunners,
    patchProfileHandler,
  };
}

module.exports = {
  ELECTRON_DIR,
  PRODUCT_ROOT,
  SOCIAL_HUB_DATA_DIR,
  PRIORITY_AGENT_LOCKS_PATH,
  ACTIVE_AGENT_LOCKS_PATH,
  stepsNeedMailCredentials,
  resolveMailVaultService,
  preflightMailCredentials,
  isPidAlive,
  createLockGuardState,
  createDeferredAgentQueueHelpers,
  refreshCoreRouteModuleCaches,
  patchProfileServiceAutoReindex,
  startDevLiveVersionWatcher,
  createRouteRuntimeHelpers,
};
