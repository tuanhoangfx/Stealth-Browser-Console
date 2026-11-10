"use strict";
/**
 * Proxy pool + health-check + geoip-consistency.
 *
 * Rủi ro antidetect lớn nhất ở scale: nhiều profile chung 1 IP, hoặc IP/timezone
 * lệch nhau → bị link & ban. Module này:
 *   - parseProxy: chuẩn hoá nhiều định dạng proxy (kể cả host:port:user:pass phổ biến antidetect).
 *   - checkProxy: kiểm proxy sống + lấy exit IP/country/timezone (qua HTTP proxy).
 *   - geoConsistency: so timezone/locale của profile với geo thật của exit IP.
 *   - ProxyPool: cấp phát round-robin + cooldown proxy lỗi (1 IP / nhúm profile).
 *
 * checkProxy phụ thuộc mạng → tách khỏi core thuần (parse/geo/pool) để test offline.
 */
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// ── Pure core (test được offline) ─────────────────────────────────────────

/**
 * Chuẩn hoá proxy string → { protocol, host, port, username, password } | null.
 * Hỗ trợ:
 *   scheme://user:pass@host:port | scheme://host:port
 *   user:pass@host:port
 *   host:port:user:pass   (định dạng antidetect phổ biến)
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
  } else if (parts.length === 3 && !username) {
    // host:port:user (password empty — common antidetect shorthand)
    [host, port, username] = parts;
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

/** Canonical proxy URL for cloakbrowser / Playwright (http://user:pass@host:port). */
function formatProxyForLaunch(input) {
  const p = parseProxy(input);
  if (!p) return "";
  const auth =
    p.username || p.password
      ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@`
      : "";
  return `${p.protocol}://${auth}${p.host}:${p.port}`;
}

/** Playwright proxy object — avoids Invalid URL on host:port:user:pass shorthand. */
function toPlaywrightProxy(input) {
  const p = parseProxy(input);
  if (!p) return null;
  const out = { server: `${p.protocol}://${p.host}:${p.port}` };
  if (p.username) out.username = p.username;
  if (p.password) out.password = p.password;
  return out;
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
 * Đo độ trễ TCP handshake thực tế tới host:port (hỗ trợ cả HTTP lẫn SOCKS5 / IP-whitelist proxy).
 * @returns {Promise<{ tcpAlive: boolean, tcpLatencyMs: number|null, reason?: string }>}
 */
function probeTcpPort(host, port, { timeoutMs = 2000 } = {}) {
  const cleanHost = String(host || "").trim();
  const cleanPort = Number(port);
  if (!cleanHost || !Number.isInteger(cleanPort) || cleanPort <= 0 || cleanPort > 65535) {
    return Promise.resolve({ tcpAlive: false, tcpLatencyMs: null, reason: "invalid-host-port" });
  }
  const t0 = performance.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      resolve(val);
    };
    const socket = net.connect({ host: cleanHost, port: cleanPort });
    socket.setTimeout(timeoutMs);
    socket.on("connect", () =>
      finish({
        tcpAlive: true,
        tcpLatencyMs: Math.max(1, Math.round(performance.now() - t0)),
      }),
    );
    socket.on("timeout", () => finish({ tcpAlive: false, tcpLatencyMs: null, reason: "timeout" }));
    socket.on("error", (err) =>
      finish({ tcpAlive: false, tcpLatencyMs: null, reason: err?.code || err?.message || "error" }),
    );
  });
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

/**
 * Parse a country proxy shorthand (`vpn://US`, `proxy://VN`, `country:SG`, `surfshark://GB`, `nordvpn://JP`, or `[vpn:US]` in note).
 */
function parseCountryProxySpec(input, note = "", startupUrl = "") {
  const raw = String(input || "").trim();
  const m = raw.match(/^(?:vpn|proxy|country|surfshark|nordvpn):(?:\/\/)?([A-Za-z]{2})\b/i);
  if (m) {
    const providerHint = /^surfshark:/i.test(raw)
      ? "surfshark"
      : /^nordvpn:/i.test(raw)
        ? "nordvpn"
        : /^proxy:/i.test(raw)
          ? "vault"
          : "auto";
    return { countryCode: m[1].toUpperCase(), providerHint };
  }
  if (!raw && note) {
    const nm = String(note).match(/\[(?:vpn|proxy|country):([A-Za-z]{2})\]/i);
    if (nm) return { countryCode: nm[1].toUpperCase(), providerHint: "auto" };
  }
  if (!raw && startupUrl && /claude\.ai/i.test(String(startupUrl))) {
    return { countryCode: "US", providerHint: "auto" };
  }
  return null;
}

let vpnPoolModulePromise = null;
let vpnPoolModuleMtimeMs = 0;
function resolveVpnProxyPoolPath() {
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "scripts", "lib", "vpn-proxy-pool.mjs"),
    process.env.STEALTH_WORKSPACE_ROOT
      ? path.resolve(process.env.STEALTH_WORKSPACE_ROOT, "Tool", "scripts", "lib", "vpn-proxy-pool.mjs")
      : "",
    path.resolve("E:/Dev/Tool/scripts/lib/vpn-proxy-pool.mjs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadVpnProxyPoolModule() {
  const candidate = resolveVpnProxyPoolPath();
  if (!candidate) return Promise.resolve(null);
  let curMtime = 0;
  try {
    curMtime = fs.statSync(candidate).mtimeMs;
  } catch {
    /* ignore */
  }
  if (!vpnPoolModulePromise || (curMtime && curMtime !== vpnPoolModuleMtimeMs)) {
    vpnPoolModuleMtimeMs = curMtime;
    const href = `${pathToFileURL(candidate).href}${curMtime ? `?v=${Math.floor(curMtime)}` : ""}`;
    vpnPoolModulePromise = import(href).catch(() => null);
  }
  return vpnPoolModulePromise;
}

