"use strict";
/**
 * HTTP routes for the unified P0003 Deferred User-Headed Queue SSOT (`/api/automation/deferred-queue*`).
 *
 * Endpoints:
 * - `GET  /api/automation/deferred-queue`          — Reconciles live headed sessions + returns normalized queue
 * - `POST /api/automation/deferred-queue/enqueue`  — Deduplicated enqueue (rejects customer `8xxx` with 403)
 * - `POST /api/automation/deferred-queue/claim`    — Short-lease claim of ready items
 * - `POST /api/automation/deferred-queue/complete` — Mark item completed or schedule exponential backoff retry
 * - `POST /api/automation/deferred-queue/drain`    — Trigger Multi-Domain Auto-Drainer for ready items
 */
const {
  claimDeferredItems,
  completeDeferredItem,
  enqueueDeferredItem,
  isCustomer8xxxProfileCode,
  normalizeQueueProfileCode,
  normalizeTaskType,
  readDeferredQueue,
} = require("../lib/deferred-headed-queue-ssot.cjs");
const {
  collectLiveHeadedSnapshot,
  drainReadyDeferredQueue,
} = require("../lib/deferred-queue-drainer.cjs");

function buildDeferredQueueRoutes(deps) {
  const { sessionManager, profileService, send } = deps;

  return [
    {
      id: "automation.deferredQueue.get",
      method: "GET",
      pattern: /^\/api\/automation\/deferred-queue$/,
      handler(ctx) {
        try {
          const { runningHeadedCodes, runningHeadedIds, resolveProfile } = collectLiveHeadedSnapshot({
            sessionManager,
            profileService,
          });
          const store = readDeferredQueue({
            runningHeadedCodes,
            runningHeadedIds,
            resolveProfile,
          });
          const q = ctx.query;
          const filterCode = q?.get?.("code") ? normalizeQueueProfileCode(q.get("code")) : "";
          const filterType = q?.get?.("taskType") ? normalizeTaskType(q.get("taskType")) : "";
          const filterStatus = q?.get?.("status") ? String(q.get("status")).trim() : "";
          const includeHistory = q?.get?.("includeHistory") === "1";

          let items = Array.isArray(store.items) ? store.items : [];
          if (filterCode) items = items.filter((x) => x.profileCode === filterCode);
          if (filterType) items = items.filter((x) => x.taskType === filterType);
          if (filterStatus) items = items.filter((x) => x.status === filterStatus);

          return send.json(ctx.res, 200, {
            ok: true,
            schemaVersion: store.schemaVersion,
            ssotPath: store.ssotPath,
            updatedAt: store.updatedAt,
            runningHeadedCodes: [...runningHeadedCodes],
            pendingWhileUserHeadedCount: store.pendingWhileUserHeadedCount,
            readyForRetryCount: store.readyForRetryCount,
            claimedCount: store.claimedCount,
            completedHistoryCount: store.completedHistoryCount,
            totalActiveCount: store.totalActiveCount,
            items,
            pendingWhileUserHeaded: store.pendingWhileUserHeaded,
            readyForRetry: store.readyForRetry,
            completedHistory: includeHistory
              ? store.completedHistory
              : (store.completedHistory || []).slice(0, 20),
          });
        } catch (err) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    },
    {
      id: "automation.deferredQueue.enqueue",
      method: "POST",
      pattern: /^\/api\/automation\/deferred-queue\/enqueue$/,
      handler(ctx) {
        try {
          const body = ctx.body && typeof ctx.body === "object" ? ctx.body : {};
          const { runningHeadedCodes, runningHeadedIds, resolveProfile } = collectLiveHeadedSnapshot({
            sessionManager,
            profileService,
          });
          const rawCode = normalizeQueueProfileCode(body.code || body.profileCode || body.profileSlot || body.profileId);
          const prof = resolveProfile(body.profileId || rawCode);
          const resolvedCode = normalizeQueueProfileCode(prof?.name || rawCode);
          if (isCustomer8xxxProfileCode(resolvedCode) || isCustomer8xxxProfileCode(rawCode)) {
            return send.json(ctx.res, 403, {
              ok: false,
              skippedCustomer8xxx: true,
              quarantined: true,
              code: resolvedCode || rawCode,
              error: "customer_8xxx_forbidden",
            });
          }
          const isHeaded =
            body.isHeaded !== undefined
              ? Boolean(body.isHeaded)
              : Boolean(
                  (resolvedCode && runningHeadedCodes.has(resolvedCode)) ||
                    (prof?.id && runningHeadedIds.has(String(prof.id))) ||
                    (prof?.id && sessionManager?.isUserInteractiveSession?.(prof.id)),
                );
          const out = enqueueDeferredItem(
            { ...body, isHeaded },
            { resolveProfile },
          );
          if (!out.ok) {
            return send.json(ctx.res, out.skippedCustomer8xxx ? 403 : 400, out);
          }
          return send.json(ctx.res, 200, {
            ok: true,
            deduped: out.deduped,
            code: out.code,
            item: out.item,
            pendingWhileUserHeadedCount: out.queue.pendingWhileUserHeadedCount,
            readyForRetryCount: out.queue.readyForRetryCount,
          });
        } catch (err) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    },
    {
      id: "automation.deferredQueue.claim",
      method: "POST",
      pattern: /^\/api\/automation\/deferred-queue\/claim$/,
      handler(ctx) {
        try {
          const body = ctx.body && typeof ctx.body === "object" ? ctx.body : {};
          const { runningHeadedCodes, runningHeadedIds, resolveProfile } = collectLiveHeadedSnapshot({
            sessionManager,
            profileService,
          });
          const out = claimDeferredItems(
            {
              owner: body.owner || "worker",
              taskTypes: Array.isArray(body.taskTypes) ? body.taskTypes : null,
              codes: Array.isArray(body.codes) ? body.codes : null,
              limit: Number(body.limit) || 10,
              leaseMs: Number(body.leaseMs) || 120_000,
            },
            {
              runningHeadedCodes,
              runningHeadedIds,
              resolveProfile,
            },
          );
          return send.json(ctx.res, 200, {
            ok: true,
            count: out.count,
            claimed: out.claimed,
            readyForRetryCount: out.queue.readyForRetryCount,
            claimedCount: out.queue.claimedCount,
          });
        } catch (err) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    },
    {
      id: "automation.deferredQueue.complete",
      method: "POST",
      pattern: /^\/api\/automation\/deferred-queue\/complete$/,
      handler(ctx) {
        try {
          const body = ctx.body && typeof ctx.body === "object" ? ctx.body : {};
          const out = completeDeferredItem({
            id: body.id || null,
            dedupeKey: body.dedupeKey || null,
            code: body.code || body.profileCode || null,
            taskType: body.taskType || null,
            taskReason: body.taskReason || null,
            entityKey: body.entityKey || null,
            account: body.account || null,
            ok: body.ok !== false,
            outcome: body.outcome || null,
            error: body.error || null,
            backoffMs: body.backoffMs || null,
            maxAttempts: body.maxAttempts || 8,
          });
          return send.json(ctx.res, 200, {
            ok: true,
            matchedCount: out.matchedCount,
            affected: out.affected,
            completedHistoryCount: out.completedHistoryCount,
            pendingWhileUserHeadedCount: out.queue.pendingWhileUserHeadedCount,
            readyForRetryCount: out.queue.readyForRetryCount,
          });
        } catch (err) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    },
    {
      id: "automation.deferredQueue.drain",
      method: "POST",
      pattern: /^\/api\/automation\/deferred-queue\/drain$/,
      handler(ctx) {
        try {
          const body = ctx.body && typeof ctx.body === "object" ? ctx.body : {};
          const res = drainReadyDeferredQueue({
            sessionManager,
            profileService,
            targetCodes: Array.isArray(body.codes) ? body.codes : null,
            taskTypes: Array.isArray(body.taskTypes) ? body.taskTypes : null,
            dryRun: Boolean(body.dryRun),
          });
          return send.json(ctx.res, 200, res);
        } catch (err) {
          return send.json(ctx.res, 500, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    },
  ];
}

module.exports = {
  buildDeferredQueueRoutes,
};
