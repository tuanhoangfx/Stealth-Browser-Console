"use strict";
/**
 * Cookie Guard snapshot/restore, Backup Directory stats, Cookie-to-P0020 reconcile,
 * and MV3 Extensions (`E0001-cookie-bridge`, `E0002-browser-operator`, Chrome Web Store) routes.
 */
const path = require("node:path");

const { extractProfileCode } = require("../lib/profile-code.cjs");

function normalizeRequestedProfileIds(profileService, body) {
  const rawIds = Array.isArray(body?.profileIds)
    ? body.profileIds
    : Array.isArray(body?.ids)
      ? body.ids
      : [];
  return rawIds.map((rawId) => {
    const s = String(rawId || "").trim();
    if (!s) return s;
    if (/^\d{1,5}$/.test(s) && typeof profileService?.resolveProfileForLaunch === "function") {
      const p = profileService.resolveProfileForLaunch({ id: s, name: s });
      if (p?.id) return String(p.id);
    }
    return s;
  });
}

function buildCookieGuardRoutes(deps) {
  const {
    sessionManager,
    profileService,
    userDataRoot,
    send,
    runtimeHelpers,
  } = deps;
  const { screenshotsRoot } = runtimeHelpers;

  return [
    {
      id: "profiles.backupDirectoryStatus",
      method: "POST",
      pattern: /^\/api\/profiles\/backup-directory-status$/,
      async handler(ctx) {
        try {
          const { listBackupMeta } = require("../lib/profile-backup-meta.cjs");
          const { listProfileStorageStatsAsync } = require("../lib/profile-storage.cjs");
          const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
          const profileIds = normalizeRequestedProfileIds(profileService, ctx.body);
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
          const { snapshotProfileCookiesIfHealthy } = require("../lib/profile-cookie-guard.cjs");
          const { listBackupMeta } = require("../lib/profile-backup-meta.cjs");
          const { resolveProfilesRoot } = require("../lib/profiles-location.cjs");
          const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
          const profilesDirRoot = resolveProfilesRoot(root);
          const profileIds = normalizeRequestedProfileIds(profileService, ctx.body);
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
          const { getProfileCookieGuardStatus } = require("../lib/profile-cookie-guard.cjs");
          const { resolveProfilesRoot } = require("../lib/profiles-location.cjs");
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
          const { snapshotProfileCookiesIfHealthy, getProfileCookieGuardStatus } = require("../lib/profile-cookie-guard.cjs");
          const { resolveProfilesRoot } = require("../lib/profiles-location.cjs");
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
          const { restoreProfileCookiesManual } = require("../lib/profile-cookie-guard.cjs");
          const { resolveProfilesRoot } = require("../lib/profiles-location.cjs");
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
          const { getProfileCookieGuardStatus } = require("../lib/profile-cookie-guard.cjs");
          const {
            syncLiveContextCookiesToVaultIfChanged,
            syncProfilePlatformsToP0020IfChanged,
          } = require("../lib/stealth-multiplatform-sync.cjs");
          const { resolveProfilesRoot } = require("../lib/profiles-location.cjs");
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
          } = require("../lib/stealth-multiplatform-sync.cjs");
          const { resolveProfilesRoot } = require("../lib/profiles-location.cjs");
          const baseDir = resolveProfilesRoot(screenshotsRoot());
          const rawIds = Array.isArray(ctx.body?.ids)
            ? ctx.body.ids.map((id) => String(id || "").trim()).filter(Boolean)
            : [];
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
  ];
}

function buildExtensionRoutes(deps) {
  const { userDataRoot, send } = deps;

  return [
    {
      id: "extensions.status",
      method: "GET",
      pattern: /^\/api\/extensions$/,
      handler(ctx) {
        const { getExtensionsStatus } = require("../lib/extensions-status.cjs");
        return send.json(ctx.res, 200, { ok: true, status: getExtensionsStatus(userDataRoot) });
      },
    },
    {
      id: "extensions.cookieBridgeStatus",
      method: "GET",
      pattern: /^\/api\/extensions\/cookie-bridge-status$/,
      handler(ctx) {
        const { getCookieBridgeStatus } = require("../lib/cookie-bridge-status.cjs");
        return send.json(ctx.res, 200, { ok: true, status: getCookieBridgeStatus(userDataRoot) });
      },
    },
    {
      id: "extensions.cookieBridgeSource",
      method: "POST",
      pattern: /^\/api\/extensions\/cookie-bridge-source$/,
      async handler(ctx) {
        const { switchCookieBridgeSourceMode } = require("../lib/cookie-bridge-store.cjs");
        const { getCookieBridgeStatus } = require("../lib/cookie-bridge-status.cjs");
        const mode =
          String(ctx.body?.mode ?? ctx.body?.sourceMode ?? "").trim().toLowerCase() === "workspace"
            ? "workspace"
            : "store";
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
        const { getOperatorExtensionStatus } = require("../lib/native-extension-load.cjs");
        return send.json(ctx.res, 200, { ok: true, status: getOperatorExtensionStatus(userDataRoot) });
      },
    },
    {
      id: "extensions.operatorReload",
      method: "POST",
      pattern: /^\/api\/extensions\/operator-reload$/,
      async handler(ctx) {
        try {
          const { getBinaryInfoCached } = require("../engine/cloak-browser-engine.cjs");
          const { maintainOperatorExtension, getOperatorExtensionStatus } = require("../lib/native-extension-load.cjs");
          const binary = await getBinaryInfoCached();
          const maintained = maintainOperatorExtension(userDataRoot, binary.cacheDir, { force: true });
          return send.json(ctx.res, 200, { ok: true, status: getOperatorExtensionStatus(userDataRoot), maintained });
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
          const { triggerOpenProfilesExtensionReload } = require("../lib/extensions-status.cjs");
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
        const { installStoreExtension } = require("../lib/extensions-status.cjs");
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
          const { getBinaryInfoCached } = require("../engine/cloak-browser-engine.cjs");
          const { ensureCloakbrowserExtensionStages } = require("../lib/cloakbrowser-extension-stage.cjs");
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
        const { installUnpackedExtension } = require("../lib/extensions-status.cjs");
        const sourceDir = String(ctx.body.path ?? ctx.body.source_dir ?? ctx.body.sourceDir ?? "").trim();
        if (!sourceDir) {
          return send.json(ctx.res, 400, { ok: false, error: "path to unpacked extension folder is required" });
        }
        const profileIds = Array.isArray(ctx.body.profile_ids ?? ctx.body.profileIds)
          ? (ctx.body.profile_ids ?? ctx.body.profileIds).map((id) => String(id).trim()).filter(Boolean)
          : undefined;
        try {
          const result = await installUnpackedExtension(userDataRoot, sourceDir, { profileIds });
          const { getBinaryInfoCached } = require("../engine/cloak-browser-engine.cjs");
          const { ensureCloakbrowserExtensionStages } = require("../lib/cloakbrowser-extension-stage.cjs");
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
        const { removeCachedExtensions } = require("../lib/extensions-status.cjs");
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
  ];
}

function buildExtensionAndCookieRoutes(deps) {
  return [...buildCookieGuardRoutes(deps), ...buildExtensionRoutes(deps)];
}

module.exports = {
  buildCookieGuardRoutes,
  buildExtensionRoutes,
  buildExtensionAndCookieRoutes,
};
