"use strict";
/**
 * BrowserHub API Server — cấp CDP/profile/automation cho các tool trong workspace.
 * Port: 6003 (bind 127.0.0.1).
 *
 * Dispatcher mỏng: auth → match route registry (api-routes.cjs) → handler.
 * Thêm endpoint = thêm descriptor trong api-routes.cjs / automation/plugins.cjs.
 */
const http = require("node:http");

const { checkAuth, getConfiguredToken } = require("./lib/api-auth.cjs");
const { JobQueue } = require("./lib/job-queue.cjs");
const { buildRoutes } = require("./api-routes.cjs");

const DEFAULT_API_PORT = 6003;
const API_HOST = "127.0.0.1";

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

function sendSse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
    Connection: "keep-alive"
  });
  return {
    send(data) { res.write(`data: ${JSON.stringify(data)}\n\n`); },
    end() { res.end(); }
  };
}

const send = { json: sendJson, sse: sendSse };

function startApiServer({ sessionManager, profileService, userDataRoot = "", port }) {
  const API_PORT = Number(port) || Number(process.env.STEALTH_API_PORT) || DEFAULT_API_PORT;
  const concurrency = Number(process.env.STEALTH_JOB_CONCURRENCY) || 1;
  const jobQueue = new JobQueue({ concurrency });

  const services = {
    sessionManager,
    profileService,
    jobQueue,
    userDataRoot,
    send
  };
  const { routes, util } = buildRoutes(services);

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Token"
      });
      res.end();
      return;
    }

    let urlPath;
    let query = new URLSearchParams();
    try {
      const parsed = new URL(req.url ?? "/", "http://localhost");
      urlPath = parsed.pathname;
      query = parsed.searchParams;
    } catch {
      urlPath = "/";
    }

    // GET /api/health — luôn mở (probe + báo có cần auth không).
    if (req.method === "GET" && urlPath === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        product: "P0003",
        apiPort: API_PORT,
        authRequired: Boolean(getConfiguredToken()),
        features: ["cdp", "jobs", "plugins"]
      });
    }

    // Auth gate.
    const auth = checkAuth(req, urlPath);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    try {
      const route = routes.find((r) => r.method === req.method && r.pattern.test(urlPath));
      if (!route) return sendJson(res, 404, { ok: false, error: "Not found" });

      const params = urlPath.match(route.pattern) || [];
      const body = req.method === "POST" ? await readBody(req) : {};
      const ctx = { req, res, urlPath, params, query, body, send, util, services };

      await route.handler(ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      try { sendJson(res, 500, { ok: false, error: msg }); }
      catch { res.end(); }
    }
  });

  server.listen(API_PORT, API_HOST, () => {
    const mode = getConfiguredToken() ? "auth=token" : "auth=open";
    console.log(`[BrowserHub] API running → http://${API_HOST}:${API_PORT} (${mode}, concurrency=${concurrency})`);
  });

  server.on("error", (err) => {
    console.error("[BrowserHub] Server error:", err.message);
  });

  return server;
}

module.exports = { startApiServer };
