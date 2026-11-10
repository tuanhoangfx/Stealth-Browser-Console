"use strict";
/**
 * BrowserHub route registry.
 *
 * Core routes (profile lifecycle, CDP passthrough, jobs) + domain plugins (fb/meta)
 * gộp thành một mảng descriptor. Dispatcher trong api-server.cjs duyệt mảng này —
 * thêm route mới = thêm descriptor, không sửa dispatcher.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { domainPlugins } = require("./automation/plugins.cjs");
const { validateOpenUrlPayload } = require("./ipc-contracts.cjs");
const {
  launchProfile: launchProfileOp,
  patchProfile: patchProfileOp,
  performOpenUrl: performOpenUrlOp,
  resolveProfileId: resolveProfileIdOp,
} = require("./services/profile-ops.cjs");
const {
  checkProxy,
  geoConsistency,
  loadVpnProxyPoolModule,
  parseCountryProxySpec,
  resolveProfileCountryProxy,
} = require("./lib/proxy-pool.cjs");
const { extractProfileCode } = require("./lib/profile-code.cjs");
const { isAgentSmokeLaunch } = require("./lib/agent-smoke-mode.cjs");
const { parseAgentSmokeFlag, parseAgentCallerId, runWithAgentSmokeRequest, getAgentCallerId, normalizeAgentCallerId } = require("./lib/agent-smoke-context.cjs");
const { diagnoseMailCredentials } = require("./lib/twofa-vault-bridge.cjs");
const { getStealthSyncDiagnostics } = require("./lib/stealth-sync-outbox.cjs");

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

/**
 * @param {{ sessionManager, profileService, jobQueue, userDataRoot, send }} services
 */
