"use strict";

const { runOpenUrl } = require("../automation/open-url.cjs");
const { getBinaryInfoCached } = require("../engine/cloak-browser-engine.cjs");
const { isCorruptSqliteError, recoverCorruptDatabase } = require("../db/init.cjs");
const { resolveProfileCountryProxy } = require("../lib/proxy-pool.cjs");
const APP_VERSION = require("../../package.json").version;

const PATCH_ALLOWED_FIELDS = [
  "name",
  "groupId",
  "proxy",
  "staticIp",
  "allowStaticIpPin",
  "note",
  "startupUrl",
  "status",
  "fingerprintSeed",
  "platform",
  "timezone",
  "locale",
  "userAgent",
  "viewportW",
  "viewportH",
  "colorScheme",
  "devicePreset",
  "headless",
  "humanize",
  "windowMode",
  "extensionOverrides",
  "lastChangeSummary",
];

function pickPatch(body) {
  const patch = {};
  if (!body || typeof body !== "object") return patch;
  for (const key of PATCH_ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key];
  }
  return patch;
}

async function ensureProfileExtensionPins(profile, userDataRoot) {
  try {
    const binary = await getBinaryInfoCached();
    const { ensureProfileExtensionPins } = require("../lib/profile-extension-pins.cjs");
    await ensureProfileExtensionPins(profile, userDataRoot, binary.cacheDir);
  } catch (error) {
    console.warn("[profile-ops] extension pins:", error instanceof Error ? error.message : error);
  }
}

function resolveUserDataRoot(deps) {
  const root = deps.userDataRoot;
  if (typeof root === "function") return root();
  return typeof root === "string" ? root : "";
}

function createLaunchLogger() {
  const logs = [];
  return {
    logs,
    push(level, message) {
      logs.push({
        level,
        message,
        time: new Date().toISOString(),
      });
    },
  };
}

