"use strict";

const { runOpenUrl } = require("../automation/open-url.cjs");
const { getBinaryInfoCached } = require("../engine/cloak-browser-engine.cjs");
const { isCorruptSqliteError, recoverCorruptDatabase } = require("../db/init.cjs");

const PATCH_ALLOWED_FIELDS = [
  "name",
  "groupId",
  "proxy",
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

async function launchProfileOnce(deps, { id, name, skipStartupUrl = false } = {}) {
  if (deps.verifyRuntime) {
    const runtime = deps.verifyRuntime();
    if (!runtime.ok) {
      throw new Error(deps.formatRuntimeError ? deps.formatRuntimeError(runtime) : "Packaged runtime check failed.");
    }
  }
  const profile = deps.profileService.resolveProfileForLaunch({ id, name });
  if (!profile) throw new Error("Profile not found.");
  return deps.sessionManager.launch(profile, { skipStartupUrl });
}

/**
 * @param {{ sessionManager: import('../engine/session-manager.cjs').SessionManager, profileService: object, userDataRoot?: () => string, verifyRuntime?: () => { ok: boolean }, formatRuntimeError?: (r: object) => string }} deps
 */
async function launchProfile(deps, { id, name, skipStartupUrl = false } = {}) {
  try {
    return await launchProfileOnce(deps, { id, name, skipStartupUrl });
  } catch (error) {
    const userDataRoot = resolveUserDataRoot(deps);
    if (!userDataRoot || !isCorruptSqliteError(error)) throw error;
    const recovered = await recoverCorruptDatabase(userDataRoot);
    if (!recovered.ok) throw error;
    const how = recovered.rotated ? "rotated to fresh DB" : "repaired in place";
    console.warn(`[profile-ops] recovered corrupt stealth-console.db (${how}) — retrying launch`);
    try {
      return await launchProfileOnce(deps, { id, name, skipStartupUrl });
    } catch (retryError) {
      // Do not rethrow as unhandled process death — surface as launch failure only.
      console.error(
        "[profile-ops] launch still failed after DB recover:",
        retryError instanceof Error ? retryError.message : retryError,
      );
      throw retryError;
    }
  }
}

async function closeProfile(deps, { id, name } = {}) {
  const profile = deps.profileService.resolveProfileForLaunch({ id, name });
  if (!profile) throw new Error("Profile not found.");
  return deps.sessionManager.close(profile.id);
}

async function patchProfile(deps, profileId, body, { userDataRoot } = {}) {
  const existing = deps.profileService.getProfile(profileId);
  if (!existing) throw new Error("Profile not found.");
  const patch = pickPatch(body);
  if (!Object.keys(patch).length) throw new Error("Empty patch body.");
  const profile = deps.profileService.updateProfile(profileId, patch);
  if (userDataRoot) await ensureProfileExtensionPins(profile, userDataRoot);
  return deps.profileService.getProfile(profileId) || profile;
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
  const context = await deps.sessionManager.ensureAutomationContext(profile);
  const result = await runOpenUrl({
    context,
    profile,
    targetUrl: safe.targetUrl,
    screenshot: safe.screenshot,
    closeWhenDone: safe.closeWhenDone,
    screenshotsRoot: resolveUserDataRoot(deps),
    onCloseProfile: () => deps.sessionManager.close(profile.id),
    workflowAction: safe.workflowAction,
    steps: safe.steps,
    inspectMode: safe.inspectMode,
    workflowId: safe.workflowId,
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

  if (!safe.closeWhenDone && result.ok) {
    deps.profileService.updateProfile(profile.id, { status: "running" });
    try {
      await deps.sessionManager.forceStealthCapture?.(profile, { source: "workflow_done" });
    } catch (error) {
      console.warn(
        "[stealth-sync] post-workflow capture:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return result;
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
};
