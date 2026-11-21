import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function mobileFarmDevApiPlugin({ toolRoot }) {
  return {
    name: "p0003-mobile-farm-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || "/";
        let urlPath = rawUrl;
        let query = new URLSearchParams();
        try {
          const parsed = new URL(rawUrl, "http://127.0.0.1");
          urlPath = parsed.pathname;
          query = parsed.searchParams;
        } catch {
          /* ignore */
        }

        const sendJson = (status, data) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(data));
        };

        if (req.method === "GET" && urlPath === "/api/mobile-stealth/execution-board") {
          try {
            const boardPath = path.join(toolRoot, "electron", "lib", "mobile-farm-execution-board.cjs");
            try {
              delete require.cache[require.resolve(boardPath)];
            } catch {
              /* ignore */
            }
            const mod = require(boardPath);
            return sendJson(200, mod.collectMobileFarmExecutionBoard());
          } catch (err) {
            return sendJson(500, { ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        }

        if (req.method === "POST" && (urlPath === "/api/mobile-farm/daemon-control" || urlPath === "/api/mobile-stealth/daemon-control")) {
          try {
            let bodyRaw = "";
            for await (const chunk of req) bodyRaw += chunk;
            const body = bodyRaw ? JSON.parse(bodyRaw) : {};
            const boardPath = path.join(toolRoot, "electron", "lib", "mobile-farm-execution-board.cjs");
            try {
              delete require.cache[require.resolve(boardPath)];
            } catch {
              /* ignore */
            }
            const mod = require(boardPath);
            const result = mod.controlMobileFarmDaemon({
              daemonId: body?.daemonId,
              action: body?.action || "start",
            });
            return sendJson(result.ok ? 200 : 400, result);
          } catch (err) {
            return sendJson(500, { ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        }

        if (req.method === "GET" && urlPath === "/api/mobile-sim/fleet") {
          try {
            const { readCachedMobileSimFleetState, getMobileSimFleetCatalog } = await import(
              "file:///E:/Dev/Tool/scripts/lib/android-adb-sim-bridge.mjs"
            );
            const state = readCachedMobileSimFleetState?.();
            if (state && Array.isArray(state.devices) && state.devices.length > 0) {
              const devices = state.devices;
              const otpFeed = Array.isArray(state.otpFeed) ? state.otpFeed : [];
              return sendJson(200, {
                ok: true,
                updatedAt: state.updatedAt || null,
                onlineCount: state.onlineCount ?? devices.filter((d) => d.online).length,
                totalCount: state.totalCount ?? devices.length,
                recentOtpCount: otpFeed.length,
                devices,
              });
            }
            const catalog = getMobileSimFleetCatalog?.() || [];
            if (catalog.length > 0) {
              return sendJson(200, { ok: true, onlineCount: 0, totalCount: catalog.length, recentOtpCount: 0, devices: catalog });
            }
          } catch {
            /* fallback to HTTP */
          }
          try {
            const upstream = await fetch("http://127.0.0.1:6016/api/mobile-sim/fleet", {
              signal: AbortSignal.timeout(3500),
            });
            if (upstream.ok) return sendJson(200, await upstream.json());
          } catch {
            /* ignore */
          }
          return sendJson(503, { ok: false, error: "mobile_sim_unavailable" });
        }

        if (req.method === "GET" && urlPath === "/api/mobile-farm/ios-screenshot") {
          const host = String(query.get("host") || "").trim();
          if (!/^192\.168\.0\.\d{1,3}$/.test(host)) {
            return sendJson(400, { ok: false, error: "invalid_ios_host" });
          }
          try {
            const iosBridge = require(path.join(toolRoot, "electron", "lib", "ios-stealth-bridge.cjs"));
            const mcpRes = await iosBridge.callIosMcpTool(
              `http://${host}:8090/mcp`,
              "screenshot",
              {},
              { timeoutMs: 3500 },
            );
            const imgItem = mcpRes?.content?.find?.((c) => c?.type === "image" && c?.data);
            if (imgItem?.data) {
              const mime = String(imgItem.mimeType || "image/jpeg").trim();
              return sendJson(200, {
                ok: true,
                host,
                screenDataUrl: `data:${mime};base64,${imgItem.data}`,
              });
            }
            return sendJson(200, { ok: false, host, error: "empty_mcp_screenshot" });
          } catch (err) {
            return sendJson(200, { ok: false, host, error: err instanceof Error ? err.message : String(err) });
          }
        }

        return next();
      });
    },
  };
}
