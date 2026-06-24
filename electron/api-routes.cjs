"use strict";
/**
 * BrowserHub route registry.
 *
 * Core routes (profile lifecycle, CDP passthrough, jobs) + domain plugins (fb/meta)
 * gộp thành một mảng descriptor. Dispatcher trong api-server.cjs duyệt mảng này —
 * thêm route mới = thêm descriptor, không sửa dispatcher.
 */
const path = require("node:path");
const os = require("node:os");

const { domainPlugins } = require("./automation/plugins.cjs");
const { validateOpenUrlPayload } = require("./ipc-contracts.cjs");
const { checkProxy, geoConsistency } = require("./lib/proxy-pool.cjs");

/**
 * @param {{ sessionManager, profileService, jobQueue, userDataRoot, send }} services
 */
function buildRoutes(services) {
  const { sessionManager, profileService, jobQueue, userDataRoot, send } = services;

  async function ensureProfileContext(profileId, { skipStartupUrl = false } = {}) {
    const profile = profileService.getProfile(profileId);
    if (!profile) throw new Error("Profile không tồn tại");
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
    const byId = String(body.profile_id ?? body.profileId ?? "").trim();
    if (byId) return byId;
    const name = String(body.profile_name ?? body.profileName ?? "").trim();
    if (!name) return null;
    const hit = profileService.listProfiles().find((p) => String(p.name).trim() === name);
    return hit?.id ?? null;
  }

  function screenshotsRoot() {
    return userDataRoot || path.join(os.tmpdir(), "stealth-browser-api");
  }

  // ── Op dùng chung (gọi trực tiếp HOẶC bọc trong job) ─────────────────────
  async function performOpenUrl(rawBody, emit = () => {}) {
    const { runOpenUrl } = require("./automation/open-url.cjs");
    const profileId = resolveProfileId(rawBody);
    if (!profileId) throw new Error("profile_id hoặc profile_name là bắt buộc");
    const safe = validateOpenUrlPayload({
      profileId,
      targetUrl: rawBody.target_url ?? rawBody.targetUrl,
      screenshot: rawBody.screenshot !== false,
      closeWhenDone: Boolean(rawBody.close_when_done ?? rawBody.closeWhenDone),
      workflowAction: rawBody.workflow_action ?? rawBody.workflowAction,
      workflowId: rawBody.workflow_id ?? rawBody.workflowId,
      steps: rawBody.steps,
      inspectMode: Boolean(rawBody.inspect_mode ?? rawBody.inspectMode)
    });
    emit({ event: "progress", msg: `Mở URL: ${safe.targetUrl}` });
    const { profile, context } = await ensureProfileContext(safe.profileId, { skipStartupUrl: true });
    const result = await runOpenUrl({
      context,
      profile,
      targetUrl: safe.targetUrl,
      screenshot: safe.screenshot,
      closeWhenDone: safe.closeWhenDone,
      screenshotsRoot: screenshotsRoot(),
      onCloseProfile: () => sessionManager.close(profile.id),
      workflowAction: safe.workflowAction,
      steps: safe.steps,
      inspectMode: safe.inspectMode,
      workflowId: safe.workflowId
    });
    for (const log of result.logs || []) emit({ event: "log", ...log });
    return result;
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

  // ── Core routes ──────────────────────────────────────────────────────────
  const coreRoutes = [
    {
      id: "profiles.list",
      method: "GET",
      pattern: /^\/api\/profiles$/,
      handler(ctx) {
        sessionManager.reconcileActiveStatuses();
        const q = ctx.query || new URLSearchParams();
        const enrich = (p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          running: sessionManager.isRunning(p.id),
          debugPort: sessionManager.getDebugPort(p.id) || undefined
        });

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
        const profile = profileService.getProfile(profileId);
        if (!profile) return send.json(ctx.res, 404, { ok: false, error: "Profile không tồn tại" });
        const result = await sessionManager.launch(profile);
        // Launch qua API → minimize đúng cửa sổ profile này (CDP), không cướp focus.
        if (result.ok) await sessionManager.minimizeProfile(profileId).catch(() => undefined);
        return send.json(ctx.res, 200, result);
      }
    },
    {
      id: "profiles.close",
      method: "POST",
      pattern: /^\/api\/profiles\/([^/]+)\/close$/,
      async handler(ctx) {
        const result = await sessionManager.close(ctx.params[1]);
        return send.json(ctx.res, 200, result);
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
      id: "profiles.cdp",
      method: "GET",
      pattern: /^\/api\/profiles\/([^/]+)\/cdp$/,
      async handler(ctx) {
        const profileId = ctx.params[1];
        if (!sessionManager.isRunning(profileId)) {
          return send.json(ctx.res, 409, { ok: false, error: "Profile chưa launch — không có CDP endpoint" });
        }
        const info = await sessionManager.getCdpInfo(profileId);
        if (!info.ok) return send.json(ctx.res, 503, { ok: false, error: info.reason || "CDP không sẵn sàng" });
        return send.json(ctx.res, 200, { ok: true, ...info });
      }
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
        const profileId = resolveProfileId(ctx.body || {});
        if (!proxyStr && profileId) {
          profile = profileService.getProfile(profileId);
          proxyStr = String(profile?.proxy || "").trim();
        }
        if (!proxyStr) {
          return send.json(ctx.res, 400, { ok: false, error: "Cần `proxy` hoặc `profile_id` có proxy" });
        }
        const health = await checkProxy(proxyStr, {
          timeoutMs: Number(ctx.body.timeout_ms ?? ctx.body.timeoutMs) || 8000
        });
        let geo = null;
        if (health.alive && profile) {
          geo = geoConsistency(profile, health);
        }
        return send.json(ctx.res, 200, { ok: true, proxy: proxyStr, health, geo });
      }
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
  return {
    routes: [...coreRoutes, ...domainPlugins],
    util,
    jobRunners
  };
}

module.exports = { buildRoutes };