function buildRoutes(services) {
  const { sessionManager, profileService, jobQueue, userDataRoot, send } = services;
  global.__stealthSessionManager = sessionManager;
  global.__stealthJobQueue = jobQueue;

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
      const freshProfileService = require("./db/profile-service.cjs");
      Object.assign(profileService, freshProfileService);
      profileService._autoReindexPatched = false;
    }
  } catch {
    /* ignore */
  }

  if (profileService && !profileService._autoReindexPatched) {
    const { getDb } = require("./db/init.cjs");
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
    const freshPsExec = require("./lib/powershell-exec.cjs");
    for (const oldExp of oldPsExecEntries) {
      if (oldExp && typeof oldExp === "object") {
        Object.assign(oldExp, freshPsExec);
      }
    }
    const freshGuard = require("./lib/profile-cookie-guard.cjs");
    for (const oldExp of oldGuardEntries) {
      if (oldExp && typeof oldExp === "object") {
        Object.assign(oldExp, freshGuard);
      }
    }
    const freshSync = require("./lib/stealth-multiplatform-sync.cjs");
    for (const oldExp of oldSyncEntries) {
      if (oldExp && typeof oldExp === "object") {
        Object.assign(oldExp, freshSync);
      }
    }
    const freshSteps = require("./automation/script-steps.cjs");
    for (const oldExp of oldStepsEntries) {
      if (oldExp && typeof oldExp === "object") {
        Object.assign(oldExp, freshSteps);
      }
    }
    const freshQuery = require("./lib/chrome-process-query.cjs");
    for (const oldExp of oldQueryEntries) {
      if (oldExp && typeof oldExp === "object") {
        Object.assign(oldExp, freshQuery);
      }
    }
    const freshOrphan = require("./lib/profile-browser-orphan.cjs");
    for (const oldExp of oldOrphanEntries) {
      if (oldExp && typeof oldExp === "object") {
        Object.assign(oldExp, freshOrphan);
      }
    }
    if (typeof freshOrphan.reapOrphanAdbScrcpyProcessesNative === "function") {
      try {
        freshOrphan.reapOrphanAdbScrcpyProcessesNative({ maxIdleMs: 90_000, viteMaxIdleMs: 30 * 60_000 });
      } catch {
        /* ignore */
      }
    }
    const freshCleanup = require("./lib/profile-chrome-cleanup.cjs");
    for (const oldExp of oldCleanupEntries) {
      if (oldExp && typeof oldExp === "object") {
        Object.assign(oldExp, freshCleanup);
      }
    }
    const freshShadow = require("./lib/agent-shadow-profile.cjs");
    for (const oldExp of oldShadowEntries) {
      if (oldExp && typeof oldExp === "object") {
        Object.assign(oldExp, freshShadow);
      }
    }
    const freshEngine = require("./engine/cloak-browser-engine.cjs");
    for (const oldExp of oldEngineEntries) {
      if (oldExp && typeof oldExp === "object") {
        Object.assign(oldExp, freshEngine);
      }
    }
    const { startCookieBridgeWorkspaceAutoSync } = require("./lib/cookie-bridge-store.cjs");
    if (typeof startCookieBridgeWorkspaceAutoSync === "function") {
      startCookieBridgeWorkspaceAutoSync(userDataRoot || undefined);
    }
  } catch {
    /* ignore */
  }

  let isCodePriorityLocked = () => false;
  let isCodeLockedByActiveAgent = () => false;

  if (sessionManager && typeof sessionManager.launch === "function") {
    const activityMap = sessionManager._liveActivityMap || new Map();
    sessionManager._liveActivityMap = activityMap;
    const deferredMap = sessionManager._deferredAgentTasksMap || new Map();
    sessionManager._deferredAgentTasksMap = deferredMap;
    const waitingHeadlessIds = sessionManager._waitingHeadlessIds || new Set();
    sessionManager._waitingHeadlessIds = waitingHeadlessIds;
    const recentHeadlessMap = globalThis.__STEALTH_RECENT_HEADLESS_PROFILE_IDS__ || new Map();
    globalThis.__STEALTH_RECENT_HEADLESS_PROFILE_IDS__ = recentHeadlessMap;
    let headlessLaunchTail = Promise.resolve();
    let lastHeadlessLaunchAt = 0;
    let hotPatchGroupSeq = 0;

    // Preserve bound methods of the original boot-time SessionManager so any currently open
    // User Headed windows (`headless: false`) remain untouched, while delegating all new
    // launches to a freshly instantiated UnifiedSessionManager from `./engine/session-manager.cjs`
    // where `#shouldUseAgentShadowLane` returns `false` (Single-Directory Unified Cookie Store).
    const safeBind = (fn, fallback = () => undefined) =>
      typeof fn === "function" ? fn.bind(sessionManager) : fallback;
    const legacySm = sessionManager._legacySm || {
      launch: safeBind(sessionManager._origLaunch || sessionManager.launch),
      close: safeBind(sessionManager._origClose || sessionManager.close),
      listRunning: safeBind(sessionManager._origListRunning || sessionManager.listRunning, () => []),
      isRunning: safeBind(sessionManager._origIsRunning || sessionManager.isRunning, () => false),
      getCdpInfo: safeBind(sessionManager._origGetCdpInfo || sessionManager.getCdpInfo),
      getDebugPort: safeBind(sessionManager._origGetDebugPort || sessionManager.getDebugPort, () => 0),
      getContext: safeBind(sessionManager._origGetContext || sessionManager.getContext, () => null),
      ensureAutomationContext: safeBind(
        sessionManager._origEnsureAutomationContext || sessionManager.ensureAutomationContext,
      ),
      awaitLaunchNavigation: safeBind(
        sessionManager._origAwaitLaunchNavigation || sessionManager.awaitLaunchNavigation,
      ),
      isUserInteractiveSession: safeBind(
        sessionManager._origIsUserInteractiveSession || sessionManager.isUserInteractiveSession,
        () => false,
      ),
      isAgentShadowRunning: safeBind(
        sessionManager._origIsAgentShadowRunning || sessionManager.isAgentShadowRunning,
        () => false,
      ),
      minimizeProfile: safeBind(sessionManager._origMinimizeProfile || sessionManager.minimizeProfile),
      focusProfile: safeBind(sessionManager._origFocusProfile || sessionManager.focusProfile),
      getActiveVpnCountry: safeBind(
        sessionManager._origGetActiveVpnCountry || sessionManager.getActiveVpnCountry,
        () => "",
      ),
    };
    sessionManager._legacySm = legacySm;

    for (const ck of Object.keys(require.cache || {})) {
      if (
        ck.endsWith("session-manager.cjs") ||
        ck.endsWith("agent-shadow-profile.cjs") ||
        ck.endsWith("profile-browser-orphan.cjs") ||
        ck.endsWith("agent-worker-memory-guard.cjs")
      ) {
        delete require.cache[ck];
      }
    }
    const { SessionManager: UnifiedSessionManager } = require("./engine/session-manager.cjs");
    const resolvedRoot =
      typeof userDataRoot === "function"
        ? userDataRoot()
        : String(userDataRoot || process.env.STEALTH_USER_DATA || "D:\\StealthBrowser");
    const prevSm = sessionManager._unifiedSmV14 || sessionManager._unifiedSmV13 || sessionManager._unifiedSmV12 || null;
    const unifiedSm = new UnifiedSessionManager();
    unifiedSm.setUserDataRoot(resolvedRoot);
    if (prevSm && typeof unifiedSm.adoptLiveSessionsFrom === "function") {
      unifiedSm.adoptLiveSessionsFrom(prevSm);
    }
    sessionManager._unifiedSmV14 = unifiedSm;
    sessionManager._unifiedSmV12 = unifiedSm;
    try {
      for (const r of unifiedSm.listRunning() || []) {
        const rid = String(r.id || r.profileId || "");
        if (!rid) continue;
        const ctx = unifiedSm.getContext(rid);
        if (ctx) {
          ctx.__stealthProfileId = rid;
          ctx.__stealthProfileCode = extractProfileCode(r.name || "", rid) || "";
          ctx.__stealthUserDataDir = String(r.userDataDir || "");
        }
      }
    } catch {
      /* ignore */
    }

    // Immediately drain & close any legacy `%TEMP%\p0003-agent-shadow` (`shadowLane: true`) sessions
    // still sitting in the boot-time SessionManager (syncing their cookies back to `D:\StealthBrowser\profiles\<id>`).
    if (!sessionManager._legacyShadowDrainedV1) {
      sessionManager._legacyShadowDrainedV1 = true;
      setImmediate(async () => {
        try {
          const legacyRows = legacySm.listRunning() || [];
          for (const r of legacyRows) {
            const rid = String(r.id || r.profileId || "");
            if (!rid) continue;
            if (r.shadowLane === true || (r.headless === true && String(r.userDataDir || "").includes("p0003-agent-shadow"))) {
              await legacySm.close(rid, { agentOnly: true, force: true }).catch(() => undefined);
            }
          }
        } catch {
          /* ignore */
        }
      });
    }

    let _legacyHeadedCache = { at: 0, set: new Set() };
    const hasLegacyHeadedSession = (id) => {
      try {
        const sid = String(id || "");
        if (!sid) return false;
        const now = Date.now();
        if (now - _legacyHeadedCache.at > 250) {
          const rows = legacySm.listRunning() || [];
          const next = new Set();
          for (const r of rows) {
            if (r.headless !== true && r.shadowLane !== true) {
              const rid = String(r.id || r.profileId || "");
              if (rid) next.add(rid);
            }
          }
          _legacyHeadedCache = { at: now, set: next };
        }
        return _legacyHeadedCache.set.has(sid);
      } catch {
        return false;
      }
    };

    const waitHeadlessSlot = async () => {
      const prev = headlessLaunchTail;
      let release;
      headlessLaunchTail = new Promise((r) => {
        release = r;
      });
      try {
        await prev;
        const elapsed = Date.now() - lastHeadlessLaunchAt;
        if (elapsed < 350) {
          await new Promise((r) => setTimeout(r, 350 - elapsed));
        }
        lastHeadlessLaunchAt = Date.now();
      } finally {
        release();
      }
    };

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

    const persistDeferredFile = (extraReadyItem = null) => {
      try {
        const dir = "E:\\Dev\\Tool\\P0002-Social-Hub\\data";
        if (!fs.existsSync(dir)) return;
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
        const pending = [...deferredMap.values()];
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
      } catch {
        /* ignore */
      }
    };

    const removeReadyDeferredEntry = (codeOrId) => {
      try {
        const fp = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\deferred-user-headed-queue.json";
        if (!fs.existsSync(fp)) return;
        const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) || {};
        if (!Array.isArray(parsed.readyForRetry)) return;
        const nextReady = parsed.readyForRetry.filter(
          (x) => x?.code !== codeOrId && x?.profileId !== codeOrId,
        );
        fs.writeFileSync(
          fp,
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
    };

    const triggerDeferredExpiredOrderDrain = (codeOrId) => {
      try {
        const rawCode = String(codeOrId || "").replace(/^#/, "").trim();
        const code4 = /^\d{1,4}$/.test(rawCode) ? rawCode.padStart(4, "0") : "";
        const queuePath = "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\deferred-user-headed-queue.json";
        if (!fs.existsSync(queuePath)) return;
        const raw = fs.readFileSync(queuePath, "utf8").trim();
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
        if (list.length === 0) return;
        const hasMatch =
          !code4 ||
          list.some((x) => String(x?.profileSlot || x?.code || "").replace(/^#/, "").padStart(4, "0") === code4);
        if (!hasMatch) return;
        const { startHiddenDetachedProcess } = require("../../../scripts/lib/win-shell-env.cjs");
        const scriptPath = "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\revoke-expired-action-orders.mjs";
        if (!fs.existsSync(scriptPath)) return;
        const args = [scriptPath, "--drain-deferred"];
        if (code4) args.push(code4);
        args.push("--apply", "--telegram");
        startHiddenDetachedProcess("E:\\Dev\\.tools\\nodew.exe", args, {
          cwd: "E:\\Dev",
          pidFile: "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\deferred-order-drain.pid",
          logFile: "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\deferred-order-drain.log",
          env: { ...process.env, STEALTH_AGENT_CALLER: "agent:deferred-order-drain" },
        });
      } catch {
        /* ignore */
      }
    };

    const scheduleDeferredAgentAutoDrain = (defEntry) => {
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
    };

    sessionManager.enqueueDeferredAgentTask = function hotPatchedEnqueueDeferred(profileId, { reason = "user_interactive_session" } = {}) {
      const id = String(profileId || "").trim();
      if (!id) return null;
      const prof = profileService?.getProfile?.(id);
      const code = extractProfileCode(prof?.name || "", id);
      const prev = deferredMap.get(id);
      const entry = {
        profileId: id,
        code: code || id,
        firstDeferredAt: prev?.firstDeferredAt || Date.now(),
        lastDeferredAt: Date.now(),
        count: (prev?.count || 0) + 1,
        reason: String(reason || "user_interactive_session"),
      };
      deferredMap.set(id, entry);
      persistDeferredFile();
      return entry;
    };

    sessionManager.listDeferredAgentTasks = function hotPatchedListDeferred() {
      return [...deferredMap.values()];
    };

    const _lockFileCache = new Map();
    const readCachedLockJson = (fp, ttlMs = 2000) => {
      const now = Date.now();
      const hit = _lockFileCache.get(fp);
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
      _lockFileCache.set(fp, { at: now, data });
      return data;
    };

    isCodePriorityLocked = (codeStr, callerPid = 0, profileId = "") => {
      const hasCode = Boolean(codeStr && /^\d{4,5}$/.test(codeStr));
      const hasId = Boolean(profileId && String(profileId).length >= 8);
      if (!hasCode && !hasId) return false;
      const now = Date.now();
      try {
        const fp = path.join("E:\\Dev\\Tool\\P0002-Social-Hub\\data", "priority-agent-locks.json");
        const parsed = readCachedLockJson(fp);
        if (!parsed) return false;
        const locks = parsed && typeof parsed.locks === "object" && parsed.locks ? parsed.locks : {};
        let val = hasCode ? (locks[codeStr] || parsed[codeStr]) : null;
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
    };

    isCodeLockedByActiveAgent = (codeStr, profileId = "") => {
      const hasCode = Boolean(codeStr && /^\d{4,5}$/.test(codeStr));
      const hasId = Boolean(profileId && String(profileId).length >= 8);
      if (!hasCode && !hasId) return false;
      if (isCodePriorityLocked(codeStr, 0, profileId)) return true;
      const now = Date.now();
      try {
        for (const fileName of ["active-agent-locks.json", "priority-agent-locks.json"]) {
          try {
            const fp = path.join("E:\\Dev\\Tool\\P0002-Social-Hub\\data", fileName);
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
    };

    const origUnifiedClose = unifiedSm._origClose || unifiedSm.close.bind(unifiedSm);
    unifiedSm._origClose = origUnifiedClose;
    unifiedSm.close = async function hotPatchedUnifiedClose(profileId, opts = {}) {
      const pid = String(profileId || "");
      try {
        const prof = profileService?.getProfile?.(pid);
        const code = extractProfileCode(prof?.name || "", pid) || "";
        if (!opts?.forcePriority && isCodePriorityLocked(code, opts?.callerPid, pid)) {
          return { ok: true, skipped: "priority_agent_locked", status: "running", code };
        }
      } catch {
        /* ignore */
      }
      return origUnifiedClose(pid, opts);
    };

    sessionManager.isUserInteractiveSession = function hotPatchedIsUserInteractive(profileId) {
      const id = String(profileId || "");
      return Boolean(hasLegacyHeadedSession(id) || unifiedSm.isUserInteractiveSession(id));
    };

    sessionManager.isRunning = function hotPatchedIsRunning(profileId) {
      const id = String(profileId || "");
      return Boolean(hasLegacyHeadedSession(id) || unifiedSm.isRunning(id));
    };

    sessionManager.isAgentShadowRunning = function hotPatchedIsAgentShadowRunning(profileId) {
      const id = String(profileId || "");
      return Boolean(unifiedSm.isAgentShadowRunning(id));
    };

    sessionManager.getDebugPort = function hotPatchedGetDebugPort(profileId) {
      const id = String(profileId || "");
      if (hasLegacyHeadedSession(id) && !isAgentSmokeLaunch()) {
        return legacySm.getDebugPort(id);
      }
      return unifiedSm.getDebugPort(id);
    };

    sessionManager.getContext = function hotPatchedGetContext(profileId, opts = {}) {
      const id = String(profileId || "");
      if (hasLegacyHeadedSession(id) && !isAgentSmokeLaunch() && !opts?.preferAgent) {
        return legacySm.getContext(id, opts);
      }
      return unifiedSm.getContext(id, opts);
    };

    sessionManager.getActiveVpnCountry = function hotPatchedGetActiveVpnCountry(profileId) {
      const id = String(profileId || "");
      if (hasLegacyHeadedSession(id)) {
        return legacySm.getActiveVpnCountry(id);
      }
      return unifiedSm.getActiveVpnCountry(id);
    };

    sessionManager.minimizeProfile = async function hotPatchedMinimizeProfile(profileId) {
      const id = String(profileId || "");
      if (hasLegacyHeadedSession(id)) {
        return legacySm.minimizeProfile(id);
      }
      return unifiedSm.minimizeProfile(id);
    };

    sessionManager.focusProfile = async function hotPatchedFocusProfile(profileId) {
      const id = String(profileId || "");
      if (hasLegacyHeadedSession(id)) {
        return legacySm.focusProfile(id);
      }
      return unifiedSm.focusProfile(id);
    };

    sessionManager.awaitLaunchNavigation = async function hotPatchedAwaitLaunchNavigation(profileId, opts = {}) {
      const id = String(profileId || "");
      if (hasLegacyHeadedSession(id) && !isAgentSmokeLaunch() && !opts?.preferAgent) {
        return legacySm.awaitLaunchNavigation(id, opts);
      }
      return unifiedSm.awaitLaunchNavigation(id, opts);
    };

    sessionManager.getCdpInfo = async function hotPatchedGetCdpInfo(profileId, opts = {}) {
      const id = String(profileId || "");
      const isAgentCaller = Boolean(opts?.preferAgent || isAgentSmokeLaunch());
      if (hasLegacyHeadedSession(id)) {
        if (isAgentCaller && process.env.STEALTH_ALLOW_AGENT_ON_USER_HEADED !== "1") {
          sessionManager.enqueueDeferredAgentTask(id, { reason: "agent_cdp_while_user_headed" });
          return {
            ok: false,
            reason: "user_interactive_session",
            skipped: "user_interactive_session",
            headless: false,
          };
        }
        return legacySm.getCdpInfo(id, opts);
      }
      return unifiedSm.getCdpInfo(id, opts);
    };

    const enforceHotPatchHeadlessCap = async (keepId, callerIdInput = "") => {
      let MAX_HEADLESS_CAP = 40;
      try {
        const { getMaxHeadlessSessions } = require("./lib/app-settings.cjs");
        MAX_HEADLESS_CAP = getMaxHeadlessSessions();
      } catch {
        /* fallback */
      }
      const MAX_PER_CALLER = Math.max(
        1,
        Math.min(10, Number(process.env.STEALTH_MAX_HEADLESS_PER_CALLER || 3) || 3),
      );
      const callerId = normalizeAgentCallerId(callerIdInput || getAgentCallerId() || "agent:inline");
      try {
        const rows = sessionManager.listRunning() || [];
        const now = Date.now();
        const candidates = [];
        const callerCandidates = [];
        for (const r of Array.isArray(rows) ? rows : []) {
          const rid = String(r.id || r.profileId || "");
          if (!rid || rid === keepId) continue;
          if (r.headless !== true && r.shadowLane !== true) continue;
          const code = extractProfileCode(r.name || "", rid) || "";
          const num = Number(code);
          if (
            !r.shadowLane &&
            ((Number.isInteger(num) && ((num >= 1 && num <= 21) || num === 59 || num === 69 || num === 120 || num === 4220 || (num >= 8000 && num < 9000))) ||
              sessionManager.isUserInteractiveSession(rid))
          ) {
            continue;
          }
          const rec = activityMap.get(rid);
          const launchedAt = Number(r.launchedAt || rec?.launchedAt || 0);
          const lastActive = Number(r.lastActivityAt || rec?.lastActivityAt || launchedAt || 0);
          const rowCallerId = normalizeAgentCallerId(r.callerId || rec?.callerId || "agent:inline");
          const priorityLocked = Boolean(
            isCodePriorityLocked(code, 0, rid) || globalThis.__stealthActiveOpenUrlProfiles?.has(rid),
          );
          const supportChatProtected = Boolean(r.supportChatProtected);
          const cand = {
            id: rid,
            code,
            lastActive,
            launchedAt,
            locked: isCodeLockedByActiveAgent(code, rid),
            priorityLocked,
            supportChatProtected,
            shadowLane: Boolean(r.shadowLane),
            callerId: rowCallerId,
          };
          if (rowCallerId === callerId && !supportChatProtected) {
            callerCandidates.push(cand);
          }
          if (launchedAt > 0 && now - launchedAt < 6_000) continue;
          if (Number.isInteger(num) && num >= 9000 && num <= 9999 && now - lastActive < 180_000) continue;
          if (priorityLocked || supportChatProtected) continue;
          candidates.push(cand);
        }
        const evictedIds = new Set();
        if (callerCandidates.length >= MAX_PER_CALLER) {
          callerCandidates.sort((a, b) => {
            if (a.priorityLocked !== b.priorityLocked) return a.priorityLocked ? 1 : -1;
            if (a.locked !== b.locked) return a.locked ? 1 : -1;
            return a.lastActive - b.lastActive;
          });
          const oldest = callerCandidates[0];
          const shouldThrottle = Boolean(oldest && now - oldest.lastActive < 20_000);
          const callerToEvict = callerCandidates.slice(0, callerCandidates.length - MAX_PER_CALLER + 1);
          for (const item of callerToEvict) {
            evictedIds.add(item.id);
            try {
              for (const lockFp of [
                "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\active-agent-locks.json",
              ]) {
                if (fs.existsSync(lockFp)) {
                  const parsed = JSON.parse(fs.readFileSync(lockFp, "utf8")) || {};
                  if (parsed.locks && typeof parsed.locks === "object") {
                    const normC = item.code ? String(item.code).padStart(4, "0") : "";
                    if (normC) delete parsed.locks[normC];
                    for (const [k, v] of Object.entries(parsed.locks)) {
                      if (v && typeof v === "object" && String(v.stealthId || "") === item.id) {
                        delete parsed.locks[k];
                      }
                    }
                    fs.writeFileSync(lockFp, JSON.stringify(parsed, null, 2), "utf8");
                  }
                }
              }
              _lockFileCache.clear();
            } catch {
              /* ignore */
            }
            await unifiedSm
              .close(item.id, {
                force: true,
                forcePriority: !item.priorityLocked,
                agentOnly: item.shadowLane,
                ignoreIfUserInteractive: true,
              })
              .catch(() => undefined);
          }
          // Anti-thrash backoff AFTER closing the oldest profile so caller count never exceeds 3:
          if (shouldThrottle) {
            await new Promise((r) => setTimeout(r, 4500));
          }
        }
        const remaining = candidates.filter((c) => !evictedIds.has(c.id));
        if (remaining.length < MAX_HEADLESS_CAP) return;
        remaining.sort((a, b) => {
          if (a.locked !== b.locked) return a.locked ? 1 : -1;
          return a.lastActive - b.lastActive;
        });
        const toEvict = remaining.slice(0, remaining.length - MAX_HEADLESS_CAP + 1);
        for (const item of toEvict) {
          await unifiedSm
            .close(item.id, {
              force: true,
              agentOnly: item.shadowLane,
              ignoreIfUserInteractive: true,
            })
            .catch(() => undefined);
        }
      } catch {
        /* ignore */
      }
    };

    sessionManager.launch = async function hotPatchedLaunch(profile, opts = {}) {
      const id = String(profile?.id || "");
      const isAgentOrHeadless = Boolean(isAgentSmokeLaunch() || profile?.headless === true);
      const callerId = isAgentOrHeadless
        ? normalizeAgentCallerId(profile?.callerId || opts?.callerId || getAgentCallerId() || "agent:inline")
        : "";
      if (id) {
        if (isAgentOrHeadless) {
          recentHeadlessMap.set(id, Date.now());
        } else {
          recentHeadlessMap.delete(id);
        }
      }
      if (
        isAgentOrHeadless &&
        sessionManager.isUserInteractiveSession(id) === true &&
        process.env.STEALTH_ALLOW_AGENT_ON_USER_HEADED !== "1" &&
        process.env.STEALTH_FORCE_TEMP_SHADOW_DIR !== "1"
      ) {
        sessionManager.enqueueDeferredAgentTask(id, { reason: "agent_launch_while_user_headed" });
        const currentProfile = profileService?.getProfile?.(id) || profile;
        return {
          ok: false,
          skipped: "user_interactive_session",
          error: "user_interactive_session_active",
          status: "running",
          profile: currentProfile,
          debugPort: 0,
          focused: false,
          headless: false,
          visibilityMode: "headed",
        };
      }
      let targetWorkArea = null;
      if (!isAgentOrHeadless) {
        try {
          const { resolveTargetDisplayWorkArea } = require("./lib/app-settings.cjs");
          targetWorkArea = resolveTargetDisplayWorkArea(profile?.targetMonitor)?.workArea || null;
        } catch {
          /* ignore */
        }
      }
      if (!isAgentOrHeadless && hasLegacyHeadedSession(id)) {
        const legRes = await legacySm.launch(profile, opts);
        if (targetWorkArea) {
          try {
            const { moveChromeWindowsToTargetWorkAreaNative } = require("./lib/taskbar-apply-worker.cjs");
            moveChromeWindowsToTargetWorkAreaNative(targetWorkArea, {
              code: extractProfileCode(profile?.name || "", id),
              maximize: true,
            });
          } catch {
            /* ignore */
          }
        }
        return legRes;
      }
      const alreadyRunning = Boolean(id && unifiedSm.isRunning(id));
      if (alreadyRunning) {
        const now = Date.now();
        const prev = activityMap.get(id);
        activityMap.set(id, {
          launchedAt: prev?.launchedAt || now,
          lastActivityAt: now,
          callerId: callerId || normalizeAgentCallerId(prev?.callerId || "agent:inline"),
        });
      } else if (isAgentOrHeadless) {
        if (id) waitingHeadlessIds.add(id);
        try {
          const upSec = typeof os.uptime === "function" ? os.uptime() : 999;
          if (upSec < 90 && process.env.STEALTH_SKIP_BOOT_COOLDOWN !== "1") {
            const bootWaitMs = Math.min(45_000, Math.max(2_000, Math.round((90 - upSec) * 1000)));
            await new Promise((r) => setTimeout(r, bootWaitMs));
          }
          await waitHeadlessSlot();
          await enforceHotPatchHeadlessCap(id, callerId);
        } catch (err) {
          if (id) waitingHeadlessIds.delete(id);
          throw err;
        }
      }
      const cleanedProfile =
        process.env.STEALTH_FORCE_TEMP_SHADOW_DIR === "1"
          ? { ...profile, ...(isAgentOrHeadless ? { headless: true, callerId } : {}) }
          : { ...profile, shadowLane: false, ...(isAgentOrHeadless ? { headless: true, callerId } : {}) };
      if (!isAgentOrHeadless && targetWorkArea && Number.isFinite(targetWorkArea.x) && Number.isFinite(targetWorkArea.y)) {
        const winMode = String(cleanedProfile.windowMode || "host-maximized").toLowerCase();
        const extraArgs = Array.isArray(cleanedProfile.extraChromeArgs)
          ? cleanedProfile.extraChromeArgs.filter((a) => !String(a).startsWith("--window-position="))
          : [];
        if (winMode !== "host-maximized") {
          extraArgs.push(`--window-position=${targetWorkArea.x + 32},${targetWorkArea.y + 24}`);
        }
        cleanedProfile.extraChromeArgs = extraArgs;
        if (id && resolvedRoot) {
          try {
            const { resolveProfileUserDataDir } = require("./lib/profiles-location.cjs");
            const { markProfileChromeCleanExit } = require("./lib/profile-chrome-session.cjs");
            const uDir = resolveProfileUserDataDir(resolvedRoot, id);
            markProfileChromeCleanExit(uDir, {
              targetWorkArea,
              windowMode: cleanedProfile.windowMode || "host-maximized",
            });
          } catch {
            /* ignore */
          }
        }
      }
      let res;
      try {
        if (!isAgentOrHeadless && !alreadyRunning && id && resolvedRoot) {
          try {
            const { resolveProfileUserDataDir } = require("./lib/profiles-location.cjs");
            const { findLiveHeadedBrowserPidNative, focusProfileBrowserWindow } = require("./lib/profile-browser-orphan.cjs");
            const uDir = resolveProfileUserDataDir(resolvedRoot, id);
            const liveHeadedPid = findLiveHeadedBrowserPidNative(uDir);
            if (liveHeadedPid > 0) {
              const launchUrl =
                !opts?.skipStartupUrl && profileService?.resolveProfileLaunchUrl
                  ? profileService.resolveProfileLaunchUrl(cleanedProfile.startupUrl)
                  : "";
              const chromeBin = "C:\\Users\\CzP\\.cloakbrowser\\chromium-146.0.7680.177.5\\chrome.exe";
              if (fs.existsSync(chromeBin)) {
                const { spawn } = require("node:child_process");
                const args = [
                  `--user-data-dir=${uDir}`,
                  "--profile-directory=Default",
                  "--disable-extensions-except=kaaadageakdandpobcofplmfbjfjabdk,ckalnmjdalpecadefcppeohmdgocgjlj",
                  "--load-extension=C:/Users/CzP/.cloakbrowser/chromium-146.0.7680.177.5/kaaadageakdandpobcofplmfbjfjabdk,C:/Users/CzP/.cloakbrowser/chromium-146.0.7680.177.5/ckalnmjdalpecadefcppeohmdgocgjlj",
                  "--new-window",
                ];
                if (launchUrl) args.push(launchUrl);
                const child = spawn(chromeBin, args, { detached: true, stdio: "ignore", windowsHide: false });
                child.unref?.();
              } else {
                await focusProfileBrowserWindow(uDir).catch(() => undefined);
              }
              const runningProf = profileService?.setProfileStatus?.(id, "running") || cleanedProfile;
              return {
                ok: true,
                status: "running",
                profile: runningProf,
                userDataDir: uDir,
                debugPort: 0,
                focused: true,
                headless: false,
                visibilityMode: "headed",
              };
            }
          } catch {
            /* fallback to unifiedSm.launch */
          }
        }
        res = await unifiedSm.launch(cleanedProfile, opts);
        if (id) {
          const now = Date.now();
          const prev = activityMap.get(id);
          activityMap.set(id, {
            launchedAt: prev?.launchedAt || now,
            lastActivityAt: now,
            callerId:
              callerId ||
              (isAgentOrHeadless ? normalizeAgentCallerId(prev?.callerId || "agent:inline") : "user-headed"),
          });
        }
        if (isAgentOrHeadless && id) {
          await enforceHotPatchHeadlessCap(id, callerId).catch(() => undefined);
        }
      } finally {
        if (id) waitingHeadlessIds.delete(id);
      }
      if (!isAgentOrHeadless && targetWorkArea) {
        const wantMax = String(cleanedProfile.windowMode || "host-maximized").toLowerCase() === "host-maximized";
        const codeStr = extractProfileCode(cleanedProfile.name || "", id);
        const enforceMonitorPlacement = async () => {
          try {
            const { moveChromeWindowsToTargetWorkAreaNative } = require("./lib/taskbar-apply-worker.cjs");
            let hintPid = 0;
            if (res?.userDataDir) {
              const scFile = path.join(res.userDataDir, "stealth-pid.json");
              if (fs.existsSync(scFile)) {
                const sc = JSON.parse(fs.readFileSync(scFile, "utf8"));
                if (Number(sc?.pid) > 0) hintPid = Number(sc.pid);
              }
            }
            moveChromeWindowsToTargetWorkAreaNative(targetWorkArea, {
              hintPid,
              code: codeStr,
              maximize: wantMax,
            });
          } catch {
            /* ignore */
          }
        };
        void enforceMonitorPlacement();
        const t = setTimeout(() => {
          void enforceMonitorPlacement();
        }, 180);
        if (typeof t.unref === "function") t.unref();
      }
      if (isAgentOrHeadless && res?.userDataDir) {
        const seq = ++hotPatchGroupSeq;
        const applyShield = () => {
          try {
            const scFile = path.join(res.userDataDir, "stealth-pid.json");
            if (fs.existsSync(scFile)) {
              const sc = JSON.parse(fs.readFileSync(scFile, "utf8"));
              if (Number(sc?.pid) > 0) {
                const { balanceBrowserProcessorGroup } = require("./lib/taskbar-apply-worker.cjs");
                void balanceBrowserProcessorGroup(Number(sc.pid), seq, { headless: true });
              }
            }
          } catch {
            /* ignore */
          }
        };
        setTimeout(applyShield, 350).unref?.();
        setTimeout(applyShield, 2000).unref?.();
      }
      return res;
    };

    sessionManager.ensureAutomationContext = function hotPatchedEnsureAutomationContext(profile, opts = {}) {
      const id = String(profile?.id || "");
      const isAgentOrHeadless = Boolean(isAgentSmokeLaunch() || profile?.headless === true || opts?.headless === true);
      const cleanedProfile =
        process.env.STEALTH_FORCE_TEMP_SHADOW_DIR === "1"
          ? { ...profile, ...(isAgentOrHeadless ? { headless: true } : {}) }
          : { ...profile, shadowLane: false, ...(isAgentOrHeadless ? { headless: true } : {}) };
      if (!isAgentSmokeLaunch() && cleanedProfile.headless !== true && hasLegacyHeadedSession(id)) {
        return legacySm.ensureAutomationContext(cleanedProfile, opts);
      }
      return unifiedSm.ensureAutomationContext(cleanedProfile, opts);
    };

    sessionManager.listRunning = function hotPatchedListRunning() {
      const mergedById = new Map();
      try {
        for (const r of legacySm.listRunning() || []) {
          const pid = String(r.id || r.profileId || "");
          if (!pid) continue;
          if (r.shadowLane === true || (r.headless === true && String(r.userDataDir || "").includes("p0003-agent-shadow"))) {
            continue;
          }
          mergedById.set(pid, r);
        }
      } catch {
        /* ignore */
      }
      try {
        for (const r of unifiedSm.listRunning() || []) {
          const pid = String(r.id || r.profileId || "");
          if (!pid) continue;
          mergedById.set(pid, r);
        }
      } catch {
        /* ignore */
      }
      const rows = [...mergedById.values()];
      const now = Date.now();
      const aliveIds = new Set();
      for (const r of rows) {
        const pid = String(r.id || r.profileId || "");
        if (!pid) continue;
        aliveIds.add(pid);
        let rec = activityMap.get(pid);
        if (!rec) {
          rec = {
            launchedAt: Number(r.launchedAt || now),
            lastActivityAt: Number(r.lastActivityAt || now),
            callerId: r.headless ? normalizeAgentCallerId(r.callerId || "agent:inline") : "user-headed",
          };
          activityMap.set(pid, rec);
        } else {
          if (Number(r.lastActivityAt || 0) > rec.lastActivityAt) {
            rec.lastActivityAt = Number(r.lastActivityAt);
          }
          if (r.headless) {
            const normRec = normalizeAgentCallerId(rec.callerId || "agent:inline");
            const normRow = r.callerId ? normalizeAgentCallerId(r.callerId) : "";
            rec.callerId = normRow && normRec === "agent:inline" ? normRow : normRec;
          }
        }
        r.launchedAt = rec.launchedAt;
        r.lastActivityAt = rec.lastActivityAt;
        r.callerId = r.headless
          ? normalizeAgentCallerId(r.callerId || rec.callerId || "agent:inline")
          : undefined;
      }
      for (const k of activityMap.keys()) {
        if (!aliveIds.has(k)) activityMap.delete(k);
      }
      for (const [defId, defEntry] of deferredMap.entries()) {
        if (!aliveIds.has(defId) && !sessionManager.isUserInteractiveSession(defId)) {
          deferredMap.delete(defId);
          const readyItem = {
            ...defEntry,
            windowClosedAt: Date.now(),
            readyForAgentRetry: true,
          };
          persistDeferredFile(readyItem);
          scheduleDeferredAgentAutoDrain(readyItem);
        }
      }
      if (
        process.env.STEALTH_DEV_ISOLATED !== "1" &&
        profileService &&
        typeof profileService.listActiveProfileIds === "function" &&
        typeof profileService.setProfileStatus === "function" &&
        now - (sessionManager._lastListRunningReconcileAt || 0) >= 3000
      ) {
        sessionManager._lastListRunningReconcileAt = now;
        try {
          for (const activeRow of profileService.listActiveProfileIds()) {
            if (!activeRow?.id || aliveIds.has(String(activeRow.id))) continue;
            if (sessionManager.isUserInteractiveSession(String(activeRow.id))) continue;
            if (activeRow.status === "opening") {
              const updatedMs = activeRow.updatedAt ? Date.parse(activeRow.updatedAt) : 0;
              if (updatedMs && now - updatedMs < 5000) continue;
            }
            profileService.setProfileStatus(activeRow.id, "closed", { reason: "reconcile" });
            const rowCode = extractProfileCode(activeRow?.name || "", String(activeRow.id)) || "";
            if (rowCode) triggerDeferredExpiredOrderDrain(rowCode);
          }
        } catch {
          /* ignore reconcile errors */
        }
      }
      return rows;
    };

    if (typeof sessionManager.getCdpEndpoint === "function") {
      const origGetCdpEndpoint =
        sessionManager._origGetCdpEndpoint || sessionManager.getCdpEndpoint.bind(sessionManager);
      sessionManager._origGetCdpEndpoint = origGetCdpEndpoint;
      sessionManager.getCdpEndpoint = async function hotPatchedGetCdpEndpoint(profileId, ...rest) {
        const pid = String(profileId || "");
        const now = Date.now();
        const prev = activityMap.get(pid);
        activityMap.set(pid, {
          launchedAt: prev?.launchedAt || now,
          lastActivityAt: now,
        });
        return origGetCdpEndpoint(profileId, ...rest);
      };
    }

    sessionManager.closeProfile = async function hotPatchedCloseProfile(profileId, opts = {}) {
      return sessionManager.close(profileId, { ignoreIfUserInteractive: true, ...opts });
    };
    unifiedSm.closeProfile = async function hotPatchedUnifiedCloseProfile(profileId, opts = {}) {
      return unifiedSm.close(profileId, { ignoreIfUserInteractive: true, ...opts });
    };

    sessionManager.close = async function hotPatchedMainClose(profileId, opts = {}) {
      const pid = String(profileId || "");
      let code = "";
      try {
        const prof = profileService?.getProfile?.(pid);
        code = extractProfileCode(prof?.name || "", pid) || "";
      } catch {
        /* ignore */
      }
      if (!opts?.forcePriority && isCodePriorityLocked(code, opts?.callerPid, pid)) {
        return { ok: true, skipped: "priority_agent_locked", status: "running", code };
      }
      const locked = isCodeLockedByActiveAgent(code);
      if (locked && !opts?.force) {
        return { ok: false, skipped: "locked-by-active-agent", code };
      }
      const isAgentCaller = Boolean(opts?.agentOnly || opts?.ignoreIfUserInteractive || isAgentSmokeLaunch());
      if (isAgentCaller && sessionManager.isUserInteractiveSession(pid)) {
        recentHeadlessMap.delete(pid);
        const runningProfile = profileService?.setProfileStatus?.(pid, "running");
        return {
          ok: true,
          skipped: "user_interactive_session",
          status: "running",
          profile: runningProfile,
        };
      }
      if (isAgentCaller && pid) {
        recentHeadlessMap.set(pid, Date.now());
      }
      let res = await unifiedSm.close(pid, opts).catch(() => null);
      if (hasLegacyHeadedSession(pid)) {
        if (isAgentCaller) {
          const runningProfile = profileService?.setProfileStatus?.(pid, "running");
          return {
            ok: true,
            skipped: "user_interactive_session",
            status: "running",
            profile: runningProfile,
          };
        }
        res = await legacySm.close(pid, opts);
      } else if (legacySm.isRunning(pid)) {
        await legacySm.close(pid, { ...opts, agentOnly: true, force: true }).catch(() => null);
      }
      if (res?.status === "closed" && !sessionManager.isUserInteractiveSession(pid)) {
        if (deferredMap.has(pid)) {
          const defEntry = deferredMap.get(pid);
          deferredMap.delete(pid);
          const readyItem = {
            ...defEntry,
            windowClosedAt: Date.now(),
            readyForAgentRetry: true,
          };
          persistDeferredFile(readyItem);
          scheduleDeferredAgentAutoDrain(readyItem);
        }
        if (code) triggerDeferredExpiredOrderDrain(code);
      }
      return res;
    };

    sessionManager.closeProfile = async function hotPatchedCloseProfile(profileId, opts = {}) {
      const pid = String(profileId || "");
      const now = Date.now();
      const rec = activityMap.get(pid);
      if (!opts?.force && rec && now - Math.max(rec.lastActivityAt || 0, rec.launchedAt || 0) < 90_000) {
        return { ok: false, skipped: "active-within-90s-ttl" };
      }
      try {
        const prof = profileService?.getProfile?.(pid);
        const code = extractProfileCode(prof?.name || "", pid);
        const isUserHeaded = Boolean(sessionManager?.isUserInteractiveSession?.(pid));
        if (isUserHeaded && !opts?.explicitUserClose) {
          return { ok: false, skipped: "protected-user-headed-profile" };
        }
        if (!opts?.force && code && isCodeLockedByActiveAgent(code)) {
          return { ok: false, skipped: "locked-by-active-agent" };
        }
      } catch {
        /* ignore */
      }
      return sessionManager.close(profileId, { ignoreIfUserInteractive: true, ...opts });
    };
    try {
      unifiedSm.setOnSessionChange((_id, prof, ev) => {
        try {
          const { BrowserWindow } = require("electron");
          const pid = String(prof?.id || _id || "");
          const wasHeadless = Boolean(
            prof?.headless || (pid && recentHeadlessMap.has(pid) && Date.now() - recentHeadlessMap.get(pid) < 1800_000),
          );
          const enrichedProf = prof && wasHeadless ? { ...prof, headless: true } : prof;
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
              win.webContents.send("profile:session", { profile: enrichedProf, event: ev });
            }
          }
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
    sessionManager._idleGuardHotPatchedV16 = true;
    sessionManager._workerMemoryGuardStartedV1 = true;
    try {
      const { startAgentWorkerMemoryGuard } = require("./lib/agent-worker-memory-guard.cjs");
      startAgentWorkerMemoryGuard({
        sessionManager,
        maxIdleMs: 180_000,
        intervalMs: 20_000,
      });
    } catch {
      /* ignore */
    }
  }

  if (sessionManager && !sessionManager._devLiveVersionWatcherV1) {
    sessionManager._devLiveVersionWatcherV1 = true;
    try {
      const { app, BrowserWindow } = require("electron");
      const isDevRuntime = !app?.isPackaged || process.env.STEALTH_DEV_ISOLATED === "1";
      if (isDevRuntime) {
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
      }
    } catch {
      /* standalone node worker has no electron */
    }
  }

  async function ensureProfileContext(profileId, { skipStartupUrl = false } = {}) {
    const profile = profileService.getProfile(profileId);
    if (!profile) throw new Error("Profile không tồn tại");
    try {
      const { touchWorkerSessionActivity } = require("./lib/agent-worker-memory-guard.cjs");
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

  function screenshotsRoot() {
    return userDataRoot || path.join(os.tmpdir(), "stealth-browser-api");
  }

  // ── Op dùng chung (gọi trực tiếp HOẶC bọc trong job) ─────────────────────
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

  // ── Job runners (POST /api/jobs { type, payload }) ───────────────────────
  const jobRunners = {
    "open-url": (payload, emit) => performOpenUrl(payload || {}, emit),
    "fb-create-pages": async (payload, emit) => {
      const names = Array.isArray(payload?.names) ? payload.names : [];
      const profileId = resolveProfileId(payload || {});
      if (!profileId || !names.length) throw new Error("profile_id và names[] là bắt buộc");
      const { context } = await ensureProfileContext(profileId);
      const { createFacebookPage } = require("./automation/facebook.cjs");
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
    }
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
        userDataRoot: userDataRoot || path.join(os.tmpdir(), "stealth-browser-api"),
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

  // ── Core routes ──────────────────────────────────────────────────────────
  const coreRoutes = [
    {
      id: "system.hotReload",
      method: "POST",
      pattern: /^\/api\/system\/hot-reload$/,
      async handler(ctx) {
        try {
          const { app } = require("electron");
          const isPackagedProd = Boolean(app?.isPackaged && process.env.STEALTH_DEV_ISOLATED !== "1");
          const explicitRelease = Boolean(ctx.body?.releaseProd === true);
          const showOnly = Boolean(ctx.body?.showWindow === true && !ctx.body?.force && !ctx.body?.reloadUi);
          if (isPackagedProd && !explicitRelease && !showOnly) {
            return send.json(ctx.res, 200, {
              ok: true,
              skippedProd: true,
              reason: "prod_isolated_until_explicit_release",
              hint: "Pass releaseProd: true (--release-prod) only when user explicitly requests a Prod Release.",
            });
          }
        } catch {
          /* standalone node worker has no electron app */
        }
        const {
          reloadHotPatchedModules,
          resolveHotPatchedDistIndexHtml,
          resolveHotPatchedPreloadPath,
          resolveHotPatchRoot,
          pruneOrphanResourcesAppDir,
          lockLiveAppAsarAgainstOverwrite,
          unlockLiveAppAsarForQuit,
        } = require("./lib/hot-patch-loader.cjs");
        if (typeof pruneOrphanResourcesAppDir === "function") {
          pruneOrphanResourcesAppDir();
        }
        if (typeof lockLiveAppAsarAgainstOverwrite === "function") {
          res_asarLocked: lockLiveAppAsarAgainstOverwrite();
        }
        const res = reloadHotPatchedModules({ force: Boolean(ctx.body?.force) });
        res.asarWriteLocked = true;
        if (typeof ctx.services?.rebuildRoutes === "function") {
          res.routesCount = ctx.services.rebuildRoutes();
        }
        try {
          // Sync updated stateless methods onto live profileService singleton without dropping DB connection
          for (const key of Object.keys(require.cache || {})) {
            if (path.basename(key) === "profile-service.cjs") {
              delete require.cache[key];
            }
          }
          const freshProfileService = require("./db/profile-service.cjs");
          for (const [k, fn] of Object.entries(freshProfileService)) {
            if (typeof fn === "function") {
              profileService[k] = fn;
            }
          }
          res.profileServiceMethodsSynced = true;
        } catch {
          /* ignore */
        }
        try {
          const { startAgentWorkerMemoryGuard } = require("./lib/agent-worker-memory-guard.cjs");
          if (typeof startAgentWorkerMemoryGuard === "function" && sessionManager) {
            startAgentWorkerMemoryGuard({ sessionManager });
            res.workerGuardRestarted = true;
          }
          const { findLiveHeadedBrowserPidNative } = require("./lib/profile-browser-orphan.cjs");
          if (typeof findLiveHeadedBrowserPidNative === "function" && sessionManager) {
            const origIsUserInteractive =
              sessionManager._origIsUserInteractiveSession ||
              sessionManager.isUserInteractiveSession.bind(sessionManager);
            sessionManager._origIsUserInteractiveSession = origIsUserInteractive;
            sessionManager.isUserInteractiveSession = (profileId) => {
              if (origIsUserInteractive(profileId)) return true;
              try {
                const profile = profileService.getProfile(String(profileId || ""));
                const code = String(profile?.name || "").trim().slice(0, 4);
                const dir =
                  profile?.user_data_dir ||
                  path.join("D:\\StealthBrowser\\profiles", String(profileId || ""));
                if (findLiveHeadedBrowserPidNative(dir) > 0) {
                  if (["0001", "0021", "0059", "0069", "4220", "8000", "8001", "8002", "8003", "8999"].includes(code)) {
                    return true;
                  }
                  return true;
                }
              } catch {
                /* ignore */
              }
              return false;
            };
            res.sessionManagerHeadedCheckPatched = true;
          }
        } catch {
          /* ignore */
        }
        try {
          const { ipcMain } = require("electron");
          if (ipcMain && typeof ipcMain.removeHandler === "function") {
            for (const ck of Object.keys(require.cache || {})) {
              if (
                ck.endsWith("profile-ops.cjs") ||
                ck.endsWith("taskbar-apply-worker.cjs") ||
                ck.endsWith("profile-storage.cjs") ||
                ck.endsWith("profile-backup-meta.cjs") ||
                ck.endsWith("native-session-backup.cjs") ||
                ck.endsWith("profile-cookie-guard.cjs")
              ) {
                delete require.cache[ck];
              }
            }
            ipcMain.removeHandler("profile:launch");
            ipcMain.handle("profile:launch", async (_event, payload = {}) => {
              const { launchProfile: freshLaunchProfileOp } = require("./services/profile-ops.cjs");
              const id = payload.id ? String(payload.id) : "";
              const name = payload.name ? String(payload.name) : "";
              const skipStartupUrl = Boolean(payload.skipStartupUrl);
              const country = payload.country ? String(payload.country).trim() : "";
              const headless = typeof payload.headless === "boolean" ? payload.headless : undefined;
              const shadowLane = typeof payload.shadowLane === "boolean" ? payload.shadowLane : undefined;
              return freshLaunchProfileOp(
                { sessionManager, profileService, userDataRoot },
                { id, name, skipStartupUrl, country, headless, shadowLane },
              );
            });
            ipcMain.removeHandler("profiles:storageStats");
            ipcMain.handle("profiles:storageStats", async (_event, payload = {}) => {
              const { listProfileStorageStats, listProfileStorageStatsAsync } = require("./lib/profile-storage.cjs");
              const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
              const profileIds = Array.isArray(payload.profileIds) ? payload.profileIds.map(String) : [];
              const includeBytes = payload.includeBytes !== false;
              const stats = includeBytes
                ? await listProfileStorageStatsAsync(root, profileIds, { includeBytes: true })
                : listProfileStorageStats(root, profileIds, { includeBytes: false });
              return { ok: true, stats };
            });
            ipcMain.removeHandler("profiles:backupMeta");
            ipcMain.handle("profiles:backupMeta", (_event, payload = {}) => {
              const { listBackupMeta } = require("./lib/profile-backup-meta.cjs");
              const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
              const profileIds = Array.isArray(payload.profileIds) ? payload.profileIds.map(String) : [];
              return { ok: true, meta: listBackupMeta(root, profileIds) };
            });
            ipcMain.removeHandler("extension:reloadOpenProfiles");
            ipcMain.handle("extension:reloadOpenProfiles", async () => {
              const { triggerOpenProfilesExtensionReload } = require("./lib/extensions-status.cjs");
              const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
              return triggerOpenProfilesExtensionReload(root);
            });
            ipcMain.removeHandler("extension:status");
            ipcMain.handle("extension:status", () => {
              const { getExtensionsStatus } = require("./lib/extensions-status.cjs");
              const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
              return { ok: true, status: getExtensionsStatus(root) };
            });
            res.ipcLaunchHandlerRebound = true;
            res.ipcBackupHandlersRebound = true;
            res.ipcExtensionHandlersRebound = true;
          }
        } catch {
          /* ignore */
        }
        try {
          const { app } = require("electron");
          if (app && !app._stagedAsarSwapBound) {
            app._stagedAsarSwapBound = true;
            app.on("will-quit", () => {
              try {
                if (typeof unlockLiveAppAsarForQuit === "function") {
                  unlockLiveAppAsarForQuit();
                }
                const { scheduleStagedAsarSwapOnQuit } = require("./lib/agent-worker-memory-guard.cjs");
                scheduleStagedAsarSwapOnQuit();
              } catch {
                /* ignore */
              }
            });
          }
        } catch {
          /* ignore */
        }

        const resolveConsoleIconPath = () => {
          try {
            const { resolveAppIconPathIfExists } = require("./lib/desktop-app-icon.cjs");
            for (const rootCandidate of [resolveHotPatchRoot(), path.join(__dirname, "..")]) {
              if (!rootCandidate) continue;
              const p = resolveAppIconPathIfExists(rootCandidate);
              if (p && fs.existsSync(p)) return p;
            }
          } catch {
            /* ignore */
          }
          return null;
        };

        const bringWindowToForegroundWin32 = (win, hpVer) => {
          if (!win || win.isDestroyed()) return;
          try {
            const { screen } = require("electron");
            const { resolveTargetDisplayWorkArea, getTargetMonitor } = require("./lib/app-settings.cjs");
            const cursorPt = screen?.getCursorScreenPoint ? screen.getCursorScreenPoint() : { x: 200, y: 200 };
            const primaryDisp = screen?.getPrimaryDisplay ? screen.getPrimaryDisplay() : null;
            const requestedMode = ctx.body?.display || getTargetMonitor();
            const resolvedDisp = resolveTargetDisplayWorkArea(requestedMode);
            const wa = resolvedDisp.workArea || primaryDisp?.workArea || { x: 0, y: 0, width: 1920, height: 1040 };
            res.displayDiagnostics = {
              cursorPt,
              requestedMode,
              targetDisplayIndex: resolvedDisp.displayIndex,
              totalMonitors: resolvedDisp.totalMonitors,
              targetWorkArea: wa,
              primaryWorkArea: primaryDisp?.workArea,
              allDisplays: screen?.getAllDisplays
                ? screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea }))
                : [],
            };
            const iconPath = resolveConsoleIconPath();
            if (iconPath && typeof win.setIcon === "function") {
              win.setIcon(iconPath);
            }
            if (hpVer && typeof win.setTitle === "function") {
              win.setTitle(`Stealth Browser Console — v${hpVer}`);
            }
            if (typeof win.setSkipTaskbar === "function") {
              win.setSkipTaskbar(false);
            }
            if (win.isMinimized()) win.restore();
            if (win.isMaximized()) win.unmaximize();
            win.setBounds({
              x: wa.x + Math.max(20, Math.round((wa.width - Math.min(1440, wa.width - 80)) / 2)),
              y: wa.y + Math.max(20, Math.round((wa.height - Math.min(900, wa.height - 80)) / 2)),
              width: Math.min(1440, wa.width - 80),
              height: Math.min(900, wa.height - 80),
            });
            win.setAlwaysOnTop(true);
            win.show();
            win.maximize();
            win.focus();
            if (typeof win.moveTop === "function") win.moveTop();
            setTimeout(() => {
              try {
                if (!win.isDestroyed()) win.setAlwaysOnTop(false);
              } catch {
                /* ignore */
              }
            }, 600);
          } catch {
            /* ignore */
          }
        };

        const healWindowPreloadIfBroken = async (win, targetIndex, hpVer, { forceShow = false } = {}) => {
          if (!win || win.isDestroyed()) return win;
          const hasPreload = await win.webContents
            .executeJavaScript("Boolean(window.routerApi && window.stealthApi)", true)
            .catch(() => false);
          if (hasPreload) return win;

          const { BrowserWindow } = require("electron");
          const wasVisible = forceShow || win.isVisible();
          const defaultPreload = path.join(__dirname, "preload.cjs");
          const unpackedPreload =
            typeof resolveHotPatchedPreloadPath === "function"
              ? resolveHotPatchedPreloadPath(defaultPreload)
              : defaultPreload;
          const iconPath = resolveConsoleIconPath();
          const newWin = new BrowserWindow({
            width: 1380,
            height: 880,
            minWidth: 1100,
            minHeight: 720,
            backgroundColor: "#0b1020",
            title: hpVer ? `Stealth Browser Console — v${hpVer}` : "Stealth Browser Console",
            show: false,
            ...(iconPath ? { icon: iconPath } : {}),
            webPreferences: {
              preload: unpackedPreload,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          });
          newWin.on("close", (event) => {
            const { isAppQuitting } = require("./lib/app-quit-state.cjs");
            if (isAppQuitting()) return;
            event.preventDefault();
            newWin.hide();
          });
          if (fs.existsSync(targetIndex)) {
            await newWin.loadFile(targetIndex);
          }
          if (hpVer) {
            newWin.webContents
              .executeJavaScript(
                `window.__HUB_ELECTRON_VERSION__ = ${JSON.stringify(hpVer)}; window.dispatchEvent(new Event("hub:electron-dev-ready"));`,
                true,
              )
              .catch(() => {});
          }
          if (wasVisible) {
            bringWindowToForegroundWin32(newWin, hpVer);
          }
          for (const fn of ["isDestroyed", "isMinimized", "restore", "isVisible", "show", "focus", "hide"]) {
            try {
              win[fn] = (...args) => newWin[fn](...args);
            } catch {
              /* ignore */
            }
          }
          try {
            Object.getPrototypeOf(win).destroy.call(win);
          } catch {
            /* ignore */
          }
          res.healedPreloadWindow = true;
          return newWin;
        };

        const defaultDistIndex = path.join(__dirname, "..", "dist", "index.html");
        const targetIndex = fs.existsSync(defaultDistIndex)
          ? defaultDistIndex
          : resolveHotPatchedDistIndexHtml(defaultDistIndex);
        let hpVer = null;
        try {
          for (const pkgCandidate of [
            path.join(__dirname, "..", "package.json"),
            path.join(resolveHotPatchRoot(), "package.json"),
          ]) {
            if (!fs.existsSync(pkgCandidate)) continue;
            const v = String(JSON.parse(fs.readFileSync(pkgCandidate, "utf8"))?.version || "").trim();
            if (v && (!hpVer || v.localeCompare(hpVer, undefined, { numeric: true, sensitivity: "base" }) >= 0)) {
              hpVer = v;
            }
          }
        } catch {
          /* ignore */
        }

        if (ctx.body?.showWindow) {
          try {
            const { app, BrowserWindow } = require("electron");
            let wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
            if (wins.length === 0 && app && typeof app.emit === "function") {
              app.emit("second-instance", {}, []);
              wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
            }
            for (const win of wins) {
              const activeWin = await healWindowPreloadIfBroken(win, targetIndex, hpVer, { forceShow: true });
              bringWindowToForegroundWin32(activeWin, hpVer);
            }
            const finalWins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
            res.windowsCount = finalWins.length;
            res.visibleCount = finalWins.filter((w) => !w.isDestroyed() && w.isVisible()).length;
          } catch (err) {
            res.showWindowError = err instanceof Error ? err.message : String(err);
          }
        }
        if (ctx.body?.reloadUi) {
          try {
            const { app, BrowserWindow } = require("electron");
            const isPackagedProd = Boolean(app?.isPackaged && process.env.STEALTH_DEV_ISOLATED !== "1");
            const allowProdDomReload = Boolean(ctx.body?.allowProdUiReload === true);
            for (const win of BrowserWindow.getAllWindows()) {
              if (win.isDestroyed()) continue;
              const activeWin = await healWindowPreloadIfBroken(win, targetIndex, hpVer, { forceShow: false });
              if (!isPackagedProd || allowProdDomReload) {
                if (fs.existsSync(targetIndex)) {
                  await activeWin.loadFile(targetIndex);
                } else {
                  activeWin.webContents.reloadIgnoringCache();
                }
                res.uiReloadedFrom = targetIndex;
              } else {
                res.prodUiReloadProtected = true;
              }
              if (hpVer) {
                activeWin.webContents
                  .executeJavaScript(
                    `window.__HUB_ELECTRON_VERSION__ = ${JSON.stringify(hpVer)}; window.dispatchEvent(new Event("hub:electron-dev-ready"));`,
                    true,
                  )
                  .catch(() => {});
              }
            }
            res.hotPatchVersion = hpVer;
          } catch {
            /* standalone node worker has no BrowserWindow */
          }
        }
        return send.json(ctx.res, 200, res);
      },
    },
    {
      id: "settings.runtimeGet",
      method: "GET",
      pattern: /^\/api\/settings\/runtime$/,
      handler(ctx) {
        const {
          getTargetMonitor,
          getMaxHeadlessSessions,
          resolveTargetDisplayWorkArea,
        } = require("./lib/app-settings.cjs");
        const now = Date.now();
        const running = sessionManager.listRunning() || [];
        const headlessRows = running.filter((r) => r.headless === true || r.shadowLane === true);
        const activeHeadlessCount = headlessRows.length;
        const activeHeadedCount = running.filter((r) => r.headless !== true && r.shadowLane !== true).length;
        const headlessSessions = headlessRows.map((r) => {
          const launchedAt = Number(r.launchedAt || 0);
          const lastActivityAt = Number(r.lastActivityAt || launchedAt || now);
          return {
            id: String(r.id || r.profileId || ""),
            code: String(r.name || r.id || "").slice(0, 8),
            callerId: normalizeAgentCallerId(r.callerId || "agent:inline"),
            supportChatProtected: Boolean(r.supportChatProtected),
            uptimeMs: launchedAt > 0 ? Math.max(0, now - launchedAt) : 0,
            idleMs: lastActivityAt > 0 ? Math.max(0, now - lastActivityAt) : 0,
            shadowLane: Boolean(r.shadowLane),
          };
        });
        const resolved = resolveTargetDisplayWorkArea();
        let openBrowserWindows = [];
        try {
          const { listProfileChromeWindowsNative } = require("./lib/taskbar-apply-worker.cjs");
          openBrowserWindows = listProfileChromeWindowsNative();
        } catch {
          /* ignore */
        }
        return send.json(ctx.res, 200, {
          ok: true,
          targetMonitor: getTargetMonitor(),
          maxHeadlessSessions: getMaxHeadlessSessions(),
          activeHeadlessCount,
          activeHeadedCount,
          headlessSessions,
          openBrowserWindows,
          totalMonitors: resolved.totalMonitors,
          resolvedDisplayIndex: resolved.displayIndex,
          resolvedWorkArea: resolved.workArea,
        });
      },
    },
    {
      id: "settings.runtimePost",
      method: "POST",
      pattern: /^\/api\/settings\/runtime$/,
      async handler(ctx) {
        const {
          getTargetMonitor,
          setTargetMonitor,
          getMaxHeadlessSessions,
          setMaxHeadlessSessions,
          resolveTargetDisplayWorkArea,
        } = require("./lib/app-settings.cjs");
        const body = ctx.body || {};
        if (body.targetMonitor !== undefined) {
          setTargetMonitor(body.targetMonitor);
        }
        if (body.maxHeadlessSessions !== undefined) {
          setMaxHeadlessSessions(body.maxHeadlessSessions);
        }
        let drainedCount = 0;
        if (typeof body.stopCallerId === "string" && body.stopCallerId.trim()) {
          const targetCaller = normalizeAgentCallerId(body.stopCallerId.trim());
          const matching = (sessionManager.listRunning() || []).filter(
            (r) =>
              (r.headless === true || r.shadowLane === true) &&
              normalizeAgentCallerId(r.callerId || "agent:inline") === targetCaller,
          );
          try {
            const locks = readPriorityLocks();
            let lockChanged = false;
            const matchingIds = new Set(matching.map((m) => String(m.id || m.profileId || "")));
            for (const [k, v] of Object.entries(locks)) {
              if (
                normalizeAgentCallerId(v?.owner || "") === targetCaller ||
                (v?.stealthId && matchingIds.has(String(v.stealthId)))
              ) {
                delete locks[k];
                lockChanged = true;
              }
            }
            if (lockChanged) writePriorityLocks(locks);
          } catch {
            /* ignore */
          }
          for (const row of matching) {
            try {
              await sessionManager.close(row.id, {
                force: true,
                forcePriority: true,
                ignoreIfUserInteractive: true,
              });
              drainedCount += 1;
            } catch {
              /* ignore */
            }
          }
          // Also terminate any matching daemon / inline PID so the stopped caller does not immediately respawn
          try {
            const inlineMatch = targetCaller.match(/^agent:inline-(\d+)$/);
            if (inlineMatch) {
              try {
                process.kill(Number(inlineMatch[1]));
              } catch {}
            } else {
              const slug = targetCaller.replace(/^agent:/, "");
              const lockFile = path.join("E:\\Dev\\.system_generated\\worker-singleton-locks", `${slug}.json`);
              if (fs.existsSync(lockFile)) {
                const lData = JSON.parse(fs.readFileSync(lockFile, "utf8")) || {};
                if (Number(lData.pid) > 0) {
                  try {
                    process.kill(Number(lData.pid));
                  } catch {}
                }
                fs.unlinkSync(lockFile);
              }
            }
          } catch {
            /* ignore */
          }
        }
        if (body.drainIdleHeadless === true) {
          try {
            const { runWorkerGuardSweep } = require("./lib/agent-worker-memory-guard.cjs");
            const maxIdleMs = Number.isFinite(Number(body.maxIdleMs)) ? Math.max(0, Number(body.maxIdleMs)) : 5000;
            const sweepRes = await runWorkerGuardSweep({ sessionManager, maxIdleMs });
            drainedCount = Array.isArray(sweepRes?.evictedNow) ? sweepRes.evictedNow.length : 0;
            if (drainedCount === 0 && body.forceDrainAllHeadless === true) {
              const before = (sessionManager.listRunning() || []).filter(
                (r) => (r.headless === true || r.shadowLane === true) && !r.supportChatProtected,
              );
              for (const row of before) {
                await sessionManager
                  .close(row.id, { force: true, forcePriority: true, ignoreIfUserInteractive: true })
                  .catch(() => undefined);
              }
              drainedCount = before.length;
            }
          } catch {
            /* ignore */
          }
        }
        const resolved = resolveTargetDisplayWorkArea();
        let movedBrowsersCount = 0;
        if (body.moveConsoleNow === true) {
          try {
            const { BrowserWindow } = require("electron");
            const wa = resolved.workArea;
            for (const win of BrowserWindow.getAllWindows()) {
              if (win.isDestroyed()) continue;
              if (win.isMaximized()) win.unmaximize();
              win.setBounds({
                x: wa.x + Math.max(20, Math.round((wa.width - Math.min(1440, wa.width - 80)) / 2)),
                y: wa.y + Math.max(20, Math.round((wa.height - Math.min(900, wa.height - 80)) / 2)),
                width: Math.min(1440, wa.width - 80),
                height: Math.min(900, wa.height - 80),
              });
              win.maximize();
            }
          } catch {
            /* ignore if headless worker */
          }
        }
        if (body.moveConsoleNow === true || body.moveBrowsersNow === true) {
          try {
            const { moveChromeWindowsToTargetWorkAreaNative } = require("./lib/taskbar-apply-worker.cjs");
            const mv = moveChromeWindowsToTargetWorkAreaNative(resolved.workArea, {
              allHeaded: true,
              maximize: true,
            });
            movedBrowsersCount = Number(mv?.moved) || 0;
          } catch {
            /* ignore */
          }
          try {
            const headedRunning = (sessionManager.listRunning() || []).filter(
              (r) => r.headless !== true && r.shadowLane !== true,
            );
            for (const row of headedRunning) {
              await sessionManager.focusProfile(row.id).catch(() => undefined);
            }
          } catch {
            /* ignore */
          }
        }
        const now = Date.now();
        const running = sessionManager.listRunning() || [];
        const headlessRows = running.filter((r) => r.headless === true || r.shadowLane === true);
        const activeHeadlessCount = headlessRows.length;
        const activeHeadedCount = running.filter((r) => r.headless !== true && r.shadowLane !== true).length;
        const headlessSessions = headlessRows.map((r) => {
          const launchedAt = Number(r.launchedAt || 0);
          const lastActivityAt = Number(r.lastActivityAt || launchedAt || now);
          return {
            id: String(r.id || r.profileId || ""),
            code: String(r.name || r.id || "").slice(0, 8),
            callerId: String(r.callerId || "default-agent"),
            supportChatProtected: Boolean(r.supportChatProtected),
            uptimeMs: launchedAt > 0 ? Math.max(0, now - launchedAt) : 0,
            idleMs: lastActivityAt > 0 ? Math.max(0, now - lastActivityAt) : 0,
            shadowLane: Boolean(r.shadowLane),
          };
        });
        return send.json(ctx.res, 200, {
          ok: true,
          targetMonitor: getTargetMonitor(),
          maxHeadlessSessions: getMaxHeadlessSessions(),
          activeHeadlessCount,
          activeHeadedCount,
          headlessSessions,
          drainedCount,
          movedBrowsersCount,
          totalMonitors: resolved.totalMonitors,
          resolvedDisplayIndex: resolved.displayIndex,
          resolvedWorkArea: resolved.workArea,
        });
      },
    },
    {
      id: "system.workerGuardGet",
      method: "GET",
      pattern: /^\/api\/system\/worker-guard$/,
      handler(ctx) {
        const { getWorkerGuardState } = require("./lib/agent-worker-memory-guard.cjs");
        return send.json(ctx.res, 200, { ok: true, ...getWorkerGuardState(sessionManager) });
      },
    },
    {
      id: "system.workerGuardSweep",
      method: "POST",
      pattern: /^\/api\/system\/worker-guard$/,
      async handler(ctx) {
        const { runWorkerGuardSweep } = require("./lib/agent-worker-memory-guard.cjs");
        const maxRamMb = Number(ctx.body?.maxRamMb) || undefined;
        const maxIdleMs = Number(ctx.body?.maxIdleMs) || undefined;
        const res = await runWorkerGuardSweep({ sessionManager, maxRamMb, maxIdleMs });
        return send.json(ctx.res, 200, res);
      },
    },
    {
      id: "catalog.checkpoint",
      method: "POST",
      pattern: /^\/api\/catalog\/checkpoint$/,
      handler(ctx) {
        try {
          const { checkpointDatabase, getDb } = require("./db/init.cjs");
          if (ctx.body?.reindex) {
            const db = getDb();
            for (const idx of [
              "idx_profiles_updated_at",
              "idx_profiles_group_id",
              "idx_profiles_fingerprint_seed",
              "idx_profiles_status",
            ]) {
              try {
                db.exec(`DROP INDEX IF EXISTS ${idx};`);
              } catch {
                /* ignore */
              }
            }
            db.exec("CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);");
            db.exec("CREATE INDEX IF NOT EXISTS idx_profiles_group_id ON profiles(group_id);");
            db.exec("CREATE INDEX IF NOT EXISTS idx_profiles_fingerprint_seed ON profiles(fingerprint_seed);");
            db.exec("CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);");
          }
          checkpointDatabase({ truncate: true });
          return send.json(ctx.res, 200, { ok: true, checkpoint: true, reindexed: Boolean(ctx.body?.reindex) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return send.json(ctx.res, 500, { ok: false, error: message });
        }
      },
    },
    {
      id: "profiles.ensure-agent-pool",
      method: "POST",
      pattern: /^\/api\/profiles\/ensure-agent-pool$/,
      handler(ctx) {
        if (ctx.body?.rangeStart !== undefined && ctx.body?.rangeEnd !== undefined) {
          const start = Math.max(0, Math.min(99999, Number(ctx.body.rangeStart) || 1));
          const end = Math.max(start, Math.min(99999, Number(ctx.body.rangeEnd) || 99999));
          const result = profileService.createProfilesBulkByRange({
            start,
            end,
            defaults: {
              note: String(ctx.body?.note || "").trim(),
            },
          });
          return send.json(ctx.res, 200, {
            ok: true,
            ...result,
            poolRange: `${String(start).padStart(4, "0")}-${String(end).padStart(4, "0")}`,
          });
        }
        let names = [];
        if (Array.isArray(ctx.body?.names) && ctx.body.names.length) {
          names = ctx.body.names.map((n) => String(n || "").trim().padStart(4, "0")).filter((n) => /^9\d{3}$/.test(n));
        } else if (ctx.body?.start !== undefined || ctx.body?.count !== undefined) {
          const start = Math.max(9000, Math.min(9999, Number(ctx.body?.start) || 9000));
          const count = Math.max(1, Math.min(1000, Number(ctx.body?.count) || 20));
          for (let n = start; n < Math.min(10000, start + count); n += 1) {
            names.push(String(n));
          }
        }
        if (!names.length) {
          names = Array.from({ length: 20 }, (_, i) => String(9000 + i));
        }
        const result = profileService.createProfilesBulkByNames({
          names,
          defaults: {
            note:
              String(ctx.body?.note || "").trim() ||
              "Agent pool — ephemeral sequential headless pool (9000–9999 / 9xxx); zero persistent user data",
          },
        });
        const lite = profileService.listProfilesLite();
        const present = names.filter((n) => lite.some((p) => String(p.name || "").trim() === n));
        const missing = names.filter((n) => !present.includes(n));
        return send.json(ctx.res, 200, {
          ok: missing.length === 0,
          ...result,
          present,
          missing,
          pool: names,
          poolRange: "9000-9999",
        });
      },
    },
    {
      id: "sessions.list",
      method: "GET",
      pattern: /^\/api\/(?:v1\/)?sessions$/,
      handler(ctx) {
        try {
          sessionManager.reconcileActiveStatuses();
        } catch {
          /* ignore */
        }
        return send.json(ctx.res, 200, {
          ok: true,
          sessions: sessionManager.listRunning(),
        });
      },
    },
    {
      id: "catalog.stats",
      method: "GET",
      pattern: /^\/api\/catalog\/stats$/,
      handler(ctx) {
        try {
          sessionManager.reconcileActiveStatuses();
        } catch {
          /* ignore */
        }
        const { collectWaitingAgentHeadlessState } = require("./lib/waiting-agent-profiles.cjs");
        return send.json(ctx.res, 200, {
          ok: true,
          stats: profileService.getCatalogStats(),
          waiting: collectWaitingAgentHeadlessState({ sessionManager, profileService, jobQueue }),
        });
      },
    },
    {
      id: "profiles.boost-waiting",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/boost-waiting$/,
      handler(ctx) {
        const profileId = decodeURIComponent(ctx.params[1] || "");
        const { boostWaitingAgentProfile } = require("./lib/waiting-agent-profiles.cjs");
        const result = boostWaitingAgentProfile(profileId);
        return send.json(ctx.res, result.ok ? 200 : 400, result);
      },
    },
    {
      id: "profiles.activity-log",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/activity-log$/,
      async handler(ctx) {
        const profileId = decodeURIComponent(ctx.params[1] || "");
        const text = String(ctx.body?.text || ctx.body?.message || "").trim();
        const { recordProfileActivityLog } = require("./lib/waiting-agent-profiles.cjs");
        const result = recordProfileActivityLog(profileId, text, ctx.body || {});
        const { p0020SyncPromise, ...payload } = result;
        if (ctx.body?.awaitSync && p0020SyncPromise) {
          payload.p0020Sync = await p0020SyncPromise;
        }
        return send.json(ctx.res, result.ok ? 200 : 400, payload);
      },
    },
    {
      id: "profiles.list",
      method: "GET",
      pattern: /^\/api\/profiles$/,
      handler(ctx) {
        sessionManager.reconcileActiveStatuses();
        const q = ctx.query || new URLSearchParams();
        const includeUserHeadedPort =
          q.get("includeUserHeadedPort") === "1" ||
          process.env.STEALTH_ALLOW_AGENT_ON_USER_HEADED === "1";
        // Build O(1) lookup map once per request instead of O(N) legacySm.listRunning() per profile!
        const runningRows = sessionManager.listRunning() || [];
        const runningById = new Map();
        for (const r of runningRows) {
          const rid = String(r.id || r.profileId || "");
          if (!rid) continue;
          const prev = runningById.get(rid);
          if (!prev || (r.headless !== true && r.shadowLane !== true)) {
            runningById.set(rid, r);
          }
        }
        const enrich = (p) => {
          const sess = runningById.get(String(p.id));
          const isRunning = Boolean(sess);
          const isUserHeaded = Boolean(sess && sess.headless !== true && sess.shadowLane !== true);
          return {
            id: p.id,
            name: p.name,
            status: p.status,
            running: isRunning,
            userInteractiveHeaded: isUserHeaded || undefined,
            debugPort:
              isUserHeaded && !includeUserHeadedPort
                ? undefined
                : (sess?.debugPort ? Number(sess.debugPort) : undefined),
            ...(p.activityLog ? { activityLog: p.activityLog } : {}),
            ...(p.activityLogHistory ? { activityLogHistory: p.activityLogHistory } : {}),
          };
        };

        // Fast-path for agent full-catalog queries (e.g. ?limit=10000 with no search/group/status filter):
        // Use listProfilesLite() (id, name, status only) instead of listProfilesPage() (LEFT JOIN + 10k JSON.parse).
        const requestedLimit = Number(q.get("limit") || 0);
        const requestedOffset = Number(q.get("offset") || 0);
        const hasFilter = q.has("search") || q.has("group") || q.has("status") || q.has("sort");
        if (requestedLimit >= 2000 && requestedOffset === 0 && !hasFilter) {
          const allLite = profileService.listProfilesLite();
          const sliced = allLite.slice(0, requestedLimit).map(enrich);
          return send.json(ctx.res, 200, {
            ok: true,
            profiles: sliced,
            total: allLite.length,
            limit: requestedLimit,
            offset: 0,
          });
        }

        // Paginated path: kích hoạt khi có ?limit / ?offset / ?search / ?group / ?status.
        const paged = q.has("limit") || q.has("offset") || q.has("search") || q.has("group") || q.has("status");
        if (paged) {
          const page = profileService.listProfilesPage({
            limit: q.get("limit") ?? 100,
            offset: q.get("offset") ?? 0,
            search: q.get("search") ?? undefined,
            groupId: q.get("group") ?? undefined,
            status: q.get("status") ?? undefined,
            sort: q.get("sort") ?? "updated_at",
            dir: q.get("dir") ?? "desc"
          });
          if (page.profiles.length <= 200) {
            const nowWarm = Date.now();
            if (!globalThis.__STEALTH_LAST_BADGE_WARM_AT__ || nowWarm - globalThis.__STEALTH_LAST_BADGE_WARM_AT__ > 15_000) {
              globalThis.__STEALTH_LAST_BADGE_WARM_AT__ = nowWarm;
              try {
                const { warmBadgeIcosForProfiles } = require("./lib/profile-taskbar-native.cjs");
                warmBadgeIcosForProfiles(page.profiles, { limit: 12 });
              } catch {
                /* ignore */
              }
            }
          }
          return send.json(ctx.res, 200, {
            ok: true,
            profiles: page.profiles.map(enrich),
            total: page.total,
            limit: page.limit,
            offset: page.offset
          });
        }

        // Backward-compat: không param → trả toàn bộ (P0025 dựa vào điều này).
        // Dùng projection lite (id/name/status) → ~7x nhanh hơn ở 5k+ row.
        const profiles = profileService.listProfilesLite().map(enrich);
        return send.json(ctx.res, 200, { ok: true, profiles });
      }
    },
    {
      id: "profiles.launch",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/launch$/,
      async handler(ctx) {
        const profileId = ctx.params[1];
        const country = String(ctx.body?.country || ctx.query?.get?.("country") || "").trim();
        const proxy = String(ctx.body?.proxy || ctx.query?.get?.("proxy") || "").trim();
        const ephemeralProxy = String(ctx.body?.ephemeralProxy || ctx.query?.get?.("ephemeralProxy") || "").trim();
        const timezone = String(ctx.body?.timezone || ctx.query?.get?.("timezone") || "").trim();
        const locale = String(ctx.body?.locale || ctx.query?.get?.("locale") || "").trim();
        const rawHeadless = ctx.body?.headless ?? ctx.query?.get?.("headless");
        const explicitHeaded =
          (rawHeadless === false || rawHeadless === "0" || rawHeadless === "false") &&
          Boolean(ctx.body?.headed === true || ctx.body?.allow_headed_ui === true);
        // HTTP /api/profiles/:id/launch is exclusively called by automated scripts/workers/agents
        // (P0003 Desktop UI uses Electron IPC `profiles:launch`). Default HTTP API launches to headless=true
        // unless explicitHeaded (`{ headless: false, headed: true }`) is passed.
        const isReqAgentSmoke = !explicitHeaded || Boolean(parseAgentSmokeFlag(ctx.req, ctx.body) || isAgentSmokeLaunch());
        const reqHeadless = explicitHeaded ? false : true;
        const rawShadowLane = ctx.body?.shadowLane ?? ctx.query?.get?.("shadowLane");
        const reqShadowLane =
          rawShadowLane === true || rawShadowLane === "1" || rawShadowLane === "true"
            ? true
            : undefined;
        const reqSkipStartupUrl = Boolean(ctx.body?.skipStartupUrl || ctx.query?.get?.("skipStartupUrl") === "1" || isReqAgentSmoke);
        try {
          const reqCallerId = parseAgentCallerId(ctx.req, ctx.body) || getAgentCallerId() || "";
          const result = await runWithAgentSmokeRequest(
            isReqAgentSmoke,
            () =>
              launchProfileOp(
                { sessionManager, profileService, userDataRoot },
                {
                  id: profileId,
                  country,
                  proxy,
                  ephemeralProxy,
                  timezone,
                  locale,
                  headless: reqHeadless,
                  shadowLane: reqShadowLane,
                  skipStartupUrl: reqSkipStartupUrl,
                  loadExtensionsInHeadless: Boolean(ctx.body?.loadExtensionsInHeadless),
                },
              ),
            reqCallerId,
          );
          if (result.ok) {
            const { isAgentSmokeLaunch } = require("./lib/agent-smoke-mode.cjs");
            const profile = profileService.getProfile(profileId);
            const effectiveHeadless = reqHeadless ?? (Boolean(profile?.headless) || isAgentSmokeLaunch());
            if (!effectiveHeadless && ctx.body?.keepVisible !== true) {
              await sessionManager.minimizeProfile(profileId).catch(() => undefined);
              // CDP minimize can race the first badge stamp — force re-apply after.
              try {
                const { scheduleProfileTaskbarBadgeApply, formatProfileWindowLabel } = require("./lib/profile-window-title.cjs");
                const { extractProfileCode } = require("./lib/profile-code.cjs");
                const { readSidecarPid } = require("./lib/profile-user-data-repair.cjs");
                if (profile) {
                  const dir = result.userDataDir || "";
                  scheduleProfileTaskbarBadgeApply(
                    dir,
                    formatProfileWindowLabel(profile),
                    extractProfileCode(profile.name, profile.id),
                    {
                      browserPid: readSidecarPid(dir)?.pid || 0,
                      headless: effectiveHeadless,
                      force: true,
                    },
                  );
                }
              } catch {
                /* ignore */
              }
            }
          }
          return send.json(ctx.res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message === "Profile not found.") {
            return send.json(ctx.res, 404, { ok: false, error: "Profile không tồn tại" });
          }
          return send.json(ctx.res, 500, { ok: false, error: message });
        }
      }
    },
    {
      id: "profiles.close",
      method: "POST",
      pattern: /^\/api\/(?:v1\/)?profiles\/(?:([^/]+)\/(?:close|stop)|(?:close|stop))$/,
      async handler(ctx) {
        const rawTarget = String(
          decodeURIComponent(ctx.params[1] || "") ||
            ctx.body?.profileId ||
            ctx.body?.id ||
            ctx.body?.code ||
            ctx.body?.browser ||
            "",
        ).trim();
        if (!rawTarget) {
          return send.json(ctx.res, 400, { ok: false, error: "Missing profileId" });
        }
        const callerPid = Number(ctx.body?.callerPid || 0);
        let resolvedId = rawTarget;
        try {
          const prof =
            profileService.getProfile(rawTarget) ||
            profileService.resolveProfileForLaunch?.({ id: rawTarget, name: rawTarget });
          if (prof?.id) resolvedId = String(prof.id);
          if (
            globalThis.__stealthActiveOpenUrlProfiles?.has(rawTarget) ||
            globalThis.__stealthActiveOpenUrlProfiles?.has(resolvedId)
          ) {
            return send.json(ctx.res, 200, { ok: true, skipped: "active_open_url_workflow", id: resolvedId });
          }
          const pCode =
            extractProfileCode(prof?.name || "", resolvedId) ||
            String(prof?.name || rawTarget || "").trim().padStart(4, "0");
          if (!ctx.body?.forcePriority && isCodePriorityLocked(/^\d{4}$/.test(pCode) ? pCode : "", callerPid, resolvedId)) {
            return send.json(ctx.res, 200, { ok: true, skipped: "priority_agent_lock", code: pCode });
          }
        } catch {
          /* ignore lock read error */
        }
        const result = await sessionManager.close(resolvedId, {
          force: Boolean(ctx.body?.forcePriority || ctx.body?.force),
          forcePriority: Boolean(ctx.body?.forcePriority),
          callerPid,
          agentOnly: Boolean(ctx.body?.agentOnly || isAgentSmokeLaunch()),
        });
        if (result?.status === "closed" && result?.skipped !== "user_interactive_session") {
          const { resetProfileToLocalIpIfUnpinned } = require("./services/profile-ops.cjs");
          resetProfileToLocalIpIfUnpinned(profileService, resolvedId);
        }
        return send.json(ctx.res, 200, result);
      }
    },
    {
      id: "sessions.closeAll",
      method: "POST",
      pattern: /^\/api\/sessions\/close-all$/,
      async handler(ctx) {
        const headlessOnly = Boolean(ctx.body?.headlessOnly || isAgentSmokeLaunch());
        let priorityLockedCodes = new Set();
        try {
          const lockFile = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\priority-agent-locks.json";
          if (fs.existsSync(lockFile)) {
            const parsed = JSON.parse(fs.readFileSync(lockFile, "utf8")) || {};
            const now = Date.now();
            for (const [k, v] of Object.entries(parsed?.locks || {})) {
              if (Number(v?.expiresAt) > now) priorityLockedCodes.add(String(k).padStart(4, "0"));
            }
          }
        } catch {
          /* ignore */
        }
        const sessions = sessionManager.listRunning().filter((row) => {
          if (headlessOnly && !row.headless) return false;
          const code = String(row.name || "").trim().padStart(4, "0");
          if (priorityLockedCodes.has(code)) return false;
          return true;
        });
        if (priorityLockedCodes.size > 0) {
          for (const row of sessions) {
            await sessionManager.close(row.id).catch(() => null);
          }
        } else {
          await sessionManager.closeAll({ headlessOnly });
        }
        return send.json(ctx.res, 200, { ok: true, count: sessions.length, ids: sessions.map((row) => row.id) });
      }
    },
    {
      id: "sessions.running",
      method: "GET",
      pattern: /^\/api\/sessions\/running$/,
      handler(ctx) {
        return send.json(ctx.res, 200, {
          ok: true,
          sessions: sessionManager.listRunning(),
          deferredAgentQueue: sessionManager.listDeferredAgentTasks?.() || [],
        });
      }
    },
    {
      id: "profiles.status",
      method: "GET",
      pattern: /^\/api\/profiles\/([^/]+)\/status$/,
      handler(ctx) {
        const profileId = ctx.params[1];
        const profile = profileService.getProfile(profileId);
        return send.json(ctx.res, 200, {
          ok: true,
          profileId,
          running: sessionManager.isRunning(profileId),
          status: profile?.status ?? "unknown"
        });
      }
    },
    {
      id: "profiles.reset-defaults",
      method: "POST",
      pattern: /^\/api\/profiles\/reset-defaults$/,
      handler(ctx) {
        const ids = Array.isArray(ctx.body?.ids) ? ctx.body.ids.map(String).filter(Boolean) : [];
        const result = profileService.bulkUpdateProfiles(ids, { resetToDefaults: true });
        return send.json(ctx.res, 200, {
          ok: true,
          count: result.count,
          profiles: result.profiles || [],
        });
      },
    },
    {
      id: "profiles.patch",
      method: "PATCH",
      pattern: /^\/api\/profiles\/([^/]+)$/,
      handler(ctx) {
        return patchProfileHandler(ctx);
      }
    },
    {
      id: "profiles.update",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/update$/,
      handler(ctx) {
        return patchProfileHandler(ctx);
      }
    },
    {
      id: "profiles.events",
      method: "GET",
      pattern: /^\/api\/profiles\/([^/]+)\/events$/,
      handler(ctx) {
        const profileId = decodeURIComponent(ctx.params[1] || "");
        const rawLim =
          typeof ctx.query?.get === "function" ? ctx.query.get("limit") : ctx.query?.limit;
        const rawOff =
          typeof ctx.query?.get === "function" ? ctx.query.get("offset") : ctx.query?.offset;
        const limit = Math.min(500, Math.max(1, Number(rawLim) || 100));
        const offset = Math.max(0, Math.floor(Number(rawOff) || 0));
        return send.json(ctx.res, 200, {
          ok: true,
          events: profileService.listProfileEvents(profileId, limit, offset),
        });
      },
    },
    {
      id: "events.recent",
      method: "GET",
      pattern: /^\/api\/events$/,
      handler(ctx) {
        const rawLim =
          typeof ctx.query?.get === "function" ? ctx.query.get("limit") : ctx.query?.limit;
        const rawOff =
          typeof ctx.query?.get === "function" ? ctx.query.get("offset") : ctx.query?.offset;
        const limit = Math.min(500, Math.max(1, Number(rawLim) || 200));
        const offset = Math.max(0, Math.floor(Number(rawOff) || 0));
        const events =
          typeof profileService.listRecentProfileEvents === "function"
            ? profileService.listRecentProfileEvents(limit, offset)
            : [];
        return send.json(ctx.res, 200, {
          ok: true,
          events,
        });
      },
    },
    {
      id: "runs.list",
      method: "GET",
      pattern: /^\/api\/(?:runs|history)$/,
      handler(ctx) {
        const rawLim =
          typeof ctx.query?.get === "function" ? ctx.query.get("limit") : ctx.query?.limit;
        const limit = Math.min(500, Math.max(1, Number(rawLim) || 100));
        const runs = typeof profileService.listRuns === "function" ? profileService.listRuns(limit) : [];
        return send.json(ctx.res, 200, {
          ok: true,
          runs,
        });
      },
    },
    {
      id: "profiles.backupDirectoryStatus",
      method: "POST",
      pattern: /^\/api\/profiles\/backup-directory-status$/,
      async handler(ctx) {
        try {
          const { listBackupMeta } = require("./lib/profile-backup-meta.cjs");
          const { listProfileStorageStatsAsync } = require("./lib/profile-storage.cjs");
          const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
          const rawIds = Array.isArray(ctx.body?.profileIds)
            ? ctx.body.profileIds
            : Array.isArray(ctx.body?.ids)
              ? ctx.body.ids
              : [];
          const profileIds = rawIds.map((rawId) => {
            const s = String(rawId || "").trim();
            if (!s) return s;
            if (/^\d{1,5}$/.test(s) && typeof profileService?.resolveProfileForLaunch === "function") {
              const p = profileService.resolveProfileForLaunch({ id: s, name: s });
              if (p?.id) return String(p.id);
            }
            return s;
          });
          const meta = listBackupMeta(root, profileIds);
          const stats = await listProfileStorageStatsAsync(root, profileIds, { includeBytes: true });
          return send.json(ctx.res, 200, {
            ok: true,
            meta,
            stats,
          });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.backupDirectorySnapshotBulk",
      method: "POST",
      pattern: /^\/api\/profiles\/backup-directory-snapshot-bulk$/,
      async handler(ctx) {
        try {
          const { snapshotProfileCookiesIfHealthy } = require("./lib/profile-cookie-guard.cjs");
          const { listBackupMeta } = require("./lib/profile-backup-meta.cjs");
          const { resolveProfilesRoot } = require("./lib/profiles-location.cjs");
          const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
          const profilesDirRoot = resolveProfilesRoot(root);
          const rawIds = Array.isArray(ctx.body?.profileIds)
            ? ctx.body.profileIds
            : Array.isArray(ctx.body?.ids)
              ? ctx.body.ids
              : [];
          const profileIds = rawIds.map((rawId) => {
            const s = String(rawId || "").trim();
            if (!s) return s;
            if (/^\d{1,5}$/.test(s) && typeof profileService?.resolveProfileForLaunch === "function") {
              const p = profileService.resolveProfileForLaunch({ id: s, name: s });
              if (p?.id) return String(p.id);
            }
            return s;
          });
          const force = ctx.body?.force !== false;
          let snapshottedCount = 0;
          let skippedCount = 0;
          const results = [];
          for (const rawId of profileIds) {
            const profile = profileService.resolveProfileForLaunch({ id: rawId, name: rawId });
            const effectiveId = profile ? String(profile.id) : String(rawId);
            const profileCode = profile ? extractProfileCode(profile.name, profile.id) : "";
            const pDir = path.join(profilesDirRoot, effectiveId);
            const snap = snapshotProfileCookiesIfHealthy(pDir, { profileCode, force });
            if (snap.snapshotted) snapshottedCount += 1;
            else skippedCount += 1;
            results.push({ id: effectiveId, profileCode, snapshotted: snap.snapshotted, reason: snap.reason });
            await new Promise((resolve) => setImmediate(resolve));
          }
          const meta = listBackupMeta(root, profileIds);
          return send.json(ctx.res, 200, {
            ok: true,
            snapshottedCount,
            skippedCount,
            results,
            meta,
          });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.cookieGuardStatus",
      method: "GET",
      pattern: /^\/api\/profiles\/([^/]+)\/cookie-guard$/,
      handler(ctx) {
        try {
          const { getProfileCookieGuardStatus } = require("./lib/profile-cookie-guard.cjs");
          const { resolveProfilesRoot } = require("./lib/profiles-location.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          if (!profile) return send.json(ctx.res, 404, { ok: false, error: "Profile not found." });
          const userDataDir = path.join(resolveProfilesRoot(screenshotsRoot()), String(profile.id));
          const profileCode = extractProfileCode(profile.name, profile.id);
          return send.json(ctx.res, 200, {
            ok: true,
            status: getProfileCookieGuardStatus(userDataDir, { profileCode }),
          });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.cookieGuardSnapshot",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/cookie-guard\/snapshot$/,
      handler(ctx) {
        try {
          const { snapshotProfileCookiesIfHealthy, getProfileCookieGuardStatus } = require("./lib/profile-cookie-guard.cjs");
          const { resolveProfilesRoot } = require("./lib/profiles-location.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          if (!profile) return send.json(ctx.res, 404, { ok: false, error: "Profile not found." });
          const userDataDir = path.join(resolveProfilesRoot(screenshotsRoot()), String(profile.id));
          const profileCode = extractProfileCode(profile.name, profile.id);
          const snap = snapshotProfileCookiesIfHealthy(userDataDir, {
            profileCode,
            force: ctx.body?.force !== false,
          });
          return send.json(ctx.res, 200, {
            ok: true,
            snapshotted: snap.snapshotted,
            reason: snap.reason,
            status: getProfileCookieGuardStatus(userDataDir, { profileCode }),
          });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.cookieGuardRestore",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/cookie-guard\/restore$/,
      async handler(ctx) {
        try {
          const { restoreProfileCookiesManual } = require("./lib/profile-cookie-guard.cjs");
          const { resolveProfilesRoot } = require("./lib/profiles-location.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          if (!profile) return send.json(ctx.res, 404, { ok: false, error: "Profile not found." });
          const profilesRoot = resolveProfilesRoot(screenshotsRoot());
          const userDataDir = path.join(profilesRoot, String(profile.id));
          const profileCode = extractProfileCode(profile.name, profile.id);
          const isRunning = sessionManager.isRunning(profile.id);
          const context = isRunning ? sessionManager.getContext(profile.id) : null;
          const slot = ctx.body?.slot === "previous" ? "previous" : "latest";
          let sourceUserDataDir = "";
          const rawSource = String(ctx.body?.sourceProfileId || ctx.body?.sourceProfileName || "").trim();
          if (rawSource) {
            const srcProfile = profileService.resolveProfileForLaunch({ id: rawSource, name: rawSource });
            if (srcProfile) {
              sourceUserDataDir = path.join(profilesRoot, String(srcProfile.id));
            }
          }
          const result = await restoreProfileCookiesManual(userDataDir, {
            profileCode,
            slot,
            sourceUserDataDir,
            isRunning,
            context,
          });
          return send.json(ctx.res, 200, result);
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.cookieGuardReconcileP0020",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/cookie-guard\/reconcile-p0020$/,
      async handler(ctx) {
        try {
          const { getProfileCookieGuardStatus } = require("./lib/profile-cookie-guard.cjs");
          const {
            syncLiveContextCookiesToVaultIfChanged,
            syncProfilePlatformsToP0020IfChanged,
          } = require("./lib/stealth-multiplatform-sync.cjs");
          const { resolveProfilesRoot } = require("./lib/profiles-location.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          if (!profile) return send.json(ctx.res, 404, { ok: false, error: "Profile not found." });
          const userDataDir = path.join(resolveProfilesRoot(screenshotsRoot()), String(profile.id));
          const profileCode = extractProfileCode(profile.name, profile.id);
          const isRunning = sessionManager.isRunning(profile.id);
          const context = isRunning ? sessionManager.getContext(profile.id) : null;
          let cookiePairs = null;
          if (context && typeof context.cookies === "function") {
            await syncLiveContextCookiesToVaultIfChanged(context, { profileCode }).catch(() => undefined);
            const liveCookies = await context.cookies().catch(() => []);
            cookiePairs = liveCookies.map((c) => ({ domain: String(c.domain || ""), name: String(c.name || "") }));
          }
          const syncRes = await syncProfilePlatformsToP0020IfChanged({
            userDataDir,
            profileCode,
            profileId: String(profile.id),
            cookiePairs,
            source: "p0003_manual_reconcile",
          });
          return send.json(ctx.res, 200, {
            ...syncRes,
            status: getProfileCookieGuardStatus(userDataDir, { profileCode }),
          });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.cookieGuardReconcileP0020Bulk",
      method: "POST",
      pattern: /^\/api\/profiles\/cookie-guard\/reconcile-p0020-bulk$/,
      async handler(ctx) {
        try {
          const {
            syncProfilePlatformsToP0020IfChanged,
            reconcileAllProfilesDiskCookiesToP0020,
          } = require("./lib/stealth-multiplatform-sync.cjs");
          const { resolveProfilesRoot } = require("./lib/profiles-location.cjs");
          const baseDir = resolveProfilesRoot(screenshotsRoot());
          const rawIds = Array.isArray(ctx.body?.ids) ? ctx.body.ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
          const sinceHours = Number(ctx.body?.sinceHours ?? ctx.query?.sinceHours) || 0;
          if (rawIds.length === 0) {
            const fullRes = await reconcileAllProfilesDiskCookiesToP0020({
              profileService,
              baseDir,
              sinceHours,
              dryRun: false,
            });
            return send.json(ctx.res, 200, {
              ok: Boolean(fullRes.ok),
              mode: sinceHours > 0 ? `recent_${sinceHours}h` : "all",
              sinceHours,
              profileCount: fullRes.candidateProfiles ?? fullRes.totalChecked ?? 0,
              checkedRows: fullRes.totalChecked || 0,
              patchedCount: fullRes.appliedPatches || 0,
              promotedToLoggedIn: fullRes.promotedToLoggedIn || 0,
              byServicePromoted: fullRes.byServicePromoted || {},
            });
          }
          let checkedRows = 0;
          let patchedCount = 0;
          const loggedInSet = new Set();
          for (const rawId of rawIds) {
            const profile = profileService.resolveProfileForLaunch({ id: rawId, name: rawId });
            if (!profile) continue;
            const userDataDir = path.join(baseDir, String(profile.id));
            const profileCode = extractProfileCode(profile.name, profile.id);
            const res = await syncProfilePlatformsToP0020IfChanged({
              userDataDir,
              profileCode,
              profileId: String(profile.id),
              source: "p0003_bulk_reconcile",
            });
            checkedRows += Number(res.checkedRows) || 0;
            patchedCount += Number(res.patchedCount) || 0;
            for (const s of res.loggedInServices || []) loggedInSet.add(s);
          }
          return send.json(ctx.res, 200, {
            ok: true,
            mode: "selected",
            profileCount: rawIds.length,
            checkedRows,
            patchedCount,
            loggedInServices: Array.from(loggedInSet),
          });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.mobileVaultStatus",
      method: "GET",
      pattern: /^\/api\/profiles\/([^/]+)\/mobile-vault$/,
      async handler(ctx) {
        try {
          const { getMobileVaultProfileStatus } = require("./lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileCode = profile ? extractProfileCode(profile.name, profile.id) : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
          const proxy = String(ctx.query?.get?.("proxy") || profile?.proxy || "");
          const status = await getMobileVaultProfileStatus(profileCode, { proxy });
          return send.json(ctx.res, 200, { ok: true, status });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.mobileVaultSwitch",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/mobile-vault\/switch$/,
      async handler(ctx) {
        try {
          const { switchAndroidDeviceProfile, getMobileVaultProfileStatus } = require("./lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileCode = profile ? extractProfileCode(profile.name, profile.id) : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
          const proxy = String(ctx.body?.proxy ?? profile?.proxy ?? "");
          const result = await switchAndroidDeviceProfile(profileCode, {
            proxy,
            clearPackages: Boolean(ctx.body?.clearPackages),
            restoreIfAvailable: ctx.body?.restoreIfAvailable !== false,
          });
          const status = await getMobileVaultProfileStatus(profileCode, { proxy });
          return send.json(ctx.res, 200, { ...result, status });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.mobileVaultSnapshot",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/mobile-vault\/snapshot$/,
      async handler(ctx) {
        try {
          const { backupAndroidProfileSnapshot, getMobileVaultProfileStatus } = require("./lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileCode = profile ? extractProfileCode(profile.name, profile.id) : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
          const proxy = String(ctx.body?.proxy ?? profile?.proxy ?? "");
          const result = await backupAndroidProfileSnapshot(profileCode);
          const status = await getMobileVaultProfileStatus(profileCode, { proxy });
          return send.json(ctx.res, 200, { ...result, status });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.mobileVaultRestore",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/mobile-vault\/restore$/,
      async handler(ctx) {
        try {
          const { restoreAndroidProfileSnapshot, getMobileVaultProfileStatus } = require("./lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileCode = profile ? extractProfileCode(profile.name, profile.id) : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
          const proxy = String(ctx.body?.proxy ?? profile?.proxy ?? "");
          const result = await restoreAndroidProfileSnapshot(profileCode);
          const status = await getMobileVaultProfileStatus(profileCode, { proxy });
          return send.json(ctx.res, 200, { ...result, status });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.mobileVaultMirror",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/mobile-vault\/mirror$/,
      async handler(ctx) {
        try {
          const { launchMobileScreenMirror, getMobileVaultProfileStatus } = require("./lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileCode = profile ? extractProfileCode(profile.name, profile.id) : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
          const proxy = String(ctx.body?.proxy ?? profile?.proxy ?? "");
          const result = await launchMobileScreenMirror(profileCode);
          const status = await getMobileVaultProfileStatus(profileCode, { proxy });
          return send.json(ctx.res, 200, { ...result, status });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.mobileVaultSyncP0020",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/mobile-vault\/sync-p0020$/,
      async handler(ctx) {
        try {
          const { syncMobileVaultTagToP0020, getMobileVaultProfileStatus } = require("./lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileCode = profile ? extractProfileCode(profile.name, profile.id) : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
          const proxy = String(ctx.body?.proxy ?? profile?.proxy ?? "");
          const result = await syncMobileVaultTagToP0020(profileCode, {
            hasSnapshot: ctx.body?.hasSnapshot !== false,
            promoteChallengedMail: Boolean(ctx.body?.promoteChallengedMail),
          });
          const status = await getMobileVaultProfileStatus(profileCode, { proxy });
          return send.json(ctx.res, 200, { ...result, status });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.mobileVaultWifiAdb",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/mobile-vault\/wifi-adb$/,
      async handler(ctx) {
        try {
          const { enableAndroidWifiAdbBridge, getMobileVaultProfileStatus } = require("./lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileCode = profile ? extractProfileCode(profile.name, profile.id) : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
          const proxy = String(ctx.body?.proxy ?? profile?.proxy ?? "");
          const result = await enableAndroidWifiAdbBridge({
            host: String(ctx.body?.host || ""),
            port: Number(ctx.body?.port) || 5555,
            serial: String(ctx.body?.serial || ""),
          });
          const status = await getMobileVaultProfileStatus(profileCode, { proxy });
          return send.json(ctx.res, 200, { ...result, status });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.mobileVaultPullCookies",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/mobile-vault\/pull-cookies$/,
      async handler(ctx) {
        try {
          const { extractMobileCookiesToBrowserProfile, getMobileVaultProfileStatus } = require("./lib/mobile-stealth-bridge.cjs");
          const { writeBackVaultCookiesToProfileDisk, getProfileCookieGuardStatus } = require("./lib/profile-cookie-guard.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileCode = profile ? extractProfileCode(profile.name, profile.id) : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
          const proxy = String(ctx.body?.proxy ?? profile?.proxy ?? "");
          const result = await extractMobileCookiesToBrowserProfile(profileCode, {
            serial: String(ctx.body?.serial || ""),
            customCookies: Array.isArray(ctx.body?.customCookies) ? ctx.body.customCookies : null,
          });
          let cookieGuardStatus = null;
          if (profile) {
            const userDataDir = profileService.getProfileUserDataDir(profile);
            await writeBackVaultCookiesToProfileDisk(userDataDir, { profileCode }).catch(() => null);
            cookieGuardStatus = getProfileCookieGuardStatus(profileCode, userDataDir);
          }
          const status = await getMobileVaultProfileStatus(profileCode, { proxy });
          return send.json(ctx.res, 200, { ...result, status, cookieGuardStatus });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "profiles.mobileVaultRefreshPif",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/mobile-vault\/refresh-pif$/,
      async handler(ctx) {
        try {
          const { refreshPlayIntegrityFixConfig, getMobileVaultProfileStatus } = require("./lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileCode = profile ? extractProfileCode(profile.name, profile.id) : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
          const proxy = String(ctx.body?.proxy ?? profile?.proxy ?? "");
          const result = await refreshPlayIntegrityFixConfig(profileCode, {
            serial: String(ctx.body?.serial || ""),
            fetchOnline: ctx.body?.fetchOnline !== false,
          });
          const status = await getMobileVaultProfileStatus(profileCode, { proxy });
          return send.json(ctx.res, 200, { ...result, status });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "stealth-sync.status",
      method: "GET",
      pattern: /^\/api\/stealth-sync\/status$/,
      handler(ctx) {
        const limit = Math.min(100, Math.max(1, Number(ctx.query.limit) || 20));
        return send.json(ctx.res, 200, {
          ok: true,
          ...getStealthSyncDiagnostics(limit),
        });
      },
    },
    {
      id: "stealth-sync.heal-stale-running",
      method: "POST",
      pattern: /^\/api\/stealth-sync\/heal-stale-running$/,
      async handler(ctx) {
        const { healStaleRunningP0020Rows } = require("./lib/stealth-multiplatform-sync.cjs");
        const staleAfterMs = Math.max(
          0,
          Number(ctx.body?.staleAfterMs ?? ctx.query?.staleAfterMs ?? 15 * 60 * 1000) || 0,
        );
        const result = await healStaleRunningP0020Rows({
          profileService,
          sessionManager,
          staleAfterMs,
        });
        return send.json(ctx.res, result.ok ? 200 : 500, result);
      },
    },
    {
      id: "profiles.cdp",
      method: "GET",
      pattern: /^\/api\/profiles\/([^/]+)\/cdp$/,
      async handler(ctx) {
        const profileId = ctx.params[1];
        if (!sessionManager.isRunning(profileId)) {
          return send.json(ctx.res, 409, { ok: false, error: "Profile chưa launch — không có CDP endpoint" });
        }
        const q = ctx.query;
        const allowUserHeaded =
          q?.get?.("allowUserHeaded") === "1" ||
          process.env.STEALTH_ALLOW_AGENT_ON_USER_HEADED === "1" ||
          process.env.STEALTH_FORCE_TEMP_SHADOW_DIR === "1";
        const preferAgent = Boolean(
          isAgentSmokeLaunch() ||
            q?.get?.("agent") === "1" ||
            q?.get?.("headless") === "1" ||
            q?.get?.("shadowLane") === "1",
        );
        if (
          !allowUserHeaded &&
          sessionManager.isUserInteractiveSession?.(profileId) === true
        ) {
          sessionManager.enqueueDeferredAgentTask?.(profileId, { reason: "agent_cdp_route_while_user_headed" });
          return send.json(ctx.res, 409, {
            ok: false,
            skipped: "user_interactive_session",
            error: "user_interactive_session_active",
            headless: false,
          });
        }
        const info = await sessionManager.getCdpInfo(profileId, { preferAgent });
        if (!info.ok) {
          const status = info.reason === "not-running" ? 409 : 503;
          return send.json(ctx.res, status, { ok: false, error: info.reason || "CDP không sẵn sàng" });
        }
        return send.json(ctx.res, 200, { ok: true, ...info });
      }
    },
    {
      id: "profiles.autofillBilling",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/autofill-billing$/,
      async handler(ctx) {
        try {
          const { autofillProfileBillingViaCdp } = require("./lib/billing-autofill-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileId = profile?.id || rawIdOrName;
          const profileCode = profile ? extractProfileCode(profile.name, profile.id) : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
          if (!sessionManager.isRunning(profileId)) {
            return send.json(ctx.res, 409, { ok: false, error: "Profile chưa launch — không có CDP endpoint" });
          }
          const info = await sessionManager.getCdpInfo(profileId, { preferAgent: true });
          if (!info?.ok || !info.wsEndpoint) {
            return send.json(ctx.res, 503, { ok: false, error: info?.reason || "CDP không sẵn sàng" });
          }
          const result = await autofillProfileBillingViaCdp({
            wsEndpoint: info.wsEndpoint,
            cardAlias: ctx.body?.cardAlias || ctx.body?.alias || "default",
            profileCode,
            urlIncludes: ctx.body?.urlIncludes || "",
            includeTotp: ctx.body?.includeTotp !== false,
            totpSecret: ctx.body?.totpSecret || "",
          });
          return send.json(ctx.res, result.ok ? 200 : 422, result);
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "billingVault.listCards",
      method: "GET",
      pattern: /^\/api\/billing-vault\/cards$/,
      async handler(ctx) {
        const { listMaskedBillingCards, syncP0020CardsToLocalCache } = require("./lib/billing-autofill-bridge.cjs");
        let current = listMaskedBillingCards();
        if (ctx.query?.get?.("refresh") === "1" || !current.cards || current.cards.length === 0) {
          await syncP0020CardsToLocalCache().catch(() => null);
          current = listMaskedBillingCards();
        }
        return send.json(ctx.res, 200, current);
      },
    },
    {
      id: "billingVault.upsertCard",
      method: "POST",
      pattern: /^\/api\/billing-vault\/cards$/,
      handler(ctx) {
        const { upsertBillingCardInVault } = require("./lib/billing-autofill-bridge.cjs");
        const res = upsertBillingCardInVault(ctx.body?.alias || "default", ctx.body || {});
        return send.json(ctx.res, res.ok ? 200 : 400, res);
      },
    },
    {
      id: "automation.open-url",
      method: "POST",
      pattern: /^\/api\/automation\/(open-url|run)$/,
      async handler(ctx) {
        const result = await performOpenUrl(ctx.body);
        return send.json(ctx.res, result.ok ? 200 : 500, result);
      }
    },
    {
      id: "proxy.check",
      method: "POST",
      pattern: /^\/api\/proxy\/check$/,
      async handler(ctx) {
        // Cho proxy string trực tiếp, HOẶC profile_id để lấy proxy + check geoip-consistency.
        let proxyStr = String(ctx.body.proxy || "").trim();
        let profile = null;
        const profileId =
          resolveProfileId(ctx.body || {}) ||
          String(ctx.body?.profileId || ctx.body?.profileName || "").trim();
        if (profileId) {
          profile =
            profileService.getProfile(profileId) ||
            (typeof profileService.findProfileByName === "function"
              ? profileService.findProfileByName(profileId)
              : null);
          if (!proxyStr) {
            proxyStr = String(profile?.proxy || "").trim();
          }
        }
        if (!proxyStr) {
          return send.json(ctx.res, 400, { ok: false, error: "Cần `proxy` hoặc `profile_id` có proxy" });
        }
        const countrySpec = parseCountryProxySpec(proxyStr, profile?.note);
        if (countrySpec) {
          const resolved = await resolveProfileCountryProxy(
            { proxy: proxyStr, note: profile?.note },
            { preferVaultProxy: ctx.body?.preferVaultProxy },
          );
          if (!resolved) {
            return send.json(ctx.res, 200, {
              ok: true,
              proxy: proxyStr,
              health: { alive: false, countryCode: countrySpec.countryCode, reason: "VPN tunnel unavailable" },
              geo: null,
            });
          }
          const health = {
            alive: true,
            exitIp: resolved.exitIp,
            countryCode: resolved.countryCode,
            timezone: resolved.timezone,
            latencyMs: resolved.latencyMs,
            source: resolved.source,
            localProxyUrl: resolved.resolvedProxy,
          };
          const geo = profile ? geoConsistency(profile, health) : null;
          const geoSync =
            profile && typeof profileService.recordProfileProxyGeoSync === "function"
              ? profileService.recordProfileProxyGeoSync(profile.id, {
                  ...health,
                  manualCheck: Boolean(ctx.body?.manualCheck),
                })
              : null;
          return send.json(ctx.res, 200, { ok: true, proxy: proxyStr, health, geo, geoSync });
        }
        const health = await checkProxy(proxyStr, {
          timeoutMs: Number(ctx.body.timeout_ms ?? ctx.body.timeoutMs) || 8000
        });
        let geo = null;
        let geoSync = null;
        if (health.alive && profile) {
          geo = geoConsistency(profile, health);
          if (typeof profileService.recordProfileProxyGeoSync === "function") {
            geoSync = profileService.recordProfileProxyGeoSync(profile.id, {
              ...health,
              manualCheck: Boolean(ctx.body?.manualCheck),
            });
          }
        }
        return send.json(ctx.res, 200, { ok: true, proxy: proxyStr, health, geo, geoSync });
      }
    },
    {
      id: "proxy.vpnPoolStatus",
      method: "GET",
      pattern: /^\/api\/proxy\/vpn-pool$/,
      async handler(ctx) {
        const mod = await loadVpnProxyPoolModule();
        if (!mod || typeof mod.syncMultiCountryVpnCatalog !== "function") {
          return send.json(ctx.res, 503, { ok: false, error: "VPN Proxy Pool module unavailable" });
        }
        const force = ctx.query?.get?.("refresh") === "1";
        const skipLivePing = ctx.query?.get?.("livePing") === "0";
        const catalog = await mod.syncMultiCountryVpnCatalog({ force, verifyVaultProxies: force });
        const keys = typeof mod.getSurfsharkWireGuardKeyPool === "function" ? mod.getSurfsharkWireGuardKeyPool(catalog) : [];

        // Enrich with live Stealth profile running states (headed + headless) and real-time TCP socket ping
        const runningProfiles = {};
        try {
          const running = sessionManager.listRunning() || [];
          for (const r of running) {
            const rawCode = String(r.name || r.id || "").trim().match(/^\d{1,5}/)?.[0] || "";
            if (!rawCode) continue;
            const code = rawCode.padStart(4, "0");
            const mode = r.headless === true || r.shadowLane === true ? "headless" : "headed";
            if (!runningProfiles[code] || mode === "headed") {
              runningProfiles[code] = mode;
            }
          }
          const { listProfileChromeWindowsNative } = require("./lib/taskbar-apply-worker.cjs");
          const openWins = listProfileChromeWindowsNative() || [];
          for (const w of openWins) {
            const rawCode = String(w.code || w.title || "").trim().match(/^\d{1,5}/)?.[0] || "";
            if (rawCode) {
              runningProfiles[rawCode.padStart(4, "0")] = "headed";
            }
          }
        } catch {
          /* ignore */
        }

        const { probeTcpPort } = require("./lib/proxy-pool.cjs");
        const byCountryOut = {};
        let liveVaultAliveCount = 0;
        const countryEntries = Object.entries(catalog.byCountry || {});
        for (const [cc, entry] of countryEntries) {
          const vps = Array.isArray(entry.vaultProxies) ? entry.vaultProxies : [];
          const enrichedVps = await Promise.all(
            vps.map(async (vp) => {
              const parsed = parseProxy(vp.raw || "");
              const host = vp.host || parsed?.host || "";
              const port = Number(vp.port || parsed?.port || 0);
              const tcp =
                !skipLivePing && host && port > 0 && typeof probeTcpPort === "function"
                  ? await probeTcpPort(host, port, { timeoutMs: 1800 })
                  : null;
              const code = String(vp.browser || "").trim().replace(/\D/g, "").padStart(4, "0");
              const sessionMode = code && runningProfiles[code] ? runningProfiles[code] : "idle";
              const tcpAlive = tcp ? Boolean(tcp.tcpAlive) : Boolean(vp.tcpAlive ?? vp.alive);
              const tcpLatencyMs = tcp?.tcpLatencyMs ?? vp.tcpLatencyMs ?? vp.latencyMs ?? null;
              const alive = tcp ? Boolean(tcp.tcpAlive) : Boolean(vp.alive);
              if (alive) liveVaultAliveCount += 1;
              return {
                ...vp,
                host,
                port,
                alive,
                tcpAlive,
                tcpLatencyMs,
                latencyMs: tcpLatencyMs,
                sessionRunning: sessionMode !== "idle",
                sessionMode,
              };
            }),
          );
          byCountryOut[cc] = {
            ...entry,
            vaultProxies: enrichedVps,
          };
        }

        return send.json(ctx.res, 200, {
          ok: true,
          updatedAt: catalog.updatedAt,
          totalCountries: catalog.totalCountries,
          surfsharkClusterCount: catalog.surfsharkClusterCount,
          nordVpnCountryCount: catalog.nordVpnCountryCount,
          vaultProxyCount: catalog.vaultProxyCount,
          vaultAliveProxyCount: liveVaultAliveCount || catalog.vaultAliveProxyCount,
          vaultVpnAccountCount: catalog.vaultVpnAccountCount,
          verifiedVpnAccountCount: catalog.verifiedVpnAccountCount ?? 0,
          serviceCredentials: catalog.serviceCredentials || [],
          wireguardKeyPoolSize: keys.length,
          runningProfiles,
          countries: Object.keys(byCountryOut).sort(),
          byCountry: byCountryOut,
        });
      },
    },
    {
      id: "proxy.vpnAcquire",
      method: "POST",
      pattern: /^\/api\/proxy\/vpn-acquire$/,
      async handler(ctx) {
        const mod = await loadVpnProxyPoolModule();
        if (!mod || typeof mod.acquireCountryProxy !== "function") {
          return send.json(ctx.res, 503, { ok: false, error: "VPN Proxy Pool module unavailable" });
        }
        const country = String(ctx.body?.country || ctx.body?.countryCode || "US").trim().toUpperCase();
        const rawPrefer = ctx.body?.preferVaultProxy ?? ctx.body?.prefer_vault;
        const preferVaultProxy = rawPrefer !== undefined ? Boolean(rawPrefer) : true;
        const allowCatalogRouteFallback =
          ctx.body?.allowCatalogRouteFallback !== undefined
            ? Boolean(ctx.body.allowCatalogRouteFallback)
            : true;
        const acquired = await mod.acquireCountryProxy([country], {
          preferVaultProxy,
          allowCatalogRouteFallback,
        });
        return send.json(ctx.res, acquired.ok ? 200 : 404, acquired);
      },
    },
    // ── Job model ──────────────────────────────────────────────────────────
    {
      id: "jobs.enqueue",
      method: "POST",
      pattern: /^\/api\/jobs$/,
      handler(ctx) {
        const type = String(ctx.body.type || "").trim();
        const runner = jobRunners[type];
        if (!runner) {
          return send.json(ctx.res, 400, {
            ok: false,
            error: `type không hỗ trợ: ${type || "(trống)"}`,
            supported: Object.keys(jobRunners)
          });
        }
        const payload = ctx.body.payload ?? ctx.body;
        const profileId = resolveProfileId(payload || {}) || undefined;
        const id = jobQueue.enqueue({
          type,
          key: profileId,                       // dedupe: 1 job/profile tại một thời điểm
          meta: { profileId },
          retries: Number(ctx.body.retries) || 0,
          retryDelayMs: Number(ctx.body.retry_delay_ms ?? ctx.body.retryDelayMs) || 1500,
          jitterMs: Number(ctx.body.jitter_ms ?? ctx.body.jitterMs) || 0,
          run: (emit) => runner(payload, emit)
        });
        const status = jobQueue.get(id)?.status ?? "queued";
        // Trùng key → trả lại job đang chạy thay vì tạo mới.
        return send.json(ctx.res, 202, { ok: true, jobId: id, status, deduped: status !== "queued" || undefined });
      }
    },
    {
      id: "jobs.list",
      method: "GET",
      pattern: /^\/api\/jobs$/,
      handler(ctx) {
        return send.json(ctx.res, 200, { ok: true, jobs: jobQueue.list() });
      }
    },
    {
      id: "jobs.stats",
      method: "GET",
      pattern: /^\/api\/jobs\/stats$/,
      handler(ctx) {
        return send.json(ctx.res, 200, { ok: true, stats: jobQueue.stats() });
      }
    },
    {
      id: "jobs.get",
      method: "GET",
      pattern: /^\/api\/jobs\/([^/]+)$/,
      handler(ctx) {
        const job = jobQueue.get(ctx.params[1]);
        if (!job) return send.json(ctx.res, 404, { ok: false, error: "Job không tồn tại" });
        return send.json(ctx.res, 200, { ok: true, job });
      }
    },
    {
      id: "extensions.status",
      method: "GET",
      pattern: /^\/api\/extensions$/,
      handler(ctx) {
        const { getExtensionsStatus } = require("./lib/extensions-status.cjs");
        return send.json(ctx.res, 200, { ok: true, status: getExtensionsStatus(userDataRoot) });
      },
    },
    {
      id: "extensions.cookieBridgeStatus",
      method: "GET",
      pattern: /^\/api\/extensions\/cookie-bridge-status$/,
      handler(ctx) {
        const { getCookieBridgeStatus } = require("./lib/cookie-bridge-status.cjs");
        return send.json(ctx.res, 200, { ok: true, status: getCookieBridgeStatus(userDataRoot) });
      },
    },
    {
      id: "extensions.cookieBridgeSource",
      method: "POST",
      pattern: /^\/api\/extensions\/cookie-bridge-source$/,
      async handler(ctx) {
        const { switchCookieBridgeSourceMode } = require("./lib/cookie-bridge-store.cjs");
        const { getCookieBridgeStatus } = require("./lib/cookie-bridge-status.cjs");
        const mode = String(ctx.body?.mode ?? ctx.body?.sourceMode ?? "").trim().toLowerCase() === "workspace" ? "workspace" : "store";
        try {
          await switchCookieBridgeSourceMode(userDataRoot, mode);
          return send.json(ctx.res, 200, { ok: true, status: getCookieBridgeStatus(userDataRoot) });
        } catch (error) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      id: "extensions.operatorStatus",
      method: "GET",
      pattern: /^\/api\/extensions\/operator-status$/,
      handler(ctx) {
        const { getOperatorExtensionStatus } = require("./lib/native-extension-load.cjs");
        return send.json(ctx.res, 200, { ok: true, status: getOperatorExtensionStatus() });
      },
    },
    {
      id: "extensions.operatorReload",
      method: "POST",
      pattern: /^\/api\/extensions\/operator-reload$/,
      async handler(ctx) {
        try {
          const { getBinaryInfoCached } = require("./engine/cloak-browser-engine.cjs");
          const { maintainOperatorExtension, getOperatorExtensionStatus } = require("./lib/native-extension-load.cjs");
          const binary = await getBinaryInfoCached();
          const maintained = maintainOperatorExtension(userDataRoot, binary.cacheDir, { force: true });
          return send.json(ctx.res, 200, { ok: true, status: getOperatorExtensionStatus(), maintained });
        } catch (error) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      id: "extensions.reloadOpenProfiles",
      method: "POST",
      pattern: /^\/api\/extensions\/reload-open$/,
      async handler(ctx) {
        try {
          const { triggerOpenProfilesExtensionReload } = require("./lib/extensions-status.cjs");
          const result = triggerOpenProfilesExtensionReload(userDataRoot);
          return send.json(ctx.res, 200, result);
        } catch (error) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      id: "extensions.install",
      method: "POST",
      pattern: /^\/api\/extensions\/install$/,
      async handler(ctx) {
        const { installStoreExtension } = require("./lib/extensions-status.cjs");
        const storeIdOrUrl = String(
          ctx.body.store_id ?? ctx.body.storeId ?? ctx.body.url ?? ctx.body.storeIdOrUrl ?? "",
        ).trim();
        if (!storeIdOrUrl) {
          return send.json(ctx.res, 400, { ok: false, error: "store_id or Chrome Web Store URL is required" });
        }
        const profileIds = Array.isArray(ctx.body.profile_ids ?? ctx.body.profileIds)
          ? (ctx.body.profile_ids ?? ctx.body.profileIds).map((id) => String(id).trim()).filter(Boolean)
          : undefined;
        const force = Boolean(ctx.body.force);
        try {
          const result = await installStoreExtension(userDataRoot, storeIdOrUrl, { profileIds, force });
          const { getBinaryInfoCached } = require("./engine/cloak-browser-engine.cjs");
          const { ensureCloakbrowserExtensionStages } = require("./lib/cloakbrowser-extension-stage.cjs");
          const binary = await getBinaryInfoCached();
          ensureCloakbrowserExtensionStages([result.unpackedPath], binary.cacheDir);
          return send.json(ctx.res, 200, { ok: true, result });
        } catch (error) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      id: "extensions.installUnpacked",
      method: "POST",
      pattern: /^\/api\/extensions\/install-unpacked$/,
      async handler(ctx) {
        const { installUnpackedExtension } = require("./lib/extensions-status.cjs");
        const sourceDir = String(ctx.body.path ?? ctx.body.source_dir ?? ctx.body.sourceDir ?? "").trim();
        if (!sourceDir) {
          return send.json(ctx.res, 400, { ok: false, error: "path to unpacked extension folder is required" });
        }
        const profileIds = Array.isArray(ctx.body.profile_ids ?? ctx.body.profileIds)
          ? (ctx.body.profile_ids ?? ctx.body.profileIds).map((id) => String(id).trim()).filter(Boolean)
          : undefined;
        try {
          const result = await installUnpackedExtension(userDataRoot, sourceDir, { profileIds });
          const { getBinaryInfoCached } = require("./engine/cloak-browser-engine.cjs");
          const { ensureCloakbrowserExtensionStages } = require("./lib/cloakbrowser-extension-stage.cjs");
          const binary = await getBinaryInfoCached();
          ensureCloakbrowserExtensionStages([result.unpackedPath], binary.cacheDir);
          return send.json(ctx.res, 200, { ok: true, result });
        } catch (error) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      id: "extensions.removeCached",
      method: "POST",
      pattern: /^\/api\/extensions\/remove$/,
      handler(ctx) {
        const { removeCachedExtensions } = require("./lib/extensions-status.cjs");
        const items = Array.isArray(ctx.body.items) ? ctx.body.items : ctx.body.item ? [ctx.body.item] : [];
        try {
          const result = removeCachedExtensions(userDataRoot, items);
          return send.json(ctx.res, 200, { ok: true, result });
        } catch (error) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      id: "androidVault.profiles",
      method: "GET",
      pattern: /^\/api\/android-vault\/profiles$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const bridgeCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
          ];
          const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
          if (!bridgeFile) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
          const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
          const bridge = await import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
          const out = await bridge.listMobileVaultProfiles();
          return send.json(ctx.res, 200, out);
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "androidVault.status",
      method: "GET",
      pattern: /^\/api\/android-vault\/status$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const bridgeCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
          ];
          const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
          if (!bridgeFile) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
          const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
          const bridge = await import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
          const profileCode = ctx.query.get("profile") || ctx.query.get("code") || "0001";
          const status = await bridge.getMobileVaultProfileStatus(profileCode);
          return send.json(ctx.res, 200, { ok: true, status });
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "androidVault.neverPowerOffStatus",
      method: "GET",
      pattern: /^\/api\/(?:android-vault|mobile-stealth)\/never-power-off-status$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const bridgeCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
          ];
          const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
          if (!bridgeFile) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
          const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
          const bridge = await import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
          const serial = ctx.query.get("serial") || "";
          const out = await bridge.provisionAndroidNeverPowerOffHardening({ serial, verifyOnly: true });
          return send.json(ctx.res, 200, out);
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "androidVault.telemetryHistory",
      method: "GET",
      pattern: /^\/api\/(?:android-vault|mobile-stealth)\/telemetry-history$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const bridgeCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
          ];
          const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
          if (!bridgeFile) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
          const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
          const bridge = await import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
          const limit = Number(ctx.query.get("limit")) || 48;
          const history24h = bridge.getAndroidTelemetryHistory24h({ limit });
          return send.json(ctx.res, 200, { ok: true, history24h });
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "androidVault.provisionNeverPowerOff",
      method: "POST",
      pattern: /^\/api\/(?:android-vault|mobile-stealth)\/provision-never-power-off$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const bridgeCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
          ];
          const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
          if (!bridgeFile) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
          const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
          const bridge = await import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
          const body = ctx.body || {};
          const out = await bridge.provisionAndroidNeverPowerOffHardening({
            serial: String(body.serial || ""),
            verifyOnly: Boolean(body.verifyOnly),
          });
          return send.json(ctx.res, 200, out);
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "androidVault.harvestGmailMarlRecoveryStatus",
      method: "GET",
      pattern: /^\/api\/(?:android-vault|mobile-stealth)\/harvest-gmail-marl-recovery$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const clientCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/stealth-cdp-client.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/stealth-cdp-client.mjs",
          ];
          const clientFile = clientCandidates.find((p) => fs.existsSync(p));
          if (!clientFile) return send.json(ctx.res, 404, { ok: false, error: "stealth_cdp_client_not_found" });
          const clientMod = await import(pathToFileURL(clientFile).href);
          clientMod.startGmailMarlRecoveryHarvesterDaemon?.({ intervalMs: 30 * 60_000, runImmediate: false });
          const out = clientMod.getGmailMarlRecoveryHarvesterStatus?.() || { ok: true, watcherActive: true };
          return send.json(ctx.res, 200, out);
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "androidVault.harvestGmailMarlRecovery",
      method: "POST",
      pattern: /^\/api\/(?:android-vault|mobile-stealth)\/harvest-gmail-marl-recovery$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const clientCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/stealth-cdp-client.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/stealth-cdp-client.mjs",
          ];
          const clientFile = clientCandidates.find((p) => fs.existsSync(p));
          if (!clientFile) return send.json(ctx.res, 404, { ok: false, error: "stealth_cdp_client_not_found" });
          const clientMod = await import(pathToFileURL(clientFile).href);
          clientMod.startGmailMarlRecoveryHarvesterDaemon?.({ intervalMs: 30 * 60_000, runImmediate: false });
          const out = await clientMod.harvestPendingGmailMarlRecoveryLinksBatch(ctx.body || {});
          return send.json(ctx.res, 200, out);
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "androidVault.auditFacebookMailboxHistory",
      method: "POST",
      pattern: /^\/api\/(?:android-vault|mobile-stealth)\/audit-facebook-mailbox-history$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const clientCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/stealth-cdp-client.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/stealth-cdp-client.mjs",
          ];
          const clientFile = clientCandidates.find((p) => fs.existsSync(p));
          if (!clientFile) return send.json(ctx.res, 404, { ok: false, error: "stealth_cdp_client_not_found" });
          const clientMod = await import(pathToFileURL(clientFile).href);
          const out = await clientMod.auditAndRecoverFacebookFromMailboxHistory(ctx.body || {});
          return send.json(ctx.res, 200, out);
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "androidVault.recoverDiscoveredFacebookUids",
      method: "POST",
      pattern: /^\/api\/(?:android-vault|mobile-stealth)\/recover-discovered-facebook-uids$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const clientCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/stealth-cdp-client.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/stealth-cdp-client.mjs",
          ];
          const clientFile = clientCandidates.find((p) => fs.existsSync(p));
          if (!clientFile) return send.json(ctx.res, 404, { ok: false, error: "stealth_cdp_client_not_found" });
          const clientMod = await import(pathToFileURL(clientFile).href);
          const out = await clientMod.recoverDiscoveredFacebookUidsFromMailboxHistory(ctx.body || {});
          return send.json(ctx.res, 200, out);
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "androidVault.liveScreen",
      method: "GET",
      pattern: /^\/api\/android-vault\/live-screen$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const bridgeCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
          ];
          const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
          if (!bridgeFile) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
          const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
          const bridge = await import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
          const displayId = ctx.query.get("displayId") || ctx.query.get("display") || "0";
          const includeScreenshot = ctx.query.get("screenshot") !== "0";
          const out = await bridge.getAndroidLiveScreenAndFarmState({
            displayId,
            includeScreenshot,
          });
          return send.json(ctx.res, 200, out);
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "androidVault.h264Stream",
      method: "GET",
      pattern: /^\/api\/(?:android-vault|mobile-stealth)\/h264-stream$/,
      sse: true,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const bridgeCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
          ];
          const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
          if (!bridgeFile) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
          const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
          const bridge = await import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
          const displayId = ctx.query.get("displayId") || ctx.query.get("display") || "0";
          await bridge.subscribeAndroidH264Stream(ctx.req, ctx.res, { displayId });
        } catch (error) {
          if (!ctx.res.headersSent) {
            return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
          }
        }
      },
    },
    {
      id: "androidVault.actions",
      method: "POST",
      pattern: /^\/api\/android-vault\/(switch|push-cookies|pull-cookies|snapshot|mirror|auto-sync|update-profile|sync-p0020|create|delete|live-control|wifi-adb)$/,
      async handler(ctx) {
        try {
          const { pathToFileURL } = require("node:url");
          const bridgeCandidates = [
            path.resolve(__dirname, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
            "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
          ];
          const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
          if (!bridgeFile) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
          const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
          const bridge = await import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
          const action = ctx.params[1];
          const body = ctx.body || {};
          const profileCode = String(body.profileCode || body.profile || body.code || "0001");
          if (action === "wifi-adb") {
            const out = await bridge.enableAndroidWifiAdbBridge(body);
            return send.json(ctx.res, 200, out);
          }
          if (action === "live-control") {
            const out = await bridge.dispatchAndroidLiveControlAction(body);
            return send.json(ctx.res, 200, out);
          }
          if (action === "create") {
            const out = await bridge.createMobileVaultProfile({
              profileCode: body.profileCode || "",
              manufacturer: body.manufacturer || "",
              model: body.model || "",
              customNote: body.customNote || "",
              autoSync: body.autoSync !== false,
            });
            return send.json(ctx.res, 200, out);
          }
          if (action === "delete") {
            const out = await bridge.deleteMobileVaultProfiles({
              codes: Array.isArray(body.codes) ? body.codes : [profileCode],
            });
            return send.json(ctx.res, 200, out);
          }
          if (action === "switch") {
            const swRes = await bridge.switchAndroidDeviceProfile(profileCode, {
              proxy: String(body.proxy || ""),
              clearPackages: Boolean(body.clearPackages),
              restoreIfAvailable: body.restoreIfAvailable !== false,
            });
            const status = await bridge.getMobileVaultProfileStatus(profileCode);
            return send.json(ctx.res, 200, { ...swRes, status });
          }
          if (action === "push-cookies") {
            const pushRes = await bridge.pushBrowserCookiesToMobileDevice(profileCode, {
              serial: String(body.serial || ""),
            });
            const status = await bridge.getMobileVaultProfileStatus(profileCode);
            return send.json(ctx.res, 200, { ...pushRes, status });
          }
          if (action === "pull-cookies") {
            const pullRes = await bridge.extractMobileCookiesToBrowserProfile(profileCode, {
              serial: String(body.serial || ""),
            });
            const status = await bridge.getMobileVaultProfileStatus(profileCode);
            return send.json(ctx.res, 200, { ...pullRes, status });
          }
          if (action === "snapshot") {
            const snapRes = await bridge.backupAndroidProfileSnapshot(profileCode);
            const status = await bridge.getMobileVaultProfileStatus(profileCode);
            return send.json(ctx.res, 200, { ...snapRes, status });
          }
          if (action === "mirror") {
            const mirRes = await bridge.launchMobileScreenMirror(profileCode);
            const status = await bridge.getMobileVaultProfileStatus(profileCode);
            return send.json(ctx.res, 200, { ...mirRes, status });
          }
          if (action === "auto-sync") {
            const out = await bridge.toggleMobileProfileAutoSync(profileCode, {
              enabled: body.enabled,
            });
            return send.json(ctx.res, 200, out);
          }
          if (action === "update-profile") {
            const out = await bridge.updateMobileProfileHardwareOverride(profileCode, {
              manufacturer: body.manufacturer,
              model: body.model,
              glRenderer: body.glRenderer,
              customNote: body.customNote,
              autoSync: body.autoSync,
            });
            return send.json(ctx.res, 200, out);
          }
          if (action === "sync-p0020") {
            const out = await bridge.syncMobileVaultTagToP0020(profileCode, {
              hasSnapshot: body.hasSnapshot !== false,
              promoteChallengedMail: Boolean(body.promoteChallengedMail),
            });
            return send.json(ctx.res, 200, out);
          }
          return send.json(ctx.res, 404, { ok: false, error: "unknown_android_action" });
        } catch (error) {
          return send.json(ctx.res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      id: "jobs.events",
      method: "GET",
      pattern: /^\/api\/jobs\/([^/]+)\/events$/,
      sse: true,
      handler(ctx) {
        const job = jobQueue.get(ctx.params[1]);
        if (!job) return send.json(ctx.res, 404, { ok: false, error: "Job không tồn tại" });
        const stream = send.sse(ctx.res);
        const unsub = jobQueue.subscribe(ctx.params[1], (evt) => {
          stream.send(evt);
          if (evt.event === "end") {
            stream.end();
            if (unsub) unsub();
          }
        });
      }
    }
  ];

  const util = { ensureProfileContext, resolveProfileId };
  const smokeCtxMod = require("./lib/agent-smoke-context.cjs");
  const allRoutes = [...coreRoutes, ...domainPlugins].map((route) => {
    if (typeof route?.handler !== "function") return route;
    const origHandler = route.handler;
    return {
      ...route,
      handler(ctx) {
        const flag = Boolean(smokeCtxMod.parseAgentSmokeFlag(ctx?.req, ctx?.body) || isAgentSmokeLaunch());
        const callerId =
          typeof smokeCtxMod.parseAgentCallerId === "function"
            ? smokeCtxMod.parseAgentCallerId(ctx?.req, ctx?.body)
            : "";
        return smokeCtxMod.runWithAgentSmokeRequest(flag, () => origHandler(ctx), callerId);
      },
    };
  });
  return {
    routes: allRoutes,
    util,
    jobRunners
  };
}

module.exports = { buildRoutes };
