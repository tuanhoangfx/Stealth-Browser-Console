"use strict";
/**
 * Proxy pool + health-check + geoip-consistency.
 *
 * Rủi ro antidetect lớn nhất ở scale: nhiều profile chung 1 IP, hoặc IP/timezone
 * lệch nhau → bị link & ban. Module này:
 *   - parseProxy: chuẩn hoá nhiều định dạng proxy (kể cả format GPM host:port:user:pass).
 *   - checkProxy: kiểm proxy sống + lấy exit IP/country/timezone (qua HTTP proxy).
 *   - geoConsistency: so timezone/locale của profile với geo thật của exit IP.
 *   - ProxyPool: cấp phát round-robin + cooldown proxy lỗi (1 IP / nhúm profile).
 *
 * checkProxy phụ thuộc mạng → tách khỏi core thuần (parse/geo/pool) để test offline.
 */
const net = require("node:net");

// ── Pure core (test được offline) ─────────────────────────────────────────

/**
 * Chuẩn hoá proxy string → { protocol, host, port, username, password } | null.
 * Hỗ trợ:
 *   scheme://user:pass@host:port | scheme://host:port
 *   user:pass@host:port
 *   host:port:user:pass   (định dạng GPM/antidetect phổ biến)
 *   host:port
 */
function parseProxy(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  let protocol = "http";
  let rest = raw;
  const schemeMatch = rest.match(/^(https?|socks[45]?):\/\//i);
  if (schemeMatch) {
    protocol = schemeMatch[1].toLowerCase();
    rest = rest.slice(schemeMatch[0].length);
  }

  let username = "";
  let password = "";

  if (rest.includes("@")) {
    const [creds, hostPart] = rest.split("@");
    [username = "", password = ""] = creds.split(":");
    rest = hostPart;
  }

  const parts = rest.split(":");
  let host, port;
  if (parts.length === 2) {
    [host, port] = parts;
  } else if (parts.length === 4 && !username) {
    // host:port:user:pass
    [host, port, username, password] = parts;
  } else if (parts.length >= 2) {
    host = parts[0];
    port = parts[1];
  } else {
    return null;
  }

  host = String(host || "").trim();
  port = Number(port);
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null;

  return { protocol, host, port, username: username || "", password: password || "" };
}

/** "en-US" / "vi-VN" → "US" / "VN". */
function localeToCountry(locale) {
  const m = String(locale || "").match(/[-_]([A-Za-z]{2})\b/);
  return m ? m[1].toUpperCase() : "";
}

/**
 * So profile (timezone, locale) với geo thật của exit IP.
 * geo = { countryCode, timezone }. Field trống ở profile → bỏ qua check đó (geoip:auto lo).
 */
function geoConsistency(profile = {}, geo = {}) {
  const warnings = [];
  const wantTz = String(profile.timezone || "").trim();
  const gotTz = String(geo.timezone || "").trim();
  if (wantTz && gotTz && wantTz !== gotTz) {
    warnings.push(`timezone lệch: profile="${wantTz}" vs IP="${gotTz}"`);
  }
  const wantCc = localeToCountry(profile.locale);
  const gotCc = String(geo.countryCode || "").trim().toUpperCase();
  if (wantCc && gotCc && wantCc !== gotCc) {
    warnings.push(`country lệch: locale="${wantCc}" vs IP="${gotCc}"`);
  }
  return { consistent: warnings.length === 0, warnings, exitGeo: { countryCode: gotCc, timezone: gotTz } };
}

/**
 * Pool cấp phát proxy round-robin với cooldown cho proxy lỗi.
 * Mục tiêu: tránh dồn nhiều profile vào 1 IP và tự né proxy chết.
 */
class ProxyPool {
  #list = [];
  #cursor = 0;
  /** proxyStr → timestamp hết cooldown */
  #cooldown = new Map();
  /** profileId → proxyStr đang giữ */
  #assigned = new Map();

  constructor(proxies = []) {
    this.setProxies(proxies);
  }

  setProxies(proxies) {
    this.#list = [...new Set((proxies || []).map((p) => String(p).trim()).filter(Boolean))];
    this.#cursor = 0;
  }

  #isCoolingDown(proxy, now) {
    const until = this.#cooldown.get(proxy);
    return Boolean(until && until > now);
  }

  /** Cấp 1 proxy khả dụng (bỏ qua proxy đang cooldown). now truyền vào để test ổn định. */
  assign(profileId, now = Date.now()) {
    if (this.#assigned.has(profileId)) return this.#assigned.get(profileId);
    if (!this.#list.length) return null;
    for (let i = 0; i < this.#list.length; i += 1) {
      const proxy = this.#list[this.#cursor % this.#list.length];
      this.#cursor += 1;
      if (!this.#isCoolingDown(proxy, now)) {
        this.#assigned.set(profileId, proxy);
        return proxy;
      }
    }
    return null; // tất cả đang cooldown
  }

  release(profileId) {
    this.#assigned.delete(profileId);
  }

  markBad(proxy, cooldownMs = 5 * 60 * 1000, now = Date.now()) {
    this.#cooldown.set(String(proxy), now + cooldownMs);
  }

  available(now = Date.now()) {
    return this.#list.filter((p) => !this.#isCoolingDown(p, now)).length;
  }

  stats(now = Date.now()) {
    return { total: this.#list.length, available: this.available(now), assigned: this.#assigned.size };
  }
}

// ── Network (best-effort, không test offline) ──────────────────────────────

/** Endpoint geo (HTTP, hỗ trợ forward-proxy). Đổi qua STEALTH_GEOIP_URL nếu cần. */
function geoUrl() {
  return String(process.env.STEALTH_GEOIP_URL || "http://ip-api.com/json").trim();
}

/**
 * Kiểm proxy sống + lấy exit IP/geo qua HTTP forward-proxy (GET absolute-URI).
 * Chỉ hỗ trợ proxy http(s); socks → trả alive:null (cần lib socks riêng).
 * @returns {Promise<{ alive: boolean|null, exitIp?: string, countryCode?: string, timezone?: string, latencyMs?: number, reason?: string }>}
 */
function checkProxy(proxyInput, { timeoutMs = 8000 } = {}) {
  const proxy = parseProxy(proxyInput);
  if (!proxy) return Promise.resolve({ alive: false, reason: "proxy không hợp lệ" });
  if (proxy.protocol.startsWith("socks")) {
    return Promise.resolve({ alive: null, reason: "socks-check-unsupported" });
  }

  const target = geoUrl();
  const t = new URL(target);
  const started = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; try { socket.destroy(); } catch {} resolve(v); } };

    const socket = net.connect({ host: proxy.host, port: proxy.port });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => done({ alive: false, reason: "timeout" }));
    socket.on("error", (err) => done({ alive: false, reason: err.message }));

    socket.on("connect", () => {
      const headers = [
        `GET ${target} HTTP/1.1`,
        `Host: ${t.host}`,
        "User-Agent: stealth-browser-console/proxy-check",
        "Accept: application/json",
        "Connection: close"
      ];
      if (proxy.username) {
        const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64");
        headers.push(`Proxy-Authorization: Basic ${auth}`);
      }
      socket.write(headers.join("\r\n") + "\r\n\r\n");
    });

    let buf = "";
    socket.on("data", (chunk) => { buf += chunk.toString("utf8"); });
    socket.on("close", () => {
      if (settled) return;
      const sep = buf.indexOf("\r\n\r\n");
      const statusLine = buf.split("\r\n")[0] || "";
      const body = sep >= 0 ? buf.slice(sep + 4) : "";
      if (!/\b2\d\d\b/.test(statusLine)) {
        return done({ alive: false, reason: statusLine || "no response" });
      }
      try {
        // body có thể là chunked → lấy đoạn JSON đầu tiên.
        const jsonStart = body.indexOf("{");
        const jsonEnd = body.lastIndexOf("}");
        const geo = JSON.parse(body.slice(jsonStart, jsonEnd + 1));
        done({
          alive: true,
          exitIp: geo.query || geo.ip || "",
          countryCode: geo.countryCode || geo.country_code || "",
          timezone: geo.timezone || "",
          latencyMs: Date.now() - started
        });
      } catch {
        done({ alive: false, reason: "không parse được geo response" });
      }
    });
  });
}

module.exports = { parseProxy, localeToCountry, geoConsistency, ProxyPool, checkProxy };
