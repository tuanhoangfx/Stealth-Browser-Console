"use strict";
/**
 * BrowserHub route registry — thin dispatcher & re-export facade.
 *
 * Core routes (system/runtime, profile lifecycle, cookie guard, multiplatform/mobile sync,
 * CDP/proxy/jobs, MV3 extensions) + domain plugins (`fb` / `meta`) are assembled into a
 * single ordered descriptor array consumed by `electron/api-server.cjs`.
 *
 * Route slices live under `./routes/*.cjs` (`electron/**` relative `require("./routes/...")`
 * for seamless Electron ASAR packaging and Zero-Restart hot-patch reloads).
 */
const path = require("node:path");

const { domainPlugins } = require("./automation/plugins.cjs");
const { isAgentSmokeLaunch } = require("./lib/agent-smoke-mode.cjs");

const ROUTES_DIR_SUFFIX = `${path.sep}electron${path.sep}routes${path.sep}`;

function evictRouteSliceCache() {
  try {
    for (const ck of Object.keys(require.cache || {})) {
      const norm = ck.replace(/\//g, path.sep);
      if (norm.toLowerCase().includes(ROUTES_DIR_SUFFIX.toLowerCase()) && norm.endsWith(".cjs")) {
        delete require.cache[ck];
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ sessionManager, profileService, jobQueue, userDataRoot, send }} services
 */
function buildRoutes(services) {
  const { sessionManager, profileService, jobQueue, userDataRoot, send } = services;
  global.__stealthSessionManager = sessionManager;
  global.__stealthJobQueue = jobQueue;

  evictRouteSliceCache();

  const {
    ELECTRON_DIR,
    PRODUCT_ROOT,
    refreshCoreRouteModuleCaches,
    startDevLiveVersionWatcher,
    createRouteRuntimeHelpers,
  } = require("./routes/http-helpers-and-guards.cjs");
  const { installUnifiedSessionManagerRuntime } = require("./routes/session-runtime-bridge.cjs");
  const { buildSystemAndRuntimeRoutes } = require("./routes/system-and-runtime-routes.cjs");
  const { buildProfileRoutes } = require("./routes/profile-routes.cjs");
  const {
    buildCookieGuardRoutes,
    buildExtensionRoutes,
  } = require("./routes/extension-and-cookie-routes.cjs");
  const {
    buildMobileAndStealthSyncRoutes,
    buildAndroidVaultRoutes,
  } = require("./routes/multiplatform-sync-routes.cjs");
  const {
    buildCdpProxyAndJobRoutes,
    buildJobEventsRoutes,
  } = require("./routes/session-and-cdp-routes.cjs");

  refreshCoreRouteModuleCaches({ profileService, userDataRoot });
  const lockGuards = installUnifiedSessionManagerRuntime({
    sessionManager,
    profileService,
    userDataRoot,
  });
  startDevLiveVersionWatcher(sessionManager);

  const runtimeHelpers = createRouteRuntimeHelpers({
    sessionManager,
    profileService,
    userDataRoot,
    send,
  });

  const deps = {
    sessionManager,
    profileService,
    jobQueue,
    userDataRoot,
    send,
    electronDir: ELECTRON_DIR,
    productRoot: PRODUCT_ROOT,
    lockGuards,
    runtimeHelpers,
  };

  const coreRoutes = [
    ...buildSystemAndRuntimeRoutes(deps),
    ...buildProfileRoutes(deps),
    ...buildCookieGuardRoutes(deps),
    ...buildMobileAndStealthSyncRoutes(deps),
    ...buildCdpProxyAndJobRoutes(deps),
    ...buildExtensionRoutes(deps),
    ...buildAndroidVaultRoutes(deps),
    ...buildJobEventsRoutes(deps),
  ];

  const { ensureProfileContext, resolveProfileId, jobRunners } = runtimeHelpers;
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
    jobRunners,
  };
}

module.exports = { buildRoutes };