const COUNTRY_GEO_DEFAULTS = {
  US: { timezone: "America/New_York", locale: "en-US" },
  SG: { timezone: "Asia/Singapore", locale: "en-SG" },
  JP: { timezone: "Asia/Tokyo", locale: "ja-JP" },
  GB: { timezone: "Europe/London", locale: "en-GB" },
  DE: { timezone: "Europe/Berlin", locale: "de-DE" },
  KR: { timezone: "Asia/Seoul", locale: "ko-KR" },
  FR: { timezone: "Europe/Paris", locale: "fr-FR" },
  NL: { timezone: "Europe/Amsterdam", locale: "nl-NL" },
  CA: { timezone: "America/Toronto", locale: "en-CA" },
  AU: { timezone: "Australia/Sydney", locale: "en-AU" },
  VN: { timezone: "Asia/Ho_Chi_Minh", locale: "vi-VN" },
};

/**
 * Resolve a profile's country proxy shorthand (`vpn://US`, `[vpn:SG]` in note, or explicit `opts.country`)
 * into a live local HTTP proxy (`http://127.0.0.1:<port>`) from the Multi-Country VPN & Proxy Pool.
 */
async function resolveProfileCountryProxy(profile = {}, opts = {}) {
  const explicitCountry = String(opts.country || "").trim().toUpperCase();
  const spec = explicitCountry
    ? { countryCode: explicitCountry, providerHint: "auto" }
    : parseCountryProxySpec(profile?.proxy, profile?.note, opts.targetUrl || profile?.startupUrl);
  if (!spec) return null;

  const mod = await loadVpnProxyPoolModule();
  if (!mod || typeof mod.acquireCountryProxy !== "function") return null;

  const preferVaultProxy =
    opts.preferVaultProxy !== undefined
      ? Boolean(opts.preferVaultProxy)
      : spec.providerHint !== "surfshark" && spec.providerHint !== "nordvpn";
  const acquired = await mod.acquireCountryProxy([spec.countryCode], { preferVaultProxy });
  if (!acquired?.ok || !acquired.localProxyUrl) return null;
  const cc = String(acquired.countryCode || spec.countryCode).toUpperCase();
  const geoDef = COUNTRY_GEO_DEFAULTS[cc] || {};
  return {
    resolvedProxy: acquired.localProxyUrl,
    countryCode: cc,
    exitIp: acquired.exitIp,
    timezone: acquired.timezone || geoDef.timezone || "",
    locale: geoDef.locale || "",
    latencyMs: acquired.latencyMs,
    source: acquired.source,
  };
}

/**
 * Check a standard proxy or acquire/verify a country VPN tunnel (`vpn://VN`, `proxy://VN`, `country:US`, or `"local"`).
 */
async function checkOrAcquireProfileProxy(proxyInput, options = {}) {
  const trimmed = String(proxyInput || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "local") {
    const started = Date.now();
    try {
      const res = await fetch(geoUrl(), { signal: AbortSignal.timeout(Number(options.timeoutMs) || 6000) });
      if (!res.ok) return { alive: false, reason: `HTTP ${res.status}` };
      const geo = await res.json();
      return {
        alive: true,
        exitIp: geo.query || geo.ip || "",
        countryCode: geo.countryCode || geo.country_code || "",
        timezone: geo.timezone || "",
        latencyMs: Date.now() - started,
        source: "local-direct",
      };
    } catch (err) {
      return { alive: false, reason: err?.message || "Local IP check failed" };
    }
  }
  const spec = parseCountryProxySpec(trimmed, options.note);
  if (spec) {
    const preferVaultProxy =
      options.rotateVpn !== undefined
        ? !options.rotateVpn
        : options.preferVaultProxy !== undefined
          ? Boolean(options.preferVaultProxy)
          : spec.providerHint !== "surfshark" && spec.providerHint !== "nordvpn";
    const resolved = await resolveProfileCountryProxy(
      { proxy: trimmed, note: options.note },
      { preferVaultProxy },
    );
    if (!resolved) {
      return { alive: false, countryCode: spec.countryCode, reason: "VPN tunnel unavailable" };
    }
    return {
      alive: true,
      exitIp: resolved.exitIp,
      countryCode: resolved.countryCode,
      timezone: resolved.timezone,
      latencyMs: resolved.latencyMs,
      source: resolved.source,
      localProxyUrl: resolved.resolvedProxy,
    };
  }
  return checkProxy(trimmed, { timeoutMs: Number(options.timeoutMs) || 8000 });
}

module.exports = {
  parseProxy,
  formatProxyForLaunch,
  toPlaywrightProxy,
  localeToCountry,
  geoConsistency,
  ProxyPool,
  probeTcpPort,
  checkProxy,
  parseCountryProxySpec,
  COUNTRY_GEO_DEFAULTS,
  resolveVpnProxyPoolPath,
  loadVpnProxyPoolModule,
  resolveProfileCountryProxy,
  checkOrAcquireProfileProxy,
};