async function launchProfileOnce(
  deps,
  {
    id,
    name,
    skipStartupUrl = false,
    country = "",
    proxy = "",
    ephemeralProxy = "",
    timezone = "",
    locale = "",
    headless,
    shadowLane,
    loadExtensionsInHeadless,
  } = {},
) {
  const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");
  const effectiveHeadless =
    typeof headless === "boolean" ? headless : isAgentSmokeLaunch() || shadowLane === true ? true : undefined;
  if (deps.verifyRuntime) {
    const runtime = deps.verifyRuntime();
    if (!runtime.ok) {
      throw new Error(deps.formatRuntimeError ? deps.formatRuntimeError(runtime) : "Packaged runtime check failed.");
    }
  }
  const profile = deps.profileService.resolveProfileForLaunch({ id, name });
  if (!profile) throw new Error("Profile not found.");
  const turnProxyInput = String(ephemeralProxy || proxy || "").trim();
  const profileForProxy = turnProxyInput ? { ...profile, proxy: turnProxyInput } : profile;
  const countryProxy = await resolveProfileCountryProxy(profileForProxy, { country }).catch(() => null);
  let geoSync = null;
  if (countryProxy && typeof deps.profileService.recordProfileProxyGeoSync === "function") {
    try {
      geoSync = deps.profileService.recordProfileProxyGeoSync(profile.id, countryProxy);
    } catch {
      /* ignore geo sync log errors */
    }
  }
  const baseTarget = countryProxy
    ? {
        ...profile,
        proxy: countryProxy.resolvedProxy,
        activeVpnCountry: countryProxy.countryCode || "",
        timezone: String(timezone || "").trim() || countryProxy.timezone || profile.timezone,
        locale: String(locale || "").trim() || countryProxy.locale || profile.locale,
      }
    : turnProxyInput
      ? {
          ...profile,
          proxy: turnProxyInput,
          timezone: String(timezone || "").trim() || profile.timezone,
          locale: String(locale || "").trim() || profile.locale,
        }
      : {
          ...profile,
          ...(String(timezone || "").trim() ? { timezone: String(timezone).trim() } : {}),
          ...(String(locale || "").trim() ? { locale: String(locale).trim() } : {}),
        };
  const effectiveShadowLane =
    process.env.STEALTH_FORCE_TEMP_SHADOW_DIR === "1" && typeof shadowLane === "boolean"
      ? shadowLane
      : undefined;
  const launchTarget = {
    ...baseTarget,
    ...(typeof effectiveHeadless === "boolean" ? { headless: effectiveHeadless } : {}),
    ...(typeof effectiveShadowLane === "boolean" ? { shadowLane: effectiveShadowLane } : {}),
    ...(typeof loadExtensionsInHeadless === "boolean" ? { loadExtensionsInHeadless } : {}),
  };
  const isHeadedLaunch = Boolean(launchTarget.headless !== true && !effectiveHeadless);
  let targetWorkArea = null;
  if (isHeadedLaunch) {
    try {
      const { resolveTargetDisplayWorkArea } = require("../lib/app-settings.cjs");
      targetWorkArea = resolveTargetDisplayWorkArea(launchTarget.targetMonitor)?.workArea || null;
      if (targetWorkArea && Number.isFinite(targetWorkArea.x) && Number.isFinite(targetWorkArea.y)) {
        const winMode = String(launchTarget.windowMode || "host-maximized").toLowerCase();
        if (winMode !== "host-maximized") {
          const extraArgs = Array.isArray(launchTarget.extraChromeArgs) ? [...launchTarget.extraChromeArgs] : [];
          extraArgs.push(`--window-position=${targetWorkArea.x + 32},${targetWorkArea.y + 24}`);
          launchTarget.extraChromeArgs = extraArgs;
        }
        const userDataRoot = resolveUserDataRoot(deps);
        if (userDataRoot && profile.id) {
          const { resolveProfileUserDataDir } = require("../lib/profiles-location.cjs");
          const { markProfileChromeCleanExit } = require("../lib/profile-chrome-session.cjs");
          const userDataDir = resolveProfileUserDataDir(userDataRoot, profile.id);
          markProfileChromeCleanExit(userDataDir, {
            targetWorkArea,
            windowMode: launchTarget.windowMode || "host-maximized",
          });
        }
      }
    } catch {
      /* ignore monitor resolution failure */
    }
  }
  const effectiveSkipStartupUrl = Boolean(skipStartupUrl || effectiveHeadless);
  const res = await deps.sessionManager.launch(launchTarget, { skipStartupUrl: effectiveSkipStartupUrl });
  if (isHeadedLaunch && targetWorkArea) {
    const wantMax = String(launchTarget.windowMode || "host-maximized").toLowerCase() === "host-maximized";
    const applyWin32Placement = () => {
      try {
        const { moveChromeWindowsToTargetWorkAreaNative } = require("../lib/taskbar-apply-worker.cjs");
        const { extractProfileCode } = require("../lib/profile-code.cjs");
        const { formatProfileWindowLabel } = require("../lib/profile-window-title.cjs");
        moveChromeWindowsToTargetWorkAreaNative(targetWorkArea, {
          code: extractProfileCode(profile.name, profile.id),
          title: formatProfileWindowLabel(profile),
          maximize: wantMax,
        });
      } catch {
        /* ignore native placement error */
      }
    };
    applyWin32Placement();
  }
  return countryProxy ? { ...res, vpnProxy: countryProxy, ...(geoSync?.summary ? { geoSyncSummary: geoSync.summary } : {}) } : res;
}

/**
 * @param {{ sessionManager: import('../engine/session-manager.cjs').SessionManager, profileService: object, userDataRoot?: () => string, verifyRuntime?: () => { ok: boolean }, formatRuntimeError?: (r: object) => string }} deps
 */
