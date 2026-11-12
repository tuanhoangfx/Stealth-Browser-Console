"use strict";
/**
 * Unified SessionManager hot-patch bridge & headless concurrency/shield runtime.
 *
 * Preserves bound methods of any boot-time User Headed (`headless: false`) sessions
 * while routing new launches through `UnifiedSessionManager` (`../engine/session-manager.cjs`)
 * with per-caller headless caps, `8xxx` / user-headed protection, and deferred retry queues.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { extractProfileCode } = require("../lib/profile-code.cjs");
const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");
const {
  getAgentCallerId,
  normalizeAgentCallerId,
} = require("../lib/agent-smoke-context.cjs");
const {
  createLockGuardState,
  createDeferredAgentQueueHelpers,
} = require("./http-helpers-and-guards.cjs");

/**
 * Installs the UnifiedSessionManager bridge onto `sessionManager` when `sessionManager.launch`
 * is present, and returns the active `lockGuards` instance.
 */
function installUnifiedSessionManagerRuntime({ sessionManager, profileService, userDataRoot }) {
  if (!sessionManager || typeof sessionManager.launch !== "function") {
    return createLockGuardState({ enabled: false });
  }

  const lockGuards = createLockGuardState({ enabled: true });
  const {
    removeCallerActiveLocks,
    isCodePriorityLocked,
    isCodeLockedByActiveAgent,
  } = lockGuards;

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

  const {
    persistDeferredFile,
    triggerDeferredExpiredOrderDrain,
    scheduleDeferredAgentAutoDrain,
  } = createDeferredAgentQueueHelpers({ sessionManager, profileService, deferredMap });

  // Preserve bound methods of the original boot-time SessionManager so any currently open
  // User Headed windows (`headless: false`) remain untouched, while delegating all new
  // launches to a freshly instantiated UnifiedSessionManager from `../engine/session-manager.cjs`
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
      ck.endsWith("cloak-browser-engine.cjs") ||
      ck.endsWith("profile-chrome-preferences.cjs") ||
      ck.endsWith("native-extension-load.cjs") ||
      ck.endsWith("operator-extension-stage.cjs") ||
      ck.endsWith("cloakbrowser-extension-stage.cjs") ||
      ck.endsWith("profile-extension-pins.cjs") ||
      ck.endsWith("profile-chrome-cleanup.cjs") ||
      ck.endsWith("cookie-bridge-store.cjs") ||
      ck.endsWith("cookie-bridge-status.cjs") ||
      ck.endsWith("extensions-status.cjs") ||
      ck.endsWith("extension-sw-health.cjs") ||
      ck.endsWith("agent-shadow-profile.cjs") ||
      ck.endsWith("profile-browser-orphan.cjs") ||
      ck.endsWith("agent-worker-memory-guard.cjs")
    ) {
      delete require.cache[ck];
    }
  }

  const { SessionManager: UnifiedSessionManager } = require("../engine/session-manager.cjs");
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

  sessionManager.enqueueDeferredAgentTask = function hotPatchedEnqueueDeferred(
    profileId,
    { reason = "user_interactive_session" } = {},
  ) {
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
      const { getMaxHeadlessSessions } = require("../lib/app-settings.cjs");
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
          ((Number.isInteger(num) &&
            ((num >= 1 && num <= 21) ||
              num === 59 ||
              num === 69 ||
              num === 120 ||
              num === 4220 ||
              (num >= 8000 && num < 9000))) ||
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
          removeCallerActiveLocks(item);
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
        const { resolveTargetDisplayWorkArea } = require("../lib/app-settings.cjs");
        targetWorkArea = resolveTargetDisplayWorkArea(profile?.targetMonitor)?.workArea || null;
      } catch {
        /* ignore */
      }
    }
    if (!isAgentOrHeadless && hasLegacyHeadedSession(id)) {
      const legRes = await legacySm.launch(profile, opts);
      if (targetWorkArea) {
        try {
          const { moveChromeWindowsToTargetWorkAreaNative } = require("../lib/taskbar-apply-worker.cjs");
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
          const { resolveProfileUserDataDir } = require("../lib/profiles-location.cjs");
          const { markProfileChromeCleanExit } = require("../lib/profile-chrome-session.cjs");
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
          const { resolveProfileUserDataDir } = require("../lib/profiles-location.cjs");
          const { findLiveHeadedBrowserPidNative, focusProfileBrowserWindow } = require("../lib/profile-browser-orphan.cjs");
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
          const { moveChromeWindowsToTargetWorkAreaNative } = require("../lib/taskbar-apply-worker.cjs");
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
              const { balanceBrowserProcessorGroup } = require("../lib/taskbar-apply-worker.cjs");
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
    const { startAgentWorkerMemoryGuard } = require("../lib/agent-worker-memory-guard.cjs");
    startAgentWorkerMemoryGuard({
      sessionManager,
      maxIdleMs: 180_000,
      intervalMs: 20_000,
    });
  } catch {
    /* ignore */
  }

  return lockGuards;
}

module.exports = {
  installUnifiedSessionManagerRuntime,
};
