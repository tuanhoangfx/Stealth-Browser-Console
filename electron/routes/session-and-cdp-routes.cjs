"use strict";
/**
 * CDP endpoint lookup, Billing Vault autofill, Automation `open-url` execution,
 * Proxy / Multi-Country VPN Pool health & acquisition, and Job Queue / SSE stream routes.
 */
const {
  checkProxy,
  geoConsistency,
  loadVpnProxyPoolModule,
  parseCountryProxySpec,
  parseProxy,
  probeTcpPort,
  resolveProfileCountryProxy,
} = require("../lib/proxy-pool.cjs");
const { extractProfileCode } = require("../lib/profile-code.cjs");
const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");

function collectRunningProfileModeMap(sessionManager) {
  const runningProfiles = {};
  try {
    const running = (typeof sessionManager.listRunning === "function" ? sessionManager.listRunning() : []) || [];
    for (const r of running) {
      const rawCode = String(r.name || r.id || "").trim().match(/^\d{1,5}/)?.[0] || "";
      if (!rawCode) continue;
      const code = rawCode.padStart(4, "0");
      const mode = r.headless === true || r.shadowLane === true ? "headless" : "headed";
      if (!runningProfiles[code] || mode === "headed") {
        runningProfiles[code] = mode;
      }
    }
    const { listProfileChromeWindowsNative } = require("../lib/taskbar-apply-worker.cjs");
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
  return runningProfiles;
}

async function enrichVpnCatalogCountries(catalog, runningProfiles, { skipLivePing = false } = {}) {
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
        const code = String(vp.browser || "")
          .trim()
          .replace(/\D/g, "")
          .padStart(4, "0");
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
  return { byCountryOut, liveVaultAliveCount };
}

function buildCdpProxyAndJobRoutes(deps) {
  const {
    sessionManager,
    profileService,
    jobQueue,
    send,
    runtimeHelpers,
  } = deps;
  const { resolveProfileId, performOpenUrl, jobRunners } = runtimeHelpers;

  return [
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
        if (!allowUserHeaded && sessionManager.isUserInteractiveSession?.(profileId) === true) {
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
      },
    },
    {
      id: "profiles.autofillBilling",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/autofill-billing$/,
      async handler(ctx) {
        try {
          const { autofillProfileBillingViaCdp } = require("../lib/billing-autofill-bridge.cjs");
          const rawIdOrName = decodeURIComponent(ctx.params[1] || "");
          const profile = profileService.resolveProfileForLaunch({ id: rawIdOrName, name: rawIdOrName });
          const profileId = profile?.id || rawIdOrName;
          const profileCode = profile
            ? extractProfileCode(profile.name, profile.id)
            : rawIdOrName.replace(/\D/g, "").padStart(4, "0");
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
        const { listMaskedBillingCards, syncP0020CardsToLocalCache } = require("../lib/billing-autofill-bridge.cjs");
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
        const { upsertBillingCardInVault } = require("../lib/billing-autofill-bridge.cjs");
        const res = upsertBillingCardInVault(ctx.body?.alias || "default", ctx.body || {});
        return send.json(ctx.res, res.ok ? 200 : 400, res);
      },
    },
    {
      id: "billingVault.resolveCard",
      method: "POST",
      pattern: /^\/api\/billing-vault\/resolve-card$/,
      async handler(ctx) {
        const {
          resolveCandidateBillingCardsFromVault,
          syncP0020CardsToLocalCache,
        } = require("../lib/billing-autofill-bridge.cjs");
        let pool = resolveCandidateBillingCardsFromVault(ctx.body || {});
        if (!pool.ok || !pool.candidates || pool.candidates.length === 0) {
          await syncP0020CardsToLocalCache().catch(() => null);
          pool = resolveCandidateBillingCardsFromVault(ctx.body || {});
        }
        const first = pool.candidates?.[0] || null;
        return send.json(ctx.res, pool.ok ? 200 : 404, {
          ok: pool.ok,
          ...(first || {}),
          candidates: pool.candidates || [],
        });
      },
    },
    {
      id: "billingVault.reportCardOutcome",
      method: "POST",
      pattern: /^\/api\/billing-vault\/report-card-outcome$/,
      handler(ctx) {
        const { recordCardStripeOutcome } = require("../lib/billing-autofill-bridge.cjs");
        const res = recordCardStripeOutcome(ctx.body || {});
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
      },
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
          timeoutMs: Number(ctx.body.timeout_ms ?? ctx.body.timeoutMs) || 8000,
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
      },
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
        const keys =
          typeof mod.getSurfsharkWireGuardKeyPool === "function"
            ? mod.getSurfsharkWireGuardKeyPool(catalog)
            : [];
        const runningProfiles = collectRunningProfileModeMap(sessionManager);
        const { byCountryOut, liveVaultAliveCount } = await enrichVpnCatalogCountries(
          catalog,
          runningProfiles,
          { skipLivePing },
        );

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
        const country = String(ctx.body?.country || ctx.body?.countryCode || "US")
          .trim()
          .toUpperCase();
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
    // ── Job model (`jobs.stats` MUST precede `jobs.get` so `/api/jobs/stats` is not swallowed) ──
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
            supported: Object.keys(jobRunners),
          });
        }
        const payload = ctx.body.payload ?? ctx.body;
        const profileId = resolveProfileId(payload || {}) || undefined;
        const id = jobQueue.enqueue({
          type,
          key: profileId, // dedupe: 1 job/profile tại một thời điểm
          meta: { profileId },
          retries: Number(ctx.body.retries) || 0,
          retryDelayMs: Number(ctx.body.retry_delay_ms ?? ctx.body.retryDelayMs) || 1500,
          jitterMs: Number(ctx.body.jitter_ms ?? ctx.body.jitterMs) || 0,
          run: (emit) => runner(payload, emit),
        });
        const status = jobQueue.get(id)?.status ?? "queued";
        // Trùng key → trả lại job đang chạy thay vì tạo mới.
        return send.json(ctx.res, 202, { ok: true, jobId: id, status, deduped: status !== "queued" || undefined });
      },
    },
    {
      id: "jobs.list",
      method: "GET",
      pattern: /^\/api\/jobs$/,
      handler(ctx) {
        return send.json(ctx.res, 200, { ok: true, jobs: jobQueue.list() });
      },
    },
    {
      id: "jobs.stats",
      method: "GET",
      pattern: /^\/api\/jobs\/stats$/,
      handler(ctx) {
        return send.json(ctx.res, 200, { ok: true, stats: jobQueue.stats() });
      },
    },
    {
      id: "jobs.get",
      method: "GET",
      pattern: /^\/api\/jobs\/([^/]+)$/,
      handler(ctx) {
        const job = jobQueue.get(ctx.params[1]);
        if (!job) return send.json(ctx.res, 404, { ok: false, error: "Job không tồn tại" });
        return send.json(ctx.res, 200, { ok: true, job });
      },
    },
  ];
}

function buildJobEventsRoutes(deps) {
  const { jobQueue, send } = deps;

  return [
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
      },
    },
  ];
}

function buildSessionAndCdpRoutes(deps) {
  return [...buildCdpProxyAndJobRoutes(deps), ...buildJobEventsRoutes(deps)];
}

module.exports = {
  collectRunningProfileModeMap,
  enrichVpnCatalogCountries,
  buildCdpProxyAndJobRoutes,
  buildJobEventsRoutes,
  buildSessionAndCdpRoutes,
};
