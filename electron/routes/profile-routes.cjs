"use strict";
/**
 * Profile catalog CRUD, launch/close lifecycle, agent-pool (`9000–9999`) provisioning,
 * active session listings, activity logs, events, and run history routes.
 */
const {
  launchProfile: launchProfileOp,
  resetProfileToLocalIpIfUnpinned,
} = require("../services/profile-ops.cjs");
const { extractProfileCode } = require("../lib/profile-code.cjs");
const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");
const {
  parseAgentSmokeFlag,
  parseAgentCallerId,
  runWithAgentSmokeRequest,
  getAgentCallerId,
} = require("../lib/agent-smoke-context.cjs");

function buildProfileRoutes(deps) {
  const {
    sessionManager,
    profileService,
    jobQueue,
    userDataRoot,
    send,
    lockGuards,
    runtimeHelpers,
  } = deps;
  const { isCodePriorityLocked, readActivePriorityLockedCodes } = lockGuards;
  const { patchProfileHandler } = runtimeHelpers;

  return [
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
          names = ctx.body.names
            .map((n) => String(n || "").trim().padStart(4, "0"))
            .filter((n) => /^9\d{3}$/.test(n));
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
        const { collectWaitingAgentHeadlessState } = require("../lib/waiting-agent-profiles.cjs");
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
        const { boostWaitingAgentProfile } = require("../lib/waiting-agent-profiles.cjs");
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
        const { recordProfileActivityLog } = require("../lib/waiting-agent-profiles.cjs");
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
        if (typeof sessionManager.reconcileActiveStatuses === "function") {
          sessionManager.reconcileActiveStatuses();
        } else if (typeof sessionManager.syncProfileStatuses === "function") {
          sessionManager.syncProfileStatuses();
        }
        const q = ctx.query || new URLSearchParams();
        const includeUserHeadedPort =
          q.get("includeUserHeadedPort") === "1" ||
          process.env.STEALTH_ALLOW_AGENT_ON_USER_HEADED === "1";
        // Build O(1) lookup map once per request instead of O(N) legacySm.listRunning() per profile!
        const runningRows = (typeof sessionManager.listRunning === "function" ? sessionManager.listRunning() : []) || [];
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
                : sess?.debugPort
                  ? Number(sess.debugPort)
                  : undefined,
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
            dir: q.get("dir") ?? "desc",
          });
          if (page.profiles.length <= 200) {
            const nowWarm = Date.now();
            if (!globalThis.__STEALTH_LAST_BADGE_WARM_AT__ || nowWarm - globalThis.__STEALTH_LAST_BADGE_WARM_AT__ > 15_000) {
              globalThis.__STEALTH_LAST_BADGE_WARM_AT__ = nowWarm;
              try {
                const { warmBadgeIcosForProfiles } = require("../lib/profile-taskbar-native.cjs");
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
            offset: page.offset,
          });
        }

        // Backward-compat: không param → trả toàn bộ (P0025 dựa vào điều này).
        // Dùng projection lite (id/name/status) → ~7x nhanh hơn ở 5k+ row.
        const profiles = profileService.listProfilesLite().map(enrich);
        return send.json(ctx.res, 200, { ok: true, profiles });
      },
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
            const profile = profileService.getProfile(profileId);
            const effectiveHeadless = reqHeadless ?? (Boolean(profile?.headless) || isAgentSmokeLaunch());
            if (!effectiveHeadless && ctx.body?.keepVisible !== true) {
              await sessionManager.minimizeProfile(profileId).catch(() => undefined);
              // CDP minimize can race the first badge stamp — force re-apply after.
              try {
                const { scheduleProfileTaskbarBadgeApply, formatProfileWindowLabel } = require("../lib/profile-window-title.cjs");
                const { readSidecarPid } = require("../lib/profile-user-data-repair.cjs");
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
      },
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
          resetProfileToLocalIpIfUnpinned(profileService, resolvedId);
        }
        return send.json(ctx.res, 200, result);
      },
    },
    {
      id: "sessions.closeAll",
      method: "POST",
      pattern: /^\/api\/sessions\/close-all$/,
      async handler(ctx) {
        const headlessOnly = Boolean(ctx.body?.headlessOnly || isAgentSmokeLaunch());
        const priorityLockedCodes = readActivePriorityLockedCodes();
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
      },
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
      },
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
          status: profile?.status ?? "unknown",
        });
      },
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
      },
    },
    {
      id: "profiles.update",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/update$/,
      handler(ctx) {
        return patchProfileHandler(ctx);
      },
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
  ];
}

module.exports = {
  buildProfileRoutes,
};