async function launchProfile(
  deps,
  {
    id,
    name,
    skipStartupUrl = false,
    country = "",
    proxy = "",
    ephemeralProxy = "",
    timezone = "",
    locale = "",
    headless,
    shadowLane,
    loadExtensionsInHeadless,
  } = {},
) {
  const logger = createLaunchLogger();
  const profile = deps.profileService.resolveProfileForLaunch({ id, name });
  if (!profile) throw new Error("Profile not found.");
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");
  const isHeadlessRun = Boolean(headless === true || shadowLane === true || profile.headless || isAgentSmokeLaunch());
  const workflowSlug = isHeadlessRun ? "headless-launch" : "profile-launch";
  logger.push("info", `Stealth v${APP_VERSION} — launch start`);
  logger.push(
    "info",
    skipStartupUrl
      ? "Opening browser without startup URL navigation"
      : profile.startupUrl
        ? `Opening browser with startup URL: ${profile.startupUrl}`
        : "Opening browser without startup URL",
  );
  const recordLaunchRun = (status, errText = null) => {
    try {
      const finishedMs = Date.now();
      deps.profileService.insertRun?.({
        id: `launch-${profile.id.slice(0, 8)}-${startedMs}`,
        profileId: profile.id,
        workflow: workflowSlug,
        targetUrl: profile.startupUrl || "about:blank",
        status,
        startedAt,
        finishedAt: new Date(finishedMs).toISOString(),
        durationMs: Math.max(1, finishedMs - startedMs),
        screenshotPath: null,
        error: errText,
        logsJson: JSON.stringify(logger.logs),
      });
    } catch {
      /* ignore run history write error */
    }
  };
  try {
    const result = await launchProfileOnce(deps, {
      id,
      name,
      skipStartupUrl,
      country,
      proxy,
      ephemeralProxy,
      timezone,
      locale,
      headless,
      shadowLane,
      loadExtensionsInHeadless,
    });
    logger.push("success", result.focused ? "Existing browser focused" : "Browser launched");
    logger.push("success", `Profile status: ${result.status || "running"}`);
    recordLaunchRun("success", null);
    return { ...result, logs: logger.logs };
  } catch (error) {
    const userDataRoot = resolveUserDataRoot(deps);
    if (!userDataRoot || !isCorruptSqliteError(error)) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.push("error", errMsg);
      recordLaunchRun("failed", errMsg);
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { logs: logger.logs });
    }
    const recovered = await recoverCorruptDatabase(userDataRoot);
    if (!recovered.ok) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.push("error", errMsg);
      recordLaunchRun("failed", errMsg);
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { logs: logger.logs });
    }
    const how = recovered.rotated ? "rotated to fresh DB" : "repaired in place";
    logger.push("warn", `Recovered corrupt stealth-console.db (${how}) — retrying launch`);
    console.warn(`[profile-ops] recovered corrupt stealth-console.db (${how}) — retrying launch`);
    try {
      const result = await launchProfileOnce(deps, {
        id,
        name,
        skipStartupUrl,
        country,
        proxy,
        ephemeralProxy,
        timezone,
        locale,
        headless,
        shadowLane,
      });
      logger.push("success", result.focused ? "Existing browser focused" : "Browser launched");
      logger.push("success", `Profile status: ${result.status || "running"}`);
      recordLaunchRun("success", null);
      return { ...result, logs: logger.logs };
    } catch (retryError) {
      // Do not rethrow as unhandled process death — surface as launch failure only.
      const errMsg = retryError instanceof Error ? retryError.message : String(retryError);
      console.error(
        "[profile-ops] launch still failed after DB recover:",
        errMsg,
      );
      logger.push("error", errMsg);
      recordLaunchRun("failed", errMsg);
      throw Object.assign(
        retryError instanceof Error ? retryError : new Error(String(retryError)),
        { logs: logger.logs },
      );
    }
  }
}

function shouldKeepPinnedStaticProxy(profile, { forceReclaimIfBlocked = false } = {}) {
  if (forceReclaimIfBlocked) {
    const m = String(profile?.name || "").match(/\b(\d{4})\b/);
    const num = m ? Number(m[1]) : 0;
    if (num > 30 && num !== 59 && num !== 69) return false;
  }
  const proxyStr = String(profile?.proxy || "").trim();
  const noteStr = String(profile?.note || "");
  if (/^(?:vpn|country|surfshark|nordvpn):/i.test(proxyStr) || /Muse US Proxy/i.test(noteStr)) {
    return false;
  }
  if (profile?.staticIp === true || Number(profile?.static_ip) === 1) return true;
  return /\[(?:pin-proxy|static-ip)\]/i.test(noteStr);
}

