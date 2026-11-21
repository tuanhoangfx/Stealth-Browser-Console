"use strict";
/**
 * P0003 24/7 Multi-Device SIM & SMS/Call-Log OTP Reader Routes (`/api/mobile-sim/*`).
 *
 * Bridges all SIM slots (Galaxy S9+ `0973648075`, Pixel 7 `0961739602`, Pixel 6a `0775295550`,
 * iPhone 6s MobiFone `ICCID 8984012601509001937`) via `android-adb-sim-bridge.mjs` and reads/updates
 * the shared 24/7 cache (`mobile-sim-otp-24x7.json`) + `public.twofa_accounts`.
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function defaultLoadSimBridgeModule() {
  const candidates = [
    path.resolve(__dirname, "../../../scripts/lib/android-adb-sim-bridge.mjs"),
    "E:/Dev/Tool/scripts/lib/android-adb-sim-bridge.mjs",
  ];
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) return null;
  return import(pathToFileURL(filePath).href);
}

function normalizePhoneFilter(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("84") && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

function buildMobileSimRoutes(deps) {
  const { send, simBridgeLoader } = deps;
  const loadSimBridge = typeof simBridgeLoader === "function" ? simBridgeLoader : defaultLoadSimBridgeModule;

  return [
    {
      id: "mobileSim.fleet",
      method: "GET",
      pattern: /^\/api\/mobile-sim\/fleet$/,
      async handler(ctx) {
        try {
          const mod = await loadSimBridge();
          if (!mod || typeof mod.getMobileSimFleetCatalog !== "function") {
            return send.json(ctx.res, 503, { ok: false, error: "Mobile SIM bridge module unavailable" });
          }
          const forceLive = ctx.query?.get?.("live") === "1";
          let state = !forceLive && typeof mod.readCachedMobileSimFleetState === "function"
            ? mod.readCachedMobileSimFleetState()
            : null;
          if (!state && typeof mod.sweepAllMobileSims24x7 === "function") {
            state = await mod.sweepAllMobileSims24x7({ syncToDb: ctx.query?.get?.("syncToDb") !== "0" });
          }
          const devices = Array.isArray(state?.devices) ? state.devices : mod.getMobileSimFleetCatalog();
          const otpFeed = Array.isArray(state?.otpFeed) ? state.otpFeed : [];
          return send.json(ctx.res, 200, {
            ok: true,
            updatedAt: state?.updatedAt || null,
            onlineCount: state?.onlineCount ?? devices.filter((d) => d.online).length,
            totalCount: state?.totalCount ?? devices.length,
            recentOtpCount: otpFeed.length,
            devices: devices.map((d) => ({
              deviceId: d.deviceId,
              label: d.label,
              carrier: d.carrier,
              simType: d.simType,
              platform: d.platform,
              phone: d.phone || "",
              iccid: d.iccid || "",
              serial: d.serial,
              browser: d.browser || "",
              role: d.role || "",
              online: Boolean(d.online),
              latestOtp: d.latestOtp || null,
              source: d.source || null,
              latencyMs: d.latencyMs ?? null,
              lastSweepAt: d.lastSweepAt || null,
              lastOnlineAt: d.lastOnlineAt || null,
              error: d.online === false ? d.reason || "offline" : null,
            })),
          });
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "mobileSim.inbox",
      method: "GET",
      pattern: /^\/api\/mobile-sim\/inbox$/,
      async handler(ctx) {
        try {
          const mod = await loadSimBridge();
          if (!mod) {
            return send.json(ctx.res, 503, { ok: false, error: "Mobile SIM bridge module unavailable" });
          }
          const q = ctx.query;
          const deviceId = String(q?.get?.("deviceId") || "").trim();
          const phone = normalizePhoneFilter(q?.get?.("phone") || "");
          const iccid = String(q?.get?.("iccid") || "").trim();
          const service = String(q?.get?.("service") || "").trim().toLowerCase();
          const sinceMs = Number(q?.get?.("sinceMs") || 0) || 0;
          const limit = Math.max(1, Math.min(200, Number(q?.get?.("limit") || 30) || 30));
          const live = q?.get?.("live") === "1";
          const includeRaw = q?.get?.("includeRaw") === "1";

          let state = !live ? mod.readCachedMobileSimFleetState?.() : null;
          if (!state) {
            state = await mod.sweepAllMobileSims24x7({
              deviceId,
              phone,
              service,
              syncToDb: q?.get?.("syncToDb") !== "0",
            });
          }

          const feed = Array.isArray(state?.otpFeed) ? state.otpFeed : [];
          const matches = feed.filter((ev) => {
            if (!ev) return false;
            if (deviceId && ev.deviceId !== deviceId) return false;
            if (phone && normalizePhoneFilter(ev.phone) !== phone) return false;
            if (iccid && String(ev.iccid || "") !== iccid) return false;
            if (sinceMs > 0 && Number(ev.dateMs || 0) < sinceMs) return false;
            if (service) {
              const hay = `${ev.service || ""} ${ev.from || ""} ${ev.subject || ""}`.toLowerCase();
              if (!hay.includes(service)) return false;
            }
            return true;
          });

          const payload = {
            ok: true,
            updatedAt: state?.updatedAt || null,
            totalMatched: matches.length,
            latestOtp: matches[0]?.otp || null,
            latestMatch: matches[0] || null,
            messages: matches.slice(0, limit),
          };
          if (includeRaw) {
            const devs = Array.isArray(state?.devices) ? state.devices : [];
            payload.rawInboxByDevice = devs
              .filter((d) => (!deviceId || d.deviceId === deviceId) && (!phone || normalizePhoneFilter(d.phone) === phone))
              .map((d) => ({
                deviceId: d.deviceId,
                phone: d.phone || "",
                online: Boolean(d.online),
                recentRawMessages: (d.recentRawMessages || []).slice(0, limit),
              }));
          }
          return send.json(ctx.res, 200, payload);
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "mobileSim.sweep",
      method: "POST",
      pattern: /^\/api\/mobile-sim\/sweep$/,
      async handler(ctx) {
        try {
          const mod = await loadSimBridge();
          if (!mod || typeof mod.sweepAllMobileSims24x7 !== "function") {
            return send.json(ctx.res, 503, { ok: false, error: "Mobile SIM sweep helper unavailable" });
          }
          const body = ctx.body || {};
          const res = await mod.sweepAllMobileSims24x7({
            deviceId: String(body.deviceId || "").trim(),
            phone: String(body.phone || "").trim(),
            service: String(body.service || "").trim(),
            maxMessagesPerDevice: Number(body.maxMessagesPerDevice || 20) || 20,
            maxAgeSec: Number(body.maxAgeSec || 86400) || 86400,
            minTimestampMs: Number(body.minTimestampMs || 0) || 0,
            includeCallOtp: body.includeCallOtp !== false,
            syncToDb: body.syncToDb !== false,
          });
          return send.json(ctx.res, 200, res);
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: "mobileSim.waitOtp",
      method: "POST",
      pattern: /^\/api\/mobile-sim\/wait-otp$/,
      async handler(ctx) {
        try {
          const mod = await loadSimBridge();
          if (!mod || typeof mod.waitForMobileSimOtp24x7 !== "function") {
            return send.json(ctx.res, 503, { ok: false, error: "Mobile SIM wait-otp helper unavailable" });
          }
          const body = ctx.body || {};
          const res = await mod.waitForMobileSimOtp24x7({
            deviceId: String(body.deviceId || "").trim(),
            phone: String(body.phone || "").trim(),
            iccid: String(body.iccid || "").trim(),
            service: String(body.service || "").trim(),
            sinceMs: body.sinceMs != null ? Number(body.sinceMs) : Date.now() - 20_000,
            timeoutMs: body.timeoutMs != null ? Number(body.timeoutMs) : 45_000,
            pollIntervalMs: body.pollIntervalMs != null ? Number(body.pollIntervalMs) : 2_500,
            includeCallOtp: body.includeCallOtp !== false,
            syncToDb: body.syncToDb !== false,
          });
          return send.json(ctx.res, res?.ok ? 200 : 408, res);
        } catch (err) {
          return send.json(ctx.res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
  ];
}

module.exports = {
  buildMobileSimRoutes,
};
