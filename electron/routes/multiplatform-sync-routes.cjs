"use strict";
/**
 * P0020 Data Box multiplatform sync diagnostics/heal, Profile Mobile Vault (`profiles.mobileVault*`),
 * and Android Vault / Mailbox Recovery (`androidVault.*`) routes.
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { extractProfileCode } = require("../lib/profile-code.cjs");
const { getStealthSyncDiagnostics } = require("../lib/stealth-sync-outbox.cjs");

async function loadAndroidStealthBridge(electronDir) {
  const bridgeCandidates = [
    path.resolve(electronDir, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
    "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
  ];
  const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
  if (!bridgeFile) return null;
  const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
  return import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
}

async function loadStealthCdpClient(electronDir) {
  const clientCandidates = [
    path.resolve(electronDir, "../../P0002-Social-Hub/server/stealth-cdp-client.mjs"),
    "E:/Dev/Tool/P0002-Social-Hub/server/stealth-cdp-client.mjs",
  ];
  const clientFile = clientCandidates.find((p) => fs.existsSync(p));
  if (!clientFile) return null;
  return import(pathToFileURL(clientFile).href);
}

function resolveMobileVaultTarget(profileService, rawIdOrName, bodyOrQueryProxy) {
  const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
  const profileCode = profile
    ? extractProfileCode(profile.name, profile.id)
    : String(rawIdOrName || "").replace(/\D/g, "").padStart(4, "0");
  const proxy = String(bodyOrQueryProxy ?? profile?.proxy ?? "");
  return { profile, profileCode, proxy };
}

function buildMobileAndStealthSyncRoutes(deps) {
  const { sessionManager, profileService, send } = deps;

  return [
    {
      id: "profiles.mobileVaultStatus",
      method: "GET",
      pattern: /^\/api\/profiles\/([^/]+)\/mobile-vault$/,
      async handler(ctx) {
        try {
          const { getMobileVaultProfileStatus } = require("../lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const { profileCode, proxy } = resolveMobileVaultTarget(
            profileService,
            rawIdOrName,
            ctx.query?.get?.("proxy"),
          );
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
          const { switchAndroidDeviceProfile, getMobileVaultProfileStatus } = require("../lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const { profileCode, proxy } = resolveMobileVaultTarget(profileService, rawIdOrName, ctx.body?.proxy);
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
          const { backupAndroidProfileSnapshot, getMobileVaultProfileStatus } = require("../lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const { profileCode, proxy } = resolveMobileVaultTarget(profileService, rawIdOrName, ctx.body?.proxy);
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
          const { restoreAndroidProfileSnapshot, getMobileVaultProfileStatus } = require("../lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const { profileCode, proxy } = resolveMobileVaultTarget(profileService, rawIdOrName, ctx.body?.proxy);
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
          const { launchMobileScreenMirror, getMobileVaultProfileStatus } = require("../lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const { profileCode, proxy } = resolveMobileVaultTarget(profileService, rawIdOrName, ctx.body?.proxy);
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
          const { syncMobileVaultTagToP0020, getMobileVaultProfileStatus } = require("../lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const { profileCode, proxy } = resolveMobileVaultTarget(profileService, rawIdOrName, ctx.body?.proxy);
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
          const { enableAndroidWifiAdbBridge, getMobileVaultProfileStatus } = require("../lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const { profileCode, proxy } = resolveMobileVaultTarget(profileService, rawIdOrName, ctx.body?.proxy);
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
          const { extractMobileCookiesToBrowserProfile, getMobileVaultProfileStatus } = require("../lib/mobile-stealth-bridge.cjs");
          const { writeBackVaultCookiesToProfileDisk, getProfileCookieGuardStatus } = require("../lib/profile-cookie-guard.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const { profile, profileCode, proxy } = resolveMobileVaultTarget(profileService, rawIdOrName, ctx.body?.proxy);
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
          const { refreshPlayIntegrityFixConfig, getMobileVaultProfileStatus } = require("../lib/mobile-stealth-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const { profileCode, proxy } = resolveMobileVaultTarget(profileService, rawIdOrName, ctx.body?.proxy);
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
        const rawLim = typeof ctx.query?.get === "function" ? ctx.query.get("limit") : ctx.query?.limit;
        const limit = Math.min(100, Math.max(1, Number(rawLim) || 20));
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
        const { healStaleRunningP0020Rows } = require("../lib/stealth-multiplatform-sync.cjs");
        const queryStale =
          typeof ctx.query?.get === "function" ? ctx.query.get("staleAfterMs") : ctx.query?.staleAfterMs;
        const staleAfterMs = Math.max(
          0,
          Number(ctx.body?.staleAfterMs ?? queryStale ?? 15 * 60 * 1000) || 0,
        );
        const result = await healStaleRunningP0020Rows({
          profileService,
          sessionManager,
          staleAfterMs,
        });
        return send.json(ctx.res, result.ok ? 200 : 500, result);
      },
    },
  ];
}

function buildAndroidVaultRoutes(deps) {
  const { send, electronDir } = deps;

  return [
    {
      id: "androidVault.profiles",
      method: "GET",
      pattern: /^\/api\/android-vault\/profiles$/,
      async handler(ctx) {
        try {
          const bridge = await loadAndroidStealthBridge(electronDir);
          if (!bridge) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
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
          const bridge = await loadAndroidStealthBridge(electronDir);
          if (!bridge) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
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
          const bridge = await loadAndroidStealthBridge(electronDir);
          if (!bridge) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
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
          const bridge = await loadAndroidStealthBridge(electronDir);
          if (!bridge) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
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
          const bridge = await loadAndroidStealthBridge(electronDir);
          if (!bridge) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
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
          const clientMod = await loadStealthCdpClient(electronDir);
          if (!clientMod) return send.json(ctx.res, 404, { ok: false, error: "stealth_cdp_client_not_found" });
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
          const clientMod = await loadStealthCdpClient(electronDir);
          if (!clientMod) return send.json(ctx.res, 404, { ok: false, error: "stealth_cdp_client_not_found" });
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
          const clientMod = await loadStealthCdpClient(electronDir);
          if (!clientMod) return send.json(ctx.res, 404, { ok: false, error: "stealth_cdp_client_not_found" });
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
          const clientMod = await loadStealthCdpClient(electronDir);
          if (!clientMod) return send.json(ctx.res, 404, { ok: false, error: "stealth_cdp_client_not_found" });
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
          const bridge = await loadAndroidStealthBridge(electronDir);
          if (!bridge) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
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
          const bridge = await loadAndroidStealthBridge(electronDir);
          if (!bridge) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
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
          const bridge = await loadAndroidStealthBridge(electronDir);
          if (!bridge) return send.json(ctx.res, 404, { ok: false, error: "android_bridge_not_found" });
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
  ];
}

function buildMultiplatformSyncRoutes(deps) {
  return [...buildMobileAndStealthSyncRoutes(deps), ...buildAndroidVaultRoutes(deps)];
}

module.exports = {
  buildMobileAndStealthSyncRoutes,
  buildAndroidVaultRoutes,
  buildMultiplatformSyncRoutes,
};