function resetProfileToLocalIpIfUnpinned(profileService, profileIdOrName, opts = {}) {
  try {
    if (!profileService || !profileIdOrName) return false;
    const profile =
      (typeof profileService.getProfile === "function" && profileService.getProfile(profileIdOrName)) ||
      (typeof profileService.resolveProfileForLaunch === "function" &&
        profileService.resolveProfileForLaunch({ id: profileIdOrName, name: profileIdOrName }));
    if (!profile || !profile.id) return false;
    if (shouldKeepPinnedStaticProxy(profile, opts)) return false;
    const cleanedNote = sanitizeAgentPinNote(profile.note || "");
    if (
      String(profile.proxy || "").trim() !== "" ||
      String(profile.timezone || "").trim() !== "" ||
      String(profile.locale || "").trim() !== "" ||
      profile.staticIp === true ||
      Number(profile.static_ip) === 1 ||
      cleanedNote !== String(profile.note || "")
    ) {
      profileService.updateProfile(profile.id, {
        proxy: "",
        staticIp: false,
        timezone: "",
        locale: "",
        note: cleanedNote,
      });
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

async function closeProfile(deps, { id, name, forcePriority } = {}) {
  const profile = deps.profileService.resolveProfileForLaunch({ id, name });
  if (!profile) throw new Error("Profile not found.");
  if (!forcePriority) {
    try {
      const fs = require("node:fs");
      const pCode = String(profile.name || "").trim().padStart(4, "0");
      const lockFile = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\priority-agent-locks.json";
      if (/^\d{4}$/.test(pCode) && fs.existsSync(lockFile)) {
        const parsed = JSON.parse(fs.readFileSync(lockFile, "utf8")) || {};
        const entry = parsed?.locks?.[pCode];
        if (entry && Number(entry.expiresAt) > Date.now()) {
          return { ok: true, skipped: "priority_agent_lock", code: pCode };
        }
      }
    } catch {
      /* ignore */
    }
  }
  const res = await deps.sessionManager.close(profile.id);
  resetProfileToLocalIpIfUnpinned(deps.profileService, profile.id);
  return res;
}

function sanitizeAgentPinNote(note) {
  if (typeof note !== "string") return note;
  return note
    .replace(/\[(?:pin-proxy|static-ip)\]/gi, "")
    .replace(/\[vpn:[A-Za-z]{2}\]\s*Muse US Proxy/gi, "")
    .replace(/\bMuse US Proxy\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function patchProfile(deps, profileId, body, { userDataRoot, isAgentRequest } = {}) {
  const existing = deps.profileService.getProfile(profileId);
  if (!existing) throw new Error("Profile not found.");
  const patch = pickPatch(body);
  const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");
  const isAgent = Boolean(
    isAgentRequest ||
      isAgentSmokeLaunch() ||
      body?.agent_smoke ||
      body?.agentSmoke ||
      body?.agent_task ||
      body?.agentTask,
  );
  if (isAgent && body?.allowStaticIpPin !== true) {
    if (patch.staticIp === true || patch.staticIp === 1 || patch.proxy !== undefined) {
      patch.staticIp = false;
    }
    if (typeof patch.note === "string") {
      patch.note = sanitizeAgentPinNote(patch.note);
    }
  }
  if (!Object.keys(patch).length) throw new Error("Empty patch body.");
  const profile = deps.profileService.updateProfile(profileId, patch);
  if (userDataRoot) await ensureProfileExtensionPins(profile, userDataRoot);
  const refreshed = deps.profileService.getProfile(profileId) || profile;
  if (profile?.lastChangeSummary && refreshed) {
    refreshed.lastChangeSummary = profile.lastChangeSummary;
  }
  return refreshed;
}

/**
 * Unified open-url — IPC + HTTP share insertRun + post-run status.
 * @param {(event: object) => void} [emit]
 */
async function performOpenUrl(deps, safe, { profileName, emit } = {}) {
  const profile =
    deps.profileService.resolveProfileForLaunch({ id: safe.profileId, name: profileName }) ||
    deps.profileService.getProfile(safe.profileId);
  if (!profile) throw new Error("Profile not found.");

  emit?.({ event: "progress", msg: `Open URL: ${safe.targetUrl}` });
  const isCountryPreset = /^(?:vpn|proxy|country|surfshark|nordvpn):/i.test(String(profile.proxy || "").trim());
  const countryProxy =
    !shouldKeepPinnedStaticProxy(profile) || isCountryPreset
      ? await resolveProfileCountryProxy(profile, {
          country: safe.country || "",
          targetUrl: safe.targetUrl || profile.startupUrl || "",
        }).catch(() => null)
      : null;
  const effectiveProfile = countryProxy
    ? {
        ...profile,
        proxy: countryProxy.resolvedProxy,
        activeVpnCountry: countryProxy.countryCode || "",
        timezone: profile.timezone || countryProxy.timezone || profile.timezone,
        locale: profile.locale || countryProxy.locale || profile.locale,
      }
    : profile;
  const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");
  const wasUserInteractive = deps.sessionManager.isUserInteractiveSession?.(profile.id) === true;
  const isAgentInvocation = Boolean(safe.agentTask || isAgentSmokeLaunch());
  if (
    wasUserInteractive &&
    (isAgentInvocation || safe.headless === true) &&
    process.env.STEALTH_ALLOW_AGENT_ON_USER_HEADED !== "1" &&
    process.env.STEALTH_FORCE_TEMP_SHADOW_DIR !== "1"
  ) {
    return {
      ok: false,
      skipped: "user_interactive_session",
      error: "user_interactive_session_active",
      status: "running",
    };
  }
  const { setOpenUrlProfileActive } = require("../lib/agent-worker-memory-guard.cjs");
  setOpenUrlProfileActive(profile.id, true);
  try {
    const context = await deps.sessionManager.ensureAutomationContext(effectiveProfile, {
      headless: isAgentInvocation || safe.headless === true ? true : typeof safe.headless === "boolean" ? safe.headless : undefined,
    });
    const usingShadowLane = deps.sessionManager.isAgentShadowRunning?.(profile.id) === true;
    const isolateFromUserSession = Boolean(wasUserInteractive && isAgentInvocation && !usingShadowLane);
    const result = await runOpenUrl({
      context,
      profile: effectiveProfile,
      targetUrl: safe.targetUrl,
      screenshot: safe.screenshot,
      closeWhenDone: isolateFromUserSession ? false : safe.closeWhenDone,
      screenshotsRoot: resolveUserDataRoot(deps),
      onCloseProfile: async () => {
        if (isolateFromUserSession) {
          return { ok: true, skipped: "user_interactive_session", status: "running" };
        }
        const closed = await deps.sessionManager.close(profile.id, {
          agentOnly: usingShadowLane,
          ignoreIfUserInteractive: isAgentInvocation,
        });
        if (closed?.skipped !== "user_interactive_session" && !wasUserInteractive) {
          resetProfileToLocalIpIfUnpinned(deps.profileService, profile.id);
        }
        return closed;
      },
      workflowAction: safe.workflowAction,
      steps: safe.steps,
      inspectMode: safe.inspectMode,
      workflowId: safe.workflowId,
      agentTask: Boolean(safe.agentTask),
      isolateBackgroundTab: isolateFromUserSession,
    });

    for (const log of result.logs || []) emit?.({ event: "log", ...log });

    deps.profileService.insertRun({
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
      logsJson: JSON.stringify(result.logs),
    });

    if (safe.agentTask && !isolateFromUserSession) {
      try {
        const closed = await deps.sessionManager.close(profile.id, {
          agentOnly: usingShadowLane,
          ignoreIfUserInteractive: true,
        });
        if (closed?.skipped !== "user_interactive_session" && !wasUserInteractive) {
          resetProfileToLocalIpIfUnpinned(deps.profileService, profile.id);
        }
      } catch (error) {
        console.warn("[stealth] agent login close:", error instanceof Error ? error.message : error);
      }
    } else if (safe.closeWhenDone && !isolateFromUserSession && !wasUserInteractive) {
      resetProfileToLocalIpIfUnpinned(deps.profileService, profile.id);
    } else if ((!safe.closeWhenDone || isolateFromUserSession || wasUserInteractive) && result.ok) {
      deps.profileService.updateProfile(profile.id, { status: "running" });
    }

    return result;
  } finally {
    setOpenUrlProfileActive(profile.id, false);
  }
}

function resolveProfileId(profileService, body) {
  const byId = String(body.profile_id ?? body.profileId ?? "").trim();
  if (byId) return byId;
  const name = String(body.profile_name ?? body.profileName ?? "").trim();
  if (!name) return null;
  return profileService.findProfileByName(name)?.id ?? null;
}

module.exports = {
  PATCH_ALLOWED_FIELDS,
  pickPatch,
  launchProfile,
  closeProfile,
  patchProfile,
  performOpenUrl,
  resolveProfileId,
  ensureProfileExtensionPins,
  shouldKeepPinnedStaticProxy,
  resetProfileToLocalIpIfUnpinned,
};
