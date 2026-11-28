"use strict";
/**
 * P0003 iOS Stealth Bridge (`ios-mcp :8090` Wi-Fi + `OpenSSH :22/:2222` + `usbmux` + `WDA :8100` fallback + `Crane` + `Shadowrocket`)
 * Augments P0003 Mobile Farm (`/api/mobile-stealth/*` and `/api/android-vault/*`) with live
 * USB & Wi-Fi iPhone discovery, Dual-Wall screen mirroring, HID touch/key/app dispatch,
 * pure-JS Apple `Cookies.binarycookies` sync, Safari container snapshots, and Shadowrocket proxy routing.
 */
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile, spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { promisify } = require("node:util");

const rawExecFileAsync = promisify(execFile);
const execFileAsync = (file, args = [], options = {}) =>
  rawExecFileAsync(file, args, { windowsHide: true, ...options });

const IOS_SERIAL_PREFIX = "ios:";
const DEFAULT_WDA_URL = process.env.IOS_WDA_URL || "http://127.0.0.1:8100";
const DEFAULT_SSH_PORT = Number(process.env.IOS_SSH_PORT || 2222);
const DEFAULT_MJPEG_PORT = Number(process.env.IOS_MJPEG_PORT || 9100);
const DEFAULT_IOS_MCP_PORT = Number(process.env.IOS_MCP_PORT || 8090);
const DEFAULT_IOS_WIFI_HOST = String(process.env.IOS_WIFI_HOST || "192.168.0.222").trim();
const DEFAULT_IOS_WIFI_MACS = Object.freeze(["dee91908478d", "8489ad9103b2", "50a67f6b7d57", "7a503ce1983a"]);
const COCOA_EPOCH_OFFSET_SEC = 978307200; // Seconds between 1970-01-01 and Apple NSDate 2001-01-01

// Standard Apple NSHTTPCookieAcceptPolicy=2 binary plist trailer written by NSHTTPCookieStorage
const BINARY_COOKIES_BPLIST_TRAILER = Buffer.from(
  "071720050000004b62706c6973743030d101025f10184e5348545450436f6f6b6965416363657074506f6c6963791002080b260000000000000101000000000000000300000000000000000000000000000028",
  "hex",
);

const PRODUCT_TYPE_MAP = Object.freeze({
  "iPhone8,1": { model: "iPhone 6s", width: 375, height: 667, scale: 2 },
  "iPhone8,2": { model: "iPhone 6s Plus", width: 414, height: 736, scale: 3 },
  "iPhone9,1": { model: "iPhone 7", width: 375, height: 667, scale: 2 },
  "iPhone9,2": { model: "iPhone 7 Plus", width: 414, height: 736, scale: 3 },
  "iPhone9,3": { model: "iPhone 7", width: 375, height: 667, scale: 2 },
  "iPhone9,4": { model: "iPhone 7 Plus", width: 414, height: 736, scale: 3 },
  "iPhone10,1": { model: "iPhone 8", width: 375, height: 667, scale: 2 },
  "iPhone10,2": { model: "iPhone 8 Plus", width: 414, height: 736, scale: 3 },
  "iPhone10,3": { model: "iPhone X", width: 375, height: 812, scale: 3 },
  "iPhone10,4": { model: "iPhone 8", width: 375, height: 667, scale: 2 },
  "iPhone10,5": { model: "iPhone 8 Plus", width: 414, height: 736, scale: 3 },
  "iPhone10,6": { model: "iPhone X", width: 375, height: 812, scale: 3 },
  "iPhone11,2": { model: "iPhone XS", width: 375, height: 812, scale: 3 },
  "iPhone11,4": { model: "iPhone XS Max", width: 414, height: 896, scale: 3 },
  "iPhone11,6": { model: "iPhone XS Max", width: 414, height: 896, scale: 3 },
  "iPhone11,8": { model: "iPhone XR", width: 414, height: 896, scale: 2 },
  "iPhone12,1": { model: "iPhone 11", width: 414, height: 896, scale: 2 },
  "iPhone12,3": { model: "iPhone 11 Pro", width: 375, height: 812, scale: 3 },
  "iPhone12,5": { model: "iPhone 11 Pro Max", width: 414, height: 896, scale: 3 },
  "iPhone13,2": { model: "iPhone 12", width: 390, height: 844, scale: 3 },
  "iPhone13,3": { model: "iPhone 12 Pro", width: 390, height: 844, scale: 3 },
  "iPhone14,5": { model: "iPhone 13", width: 390, height: 844, scale: 3 },
  "iPhone14,2": { model: "iPhone 13 Pro", width: 390, height: 844, scale: 3 },
});

const ANDROID_TO_IOS_APP_ALIASES = Object.freeze({
  "com.facebook.katana": { bundleIds: ["com.facebook.Facebook"], fallbackUrl: "https://m.facebook.com" },
  "com.facebook.lite": { bundleIds: ["com.facebook.Facebook"], fallbackUrl: "https://m.facebook.com" },
  "com.facebook.orca": { bundleIds: ["com.facebook.Messenger"], fallbackUrl: "https://www.messenger.com" },
  "com.android.chrome": { bundleIds: ["com.apple.mobilesafari"], fallbackUrl: "" },
  "org.telegram.messenger": { bundleIds: ["ph.telegra.Telegraph", "org.telegram.Telegram"], fallbackUrl: "" },
  "com.liguangming.Shadowrocket": { bundleIds: ["com.liguangming.Shadowrocket"], fallbackUrl: "" },
});

const _iosCache = {
  devicesAt: 0,
  devices: [],
  batteryByUdid: new Map(),
  screenByUdid: new Map(),
  healthByUdid: new Map(),
  frontAppByUdid: new Map(),
  bgStateBySerial: new Map(),
  bgPoller: {
    timer: null,
    lastDemandAt: 0,
    devices: [],
  },
  containerByUdid: new Map(),
  craneMapAt: 0,
  craneMap: null,
  activeSerial: "",
  wdaSessionId: "",
  tunnelProcs: new Map(),
};

function isIosSerial(serial) {
  return typeof serial === "string" && serial.trim().toLowerCase().startsWith(IOS_SERIAL_PREFIX);
}

function stripIosSerialPrefix(serial) {
  return String(serial || "").trim().replace(/^ios:/i, "");
}

function makeIosSerial(udid) {
  return `${IOS_SERIAL_PREFIX}${String(udid || "").trim()}`;
}

function resolveIosDeviceSpec(productType) {
  const key = String(productType || "").trim();
  return PRODUCT_TYPE_MAP[key] || { model: key || "iPhone", width: 390, height: 844, scale: 3 };
}

function resolveMobileVaultRoot() {
  const sharedPath = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\mobile-vault";
  if (fs.existsSync("E:\\Dev\\Tool\\P0002-Social-Hub")) return sharedPath;
  return path.resolve(__dirname, "..", "..", "data", "mobile-vault");
}

function resolveP0003DataDir() {
  return path.resolve(__dirname, "..", "..", "data");
}

function getActiveIosDeviceSerial() {
  return _iosCache.activeSerial || "";
}

function setActiveIosDeviceSerial(serial) {
  const clean = String(serial || "").trim();
  _iosCache.activeSerial = isIosSerial(clean) ? clean : "";
  return _iosCache.activeSerial;
}

function readActiveIosProfileCode(vaultRoot = resolveMobileVaultRoot()) {
  try {
    const file = path.join(vaultRoot, "ios", "active-profile.json");
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed?.profileCode) return String(parsed.profileCode).padStart(4, "0");
    }
  } catch {
    /* ignore */
  }
  return "0001";
}

function normalizeMacAddress(mac) {
  return String(mac || "").toLowerCase().replace(/[^0-9a-f]/g, "");
}

function collectKnownIosMacs(vaultRoot = resolveMobileVaultRoot()) {
  const macs = new Set(DEFAULT_IOS_WIFI_MACS);
  const envMacs = String(process.env.IOS_WIFI_MACS || "").split(",").map(normalizeMacAddress).filter((m) => m.length === 12);
  for (const m of envMacs) macs.add(m);
  const registryFiles = [
    path.join(resolveP0003DataDir(), "ios-wifi-devices.json"),
    path.join(vaultRoot, "ios", "wifi-devices.json"),
  ];
  for (const file of registryFiles) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.devices) ? parsed.devices : [];
      for (const item of list) {
        const m = normalizeMacAddress(item?.mac || item?.wifiMac);
        if (m.length === 12) macs.add(m);
      }
    } catch {
      /* ignore corrupt registry */
    }
  }
  return Array.from(macs);
}

function parseArpTableWifiHosts(arpStdout, knownMacs = DEFAULT_IOS_WIFI_MACS, port = DEFAULT_IOS_MCP_PORT) {
  const wanted = new Set((Array.isArray(knownMacs) ? knownMacs : []).map(normalizeMacAddress).filter((m) => m.length === 12));
  if (wanted.size === 0) return [];
  const found = [];
  const seenHosts = new Set();
  for (const line of String(arpStdout || "").split(/\r?\n/)) {
    const ipMatch = line.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
    const macMatch = line.match(/\b([0-9a-f]{1,2}(?:[:-][0-9a-f]{1,2}){5})\b/i);
    if (!ipMatch || !macMatch) continue;
    const normMac = macMatch[1]
      .split(/[:-]/)
      .map((part) => part.padStart(2, "0").toLowerCase())
      .join("");
    if (!wanted.has(normMac)) continue;
    const host = ipMatch[1];
    if (seenHosts.has(host)) continue;
    seenHosts.add(host);
    found.push({ host, port: Number(port || DEFAULT_IOS_MCP_PORT), mac: normMac, discoveredVia: "arp" });
  }
  return found;
}

async function discoverWifiHostsFromArp({ execFileFn = execFileAsync, vaultRoot = resolveMobileVaultRoot(), knownMacs } = {}) {
  try {
    const { stdout } = await execFileFn("arp", ["-a"], { timeout: 1800 });
    return parseArpTableWifiHosts(stdout, knownMacs || collectKnownIosMacs(vaultRoot), DEFAULT_IOS_MCP_PORT);
  } catch {
    return [];
  }
}

function resolvePymobiledevice3BinaryPath() {
  const envBin = String(process.env.PYMOBILEDEVICE3_BIN || "").trim();
  if (envBin && fs.existsSync(envBin)) return envBin;
  const bases = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "Python") : "",
    "C:\\Users\\CzP\\AppData\\Local\\Programs\\Python",
  ].filter(Boolean);
  for (const base of bases) {
    try {
      if (!fs.existsSync(base)) continue;
      for (const dir of fs.readdirSync(base).sort().reverse()) {
        const candidate = path.join(base, dir, "Scripts", "pymobiledevice3.exe");
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {
      /* ignore */
    }
  }
  return "pymobiledevice3";
}

function readConfiguredWifiHosts(vaultRoot = resolveMobileVaultRoot(), arpEntries = []) {
  const hosts = new Map();
  const addHost = (host, meta = {}) => {
    const clean = String(host || "").trim();
    if (!clean) return;
    hosts.set(clean, { host: clean, port: Number(meta.port || DEFAULT_IOS_MCP_PORT), udid: String(meta.udid || ""), ...(hosts.get(clean) || {}), ...meta });
  };
  for (const item of Array.isArray(arpEntries) ? arpEntries : []) {
    if (item?.host) addHost(item.host, item);
  }
  const envList = String(process.env.IOS_WIFI_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const h of envList) addHost(h);

  const registryFiles = [
    path.join(resolveP0003DataDir(), "ios-wifi-devices.json"),
    path.join(vaultRoot, "ios", "wifi-devices.json"),
  ];
  for (const file of registryFiles) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.devices) ? parsed.devices : [];
      for (const item of list) {
        if (typeof item === "string") addHost(item);
        else if (item?.host) addHost(item.host, item);
      }
    } catch {
      /* ignore corrupt registry */
    }
  }
  if (DEFAULT_IOS_WIFI_HOST) {
    addHost(DEFAULT_IOS_WIFI_HOST, { udid: "d2d95212a2dee88a25c1b58877f6f9ade5472802" });
  }
  addHost("192.168.0.183", { udid: "553e7c44ca0d03eb12986fdef4229eb43ac12026" });
  return Array.from(hosts.values());
}

function persistWifiDeviceRecord(record) {
  if (!record?.host) return;
  try {
    const dataDir = resolveP0003DataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, "ios-wifi-devices.json");
    let current = [];
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      current = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.devices) ? parsed.devices : [];
    }
    const filtered = current.filter((d) => d && d.host !== record.host && (!record.udid || d.udid !== record.udid));
    filtered.push({ ...record, updatedAt: new Date().toISOString() });
    fs.writeFileSync(file, JSON.stringify({ devices: filtered }, null, 2), "utf8");
  } catch {
    /* best effort */
  }
}

function checkTcpPortOpen(port, host = "127.0.0.1", timeoutMs) {
  const effectiveTimeout = timeoutMs ?? (host === "127.0.0.1" || host === "localhost" ? 450 : 1500);
  return new Promise((resolve) => {
    let settled = false;
    const sock = net.connect({ host, port: Number(port) });
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    sock.setTimeout(effectiveTimeout);
    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
  });
}

async function callIosMcpTool(mcpUrl, name, args = {}, { fetchFn = fetch, timeoutMs = 3500 } = {}) {
  const url = String(mcpUrl || "").trim();
  if (!url) return null;
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args || {} },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res?.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json || json.error) return null;
    return json.result || null;
  } catch {
    return null;
  }
}

function parseMcpTextJson(result) {
  const text = result?.content?.find?.((c) => c?.type === "text")?.text;
  if (!text || typeof text !== "string") return result?.structuredContent || null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function probeWifiIosMcpHost(entry, { fetchFn = fetch, timeoutMs = 1200 } = {}) {
  const host = typeof entry === "string" ? entry : entry?.host;
  const port = typeof entry === "object" && entry?.port ? Number(entry.port) : DEFAULT_IOS_MCP_PORT;
  if (!host) return null;
  const mcpUrl = `http://${host}:${port}/mcp`;
  const devResult = await callIosMcpTool(mcpUrl, "get_device_info", {}, { fetchFn, timeoutMs });
  if (!devResult) return null;
  const info = parseMcpTextJson(devResult) || {};
  const productType = String(info.machine || "iPhone8,2").trim();
  const spec = resolveIosDeviceSpec(productType);
  const iosVersion = String(info.systemVersion || "").trim();
  const udid = String(info.udid || entry?.udid || host.replace(/[^a-zA-Z0-9._-]/g, "_")).trim();
  const serial = makeIosSerial(udid);
  persistWifiDeviceRecord({
    host,
    port,
    udid,
    productType,
    iosVersion,
    model: spec.model,
  });
  return {
    serial,
    udid,
    model: iosVersion ? `${spec.model} (${iosVersion})` : spec.model,
    marketingModel: spec.model,
    product: productType,
    device: "wifi",
    iosVersion,
    buildVersion: "",
    width: Number(info.screenWidth) || spec.width,
    height: Number(info.screenHeight) || spec.height,
    scale: Number(info.screenScale) || spec.scale,
    platform: "ios",
    isWireless: true,
    wifiHost: host,
    mcpUrl,
    sshHost: host,
    sshPort: 22,
    sshUser: "mobile",
    iosMcpOnline: true,
    batteryLevel: Number.isFinite(Number(info.batteryLevel)) ? Number(info.batteryLevel) : null,
    memoryFreeMb: Number.isFinite(Number(info.memoryFreeMB)) ? Math.round(Number(info.memoryFreeMB)) : null,
    active: _iosCache.activeSerial === serial,
  };
}

async function listConnectedIosDevices(opts = {}) {
  const {
    execFileFn = execFileAsync,
    fetchFn = fetch,
    vaultRoot = resolveMobileVaultRoot(),
    wifiHosts,
    cacheMs = 12_000,
    swrMs = 45_000,
    _forceSync = false,
  } = opts;
  const isProdScan = execFileFn === execFileAsync && fetchFn === fetch && !Array.isArray(wifiHosts);
  const now = Date.now();
  const ageMs = now - _iosCache.devicesAt;
  if (!_forceSync && cacheMs > 0 && ageMs < cacheMs && _iosCache.devicesAt > 0) {
    return _iosCache.devices;
  }
  if (!_forceSync && isProdScan && swrMs > 0 && ageMs < swrMs && _iosCache.devicesAt > 0) {
    if (!_iosCache.devicesInFlight) {
      _iosCache.devicesInFlight = listConnectedIosDevices({ ...opts, _forceSync: true })
        .catch(() => _iosCache.devices)
        .finally(() => {
          _iosCache.devicesInFlight = null;
        });
    }
    return _iosCache.devices;
  }
  if (!_forceSync && isProdScan && _iosCache.devicesInFlight) {
    return _iosCache.devicesInFlight;
  }

  let usbDevices = [];
  const pymobileBin = execFileFn === execFileAsync ? resolvePymobiledevice3BinaryPath() : "pymobiledevice3";
  try {
    const { stdout } = await execFileFn(pymobileBin, ["usbmux", "list"], { timeout: 3500 });
    const raw = JSON.parse(String(stdout || "[]"));
    const arr = Array.isArray(raw) ? raw : [];
    usbDevices = arr
      .filter((d) => d && (d.UniqueDeviceID || d.Identifier))
      .map((d) => {
        const udid = String(d.UniqueDeviceID || d.Identifier).trim();
        const productType = String(d.ProductType || "iPhone").trim();
        const spec = resolveIosDeviceSpec(productType);
        const iosVersion = String(d.ProductVersion || "").trim();
        const buildVersion = String(d.BuildVersion || "").trim();
        const serial = makeIosSerial(udid);
        return {
          serial,
          udid,
          model: iosVersion ? `${spec.model} (${iosVersion})` : spec.model,
          marketingModel: spec.model,
          product: productType,
          device: String(d.ConnectionType || "USB").toLowerCase(),
          iosVersion,
          buildVersion,
          width: spec.width,
          height: spec.height,
          scale: spec.scale,
          platform: "ios",
          isWireless: String(d.ConnectionType || "").toLowerCase() !== "usb",
          active: _iosCache.activeSerial === serial,
        };
      });
  } catch {
    usbDevices = [];
  }

  // Only probe ARP + configured Wi-Fi hosts by default in live execution (not when unit tests pass mocked execFileFn without wifiHosts)
  const arpEntries = !Array.isArray(wifiHosts) && execFileFn === execFileAsync
    ? await discoverWifiHostsFromArp({ execFileFn, vaultRoot })
    : [];
  const hostsToProbe = Array.isArray(wifiHosts)
    ? wifiHosts
    : execFileFn === execFileAsync
      ? readConfiguredWifiHosts(vaultRoot, arpEntries)
      : [];
  const wifiResults = await Promise.all(
    hostsToProbe.map((entry) => probeWifiIosMcpHost(entry, { fetchFn }).catch(() => null)),
  );
  const wifiDevices = wifiResults.filter(Boolean);

  const bySerial = new Map();
  for (const dev of usbDevices) {
    const knownHost = hostsToProbe.find((h) => h && typeof h === "object" && h.udid && h.udid === dev.udid);
    bySerial.set(dev.serial, knownHost?.host ? { ...dev, wifiHost: knownHost.host } : dev);
  }
  for (const w of wifiDevices) {
    const existing = bySerial.get(w.serial);
    if (existing) {
      bySerial.set(w.serial, {
        ...existing,
        wifiHost: w.wifiHost,
        mcpUrl: w.mcpUrl,
        sshHost: w.sshHost,
        sshPort: w.sshPort,
        sshUser: w.sshUser,
        iosMcpOnline: true,
        batteryLevel: w.batteryLevel ?? existing.batteryLevel,
        memoryFreeMb: w.memoryFreeMb ?? existing.memoryFreeMb,
      });
    } else {
      bySerial.set(w.serial, w);
    }
  }

  const devices = Array.from(bySerial.values()).map((d) => ({
    ...d,
    active: _iosCache.activeSerial === d.serial,
  }));

  _iosCache.devices = devices;
  _iosCache.devicesAt = now;
  if (_iosCache.activeSerial && !devices.some((d) => d.serial === _iosCache.activeSerial)) {
    _iosCache.activeSerial = "";
  }
  return devices;
}

function resolveTargetIosDevice(serialHint = "", explicitDevice = null) {
  if (explicitDevice && typeof explicitDevice === "object") return explicitDevice;
  const target = String(serialHint || _iosCache.activeSerial || "").trim();
  const targetUdid = stripIosSerialPrefix(target);
  if (target) {
    const found = _iosCache.devices.find((d) => d.serial === target || d.udid === targetUdid);
    if (found) return found;
  }
  return _iosCache.devices[0] || null;
}

function resolveTransportConfig(opts = {}) {
  const dev = resolveTargetIosDevice(opts.serial, opts.deviceInfo);
  const wifiHost = opts.wifiHost || opts.sshHost || dev?.wifiHost || (opts.useDefaultWifi ? DEFAULT_IOS_WIFI_HOST : "");
  const mcpUrl = opts.mcpUrl || dev?.mcpUrl || (wifiHost ? `http://${wifiHost}:${DEFAULT_IOS_MCP_PORT}/mcp` : "");
  const sshHost = opts.sshHost || dev?.sshHost || wifiHost || "127.0.0.1";
  const sshPort = Number(opts.sshPort || dev?.sshPort || (wifiHost && sshHost === wifiHost ? 22 : DEFAULT_SSH_PORT));
  const sshUser = opts.sshUser || dev?.sshUser || (sshHost !== "127.0.0.1" && sshPort === 22 ? "mobile" : "root");
  const wdaUrl = opts.wdaUrl || DEFAULT_WDA_URL;
  return { dev, mcpUrl, wdaUrl, sshHost, sshPort, sshUser };
}

async function probeIosEndpointHealth({
  serial = "",
  deviceInfo = null,
  mcpUrl,
  wdaUrl = DEFAULT_WDA_URL,
  sshHost,
  sshPort,
  fetchFn = fetch,
  portProbeFn = checkTcpPortOpen,
} = {}) {
  const tx = resolveTransportConfig({ serial, deviceInfo, mcpUrl, wdaUrl, sshHost, sshPort });
  let iosMcpOnline = false;
  let wdaOnline = false;
  let wdaSessionId = "";
  let iosVersion = tx.dev?.iosVersion || "";

  if (tx.mcpUrl) {
    const devRes = await callIosMcpTool(tx.mcpUrl, "get_device_info", {}, { fetchFn, timeoutMs: 900 });
    if (devRes) {
      iosMcpOnline = true;
      const parsed = parseMcpTextJson(devRes);
      if (parsed?.systemVersion) iosVersion = String(parsed.systemVersion);
    }
  }

  try {
    const res = await fetchFn(`${tx.wdaUrl.replace(/\/$/, "")}/status`, {
      signal: AbortSignal.timeout(800),
    });
    if (res?.ok) {
      const json = await res.json().catch(() => null);
      wdaOnline = Boolean(json?.value?.ready !== false);
      wdaSessionId = String(json?.sessionId || json?.value?.sessionId || "");
      if (!iosVersion) iosVersion = String(json?.value?.os?.version || "");
    }
  } catch {
    wdaOnline = false;
  }

  const sshOnline = await portProbeFn(tx.sshPort, tx.sshHost).catch(() => false);
  return {
    iosMcpOnline,
    wdaOnline,
    sshOnline,
    wdaSessionId,
    iosVersion,
    mcpUrl: tx.mcpUrl,
    sshHost: tx.sshHost,
    sshPort: tx.sshPort,
  };
}

async function ensureIosUsbmuxTunnels({
  udid = "",
  wdaPort = 8100,
  sshPort = DEFAULT_SSH_PORT,
  mjpegPort = DEFAULT_MJPEG_PORT,
  spawnFn = spawn,
  portProbeFn = checkTcpPortOpen,
} = {}) {
  const cleanUdid = stripIosSerialPrefix(udid);
  const forwards = [
    { local: wdaPort, remote: 8100, key: "wda" },
    { local: sshPort, remote: 22, key: "ssh" },
    { local: mjpegPort, remote: 9100, key: "mjpeg" },
  ];
  const started = [];
  const pymobileBin = spawnFn === spawn ? resolvePymobiledevice3BinaryPath() : "pymobiledevice3";
  for (const fw of forwards) {
    const alreadyOpen = await portProbeFn(fw.local).catch(() => false);
    if (alreadyOpen) continue;
    const args = ["usbmux", "forward"];
    if (cleanUdid) args.push("--udid", cleanUdid);
    args.push(String(fw.local), String(fw.remote));
    try {
      const child = spawnFn(pymobileBin, args, {
        windowsHide: true,
        stdio: "ignore",
        detached: true,
      });
      if (child && typeof child.unref === "function") child.unref();
      _iosCache.tunnelProcs.set(`${cleanUdid || "default"}:${fw.key}`, child);
      started.push(fw);
    } catch {
      /* ignore */
    }
  }
  return { ok: true, started };
}

async function getIosBatteryDiagnostics(
  udid,
  { deviceInfo = null, mcpUrl = "", fetchFn = fetch, execFileFn = execFileAsync, cacheMs = 20_000 } = {},
) {
  const cleanUdid = stripIosSerialPrefix(udid);
  const now = Date.now();
  const cached = _iosCache.batteryByUdid.get(cleanUdid);
  if (cached && now - cached.ts < cacheMs && (!deviceInfo?.mcpUrl || cached.data.memoryFreeMb != null)) {
    return cached.data;
  }

  const tx = resolveTransportConfig({ serial: cleanUdid ? makeIosSerial(cleanUdid) : "", deviceInfo, mcpUrl });
  if (tx.mcpUrl) {
    const res = await callIosMcpTool(tx.mcpUrl, "get_device_info", {}, { fetchFn, timeoutMs: 1200 });
    const info = parseMcpTextJson(res);
    if (info && Number.isFinite(Number(info.batteryLevel))) {
      const stateStr = String(info.batteryState || "").toLowerCase();
      let batteryTempC = null;
      if (execFileFn === execFileAsync && tx.sshHost) {
        if (cached && now - cached.ts < 60_000 && cached.data?.batteryTempC != null) {
          batteryTempC = cached.data.batteryTempC;
        } else {
          try {
            const { stdout: ioOut } = await runIosSshCommand(
              "ioreg -rn AppleARMPMUCharger | grep -E '\"Temperature\" =' | head -n 1",
              { serial: cleanUdid ? makeIosSerial(cleanUdid) : "", sshHost: tx.sshHost, sshPort: tx.sshPort, sshUser: tx.sshUser, execFileFn, timeout: 2000 },
            );
            const tm = /"Temperature"\s*=\s*(\d+)/.exec(String(ioOut || ""));
            if (tm) {
              const rawT = Number(tm[1]);
              if (Number.isFinite(rawT)) batteryTempC = rawT > 100 ? Number((rawT / 100).toFixed(1)) : rawT;
            }
          } catch {
            /* optional SSH thermal enrich */
          }
        }
      }
      const data = {
        batteryLevel: Number(info.batteryLevel),
        batteryTempC,
        acPowered: stateStr === "charging" || stateStr === "full",
        memoryFreeMb: Number.isFinite(Number(info.memoryFreeMB)) ? Math.round(Number(info.memoryFreeMB)) : null,
        storageFreeGb: Number.isFinite(Number(info.storageFreeGB)) ? Number(info.storageFreeGB.toFixed(1)) : null,
      };
      _iosCache.batteryByUdid.set(cleanUdid, { ts: now, data });
      return data;
    }
  }

  try {
    const pymobileBin = execFileFn === execFileAsync ? resolvePymobiledevice3BinaryPath() : "pymobiledevice3";
    const args = ["lockdown", "get"];
    if (cleanUdid) args.push("--udid", cleanUdid);
    args.push("com.apple.mobile.battery");
    const { stdout } = await execFileFn(pymobileBin, args, { timeout: 3500 });
    let parsed = JSON.parse(String(stdout || "{}"));
    if (parsed.Temperature == null) {
      try {
        const diagArgs = ["diagnostics", "battery", "single"];
        if (cleanUdid) diagArgs.push("--udid", cleanUdid);
        const { stdout: diagOut } = await execFileFn(pymobileBin, diagArgs, { timeout: 4500 });
        const diagParsed = JSON.parse(String(diagOut || "{}"));
        if (diagParsed && (diagParsed.Temperature != null || diagParsed.CurrentCapacity != null)) {
          parsed = {
            ...parsed,
            BatteryCurrentCapacity: parsed.BatteryCurrentCapacity ?? diagParsed.CurrentCapacity,
            Temperature: parsed.Temperature ?? diagParsed.Temperature,
            ExternalConnected: parsed.ExternalConnected ?? diagParsed.ExternalConnected,
          };
        }
      } catch {
        /* fallback optional diagnostics battery */
      }
    }
    const level = Number(parsed.BatteryCurrentCapacity);
    const rawTemp = Number(parsed.Temperature);
    const tempC = Number.isFinite(rawTemp) && rawTemp > 100 ? Number((rawTemp / 100).toFixed(1)) : Number.isFinite(rawTemp) ? rawTemp : null;
    const data = {
      batteryLevel: Number.isFinite(level) ? level : null,
      batteryTempC: tempC,
      acPowered: Boolean(parsed.ExternalConnected),
      memoryFreeMb: null,
      storageFreeGb: null,
    };
    _iosCache.batteryByUdid.set(cleanUdid, { ts: now, data });
    return data;
  } catch {
    return { batteryLevel: null, batteryTempC: null, acPowered: null, memoryFreeMb: null, storageFreeGb: null };
  }
}

async function captureIosScreenDataUrl({
  udid = "",
  deviceInfo = null,
  mcpUrl = "",
  wdaUrl = DEFAULT_WDA_URL,
  fetchFn = fetch,
  execFileFn = execFileAsync,
  cacheMs = 700,
} = {}) {
  const cleanUdid = stripIosSerialPrefix(udid);
  const now = Date.now();
  const cached = _iosCache.screenByUdid.get(cleanUdid);
  if (cached && now - cached.ts < cacheMs && cached.dataUrl) {
    return cached.dataUrl;
  }

  // 1) Fastest path: wireless/SSH-tunneled ios-mcp :8090 screenshot (~150ms)
  const tx = resolveTransportConfig({ serial: cleanUdid ? makeIosSerial(cleanUdid) : "", deviceInfo, mcpUrl, wdaUrl });
  const isProdTransport = fetchFn === fetch && execFileFn === execFileAsync;
  const isWifiMcpOnlyDevice = Boolean(isProdTransport && deviceInfo?.isWireless && deviceInfo?.device === "wifi" && tx.mcpUrl);
  if (tx.mcpUrl) {
    const mcpRes = await callIosMcpTool(tx.mcpUrl, "screenshot", {}, { fetchFn, timeoutMs: 3200 });
    const imgItem = mcpRes?.content?.find?.((c) => c?.type === "image" && c?.data);
    if (imgItem?.data) {
      const mime = String(imgItem.mimeType || "image/jpeg").trim();
      const dataUrl = `data:${mime};base64,${imgItem.data}`;
      _iosCache.screenByUdid.set(cleanUdid, { ts: Date.now(), dataUrl });
      return dataUrl;
    }
    // Wi-Fi-only MCP nodes have no local USB WDA (:8100) or USB DVT tunnel — skip 5s of dead fallbacks
    if (isWifiMcpOnlyDevice) {
      return cached?.dataUrl || null;
    }
  }

  // 2) Secondary path: WebDriverAgent HTTP /screenshot
  try {
    const res = await fetchFn(`${tx.wdaUrl.replace(/\/$/, "")}/screenshot`, {
      signal: AbortSignal.timeout(1500),
    });
    if (res?.ok) {
      const json = await res.json().catch(() => null);
      if (json?.value && typeof json.value === "string") {
        const dataUrl = `data:image/png;base64,${json.value}`;
        _iosCache.screenByUdid.set(cleanUdid, { ts: now, dataUrl });
        return dataUrl;
      }
    }
  } catch {
    /* fallback to DVT */
  }

  // 3) Fallback: pymobiledevice3 developer dvt screenshot (requires mounted DDI + USB)
  const tmpPng = path.join(os.tmpdir(), `p0003-ios-${cleanUdid || "dev"}-${crypto.randomUUID().slice(0, 8)}.png`);
  try {
    const pymobileBin = execFileFn === execFileAsync ? resolvePymobiledevice3BinaryPath() : "pymobiledevice3";
    const args = ["developer", "dvt", "screenshot"];
    if (cleanUdid) args.push("--udid", cleanUdid);
    args.push(tmpPng);
    await execFileFn(pymobileBin, args, { timeout: 3500 });
    if (fs.existsSync(tmpPng)) {
      const buf = fs.readFileSync(tmpPng);
      if (buf.length > 0) {
        const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
        _iosCache.screenByUdid.set(cleanUdid, { ts: now, dataUrl });
        return dataUrl;
      }
    }
  } catch {
    /* ignore locked/no-USB error */
  } finally {
    try {
      if (fs.existsSync(tmpPng)) fs.unlinkSync(tmpPng);
    } catch {
      /* ignore */
    }
  }
  return cached?.dataUrl || null;
}

async function getIosLiveScreenState(
  deviceInfo,
  {
    includeScreenshot = true,
    vaultRoot = resolveMobileVaultRoot(),
    mcpUrl = "",
    wdaUrl = DEFAULT_WDA_URL,
    sshPort,
    cacheMs,
    fetchFn = fetch,
    execFileFn = execFileAsync,
    portProbeFn = checkTcpPortOpen,
  } = {},
) {
  const udid = stripIosSerialPrefix(deviceInfo?.udid || deviceInfo?.serial || "");
  const spec = resolveIosDeviceSpec(deviceInfo?.product || "iPhone8,2");
  const serial = makeIosSerial(udid);
  const nowMs = Date.now();
  const isProdProbes = fetchFn === fetch && execFileFn === execFileAsync && portProbeFn === checkTcpPortOpen;
  const cachedHealth = isProdProbes && cacheMs !== 0 ? _iosCache.healthByUdid.get(udid) : null;
  const cachedFront = isProdProbes && cacheMs !== 0 ? _iosCache.frontAppByUdid.get(udid) : null;

  const [health, battery, screenDataUrl, frontRes] = await Promise.all([
    cachedHealth && nowMs - cachedHealth.ts < 8_000
      ? Promise.resolve(cachedHealth.data)
      : probeIosEndpointHealth({ deviceInfo, mcpUrl, wdaUrl, sshPort, fetchFn, portProbeFn }).then((h) => {
          if (isProdProbes) _iosCache.healthByUdid.set(udid, { ts: Date.now(), data: h });
          return h;
        }),
    getIosBatteryDiagnostics(udid, { deviceInfo, mcpUrl, fetchFn, execFileFn, ...(cacheMs !== undefined ? { cacheMs } : {}) }),
    includeScreenshot
      ? captureIosScreenDataUrl({ udid, deviceInfo, mcpUrl, wdaUrl, fetchFn, execFileFn, ...(cacheMs !== undefined ? { cacheMs } : {}) })
      : Promise.resolve(_iosCache.screenByUdid.get(udid)?.dataUrl || null),
    deviceInfo?.mcpUrl || mcpUrl
      ? cachedFront && nowMs - cachedFront.ts < 8_000
        ? Promise.resolve(cachedFront.data)
        : callIosMcpTool(deviceInfo?.mcpUrl || mcpUrl, "get_frontmost_app", {}, { fetchFn, timeoutMs: 900 }).then((fr) => {
            if (isProdProbes && fr) _iosCache.frontAppByUdid.set(udid, { ts: Date.now(), data: fr });
            return fr;
          })
      : Promise.resolve(null),
  ]);
  const frontInfo = parseMcpTextJson(frontRes);
  const activeProfileCode = readActiveIosProfileCode(vaultRoot);
  let profileMeta = null;
  try {
    const mp = path.join(vaultRoot, "ios", `${activeProfileCode}.meta.json`);
    if (fs.existsSync(mp)) profileMeta = JSON.parse(fs.readFileSync(mp, "utf8"));
  } catch {
    /* ignore */
  }
  const width = deviceInfo?.width || spec.width;
  const height = deviceInfo?.height || spec.height;
  const resolution = `${width}x${height}`;
  const modeTag = health.iosMcpOnline ? "MCP · Wi-Fi" : health.wdaOnline ? "WDA" : health.sshOnline ? "SSH" : "USB";

  return {
    ok: true,
    platform: "ios",
    adbOnline: true,
    iosOnline: true,
    iosMcpOnline: health.iosMcpOnline,
    iosWdaOnline: health.wdaOnline,
    iosSshOnline: health.sshOnline,
    isWireless: Boolean(deviceInfo?.isWireless || health.iosMcpOnline),
    serial,
    udid,
    wifiHost: deviceInfo?.wifiHost || health.sshHost || "",
    liveDeviceModel: deviceInfo?.model || spec.model,
    currentUserId: 0,
    batteryLevel: battery.batteryLevel,
    batteryTempC: battery.batteryTempC,
    screenDataUrl: screenDataUrl || null,
    displayScreenshots: screenDataUrl ? { "0": screenDataUrl } : {},
    displays: [
      {
        logicalId: 0,
        sfId: "ios-0",
        name: `iOS · ${deviceInfo?.marketingModel || spec.model} · ${modeTag}`,
        kind: "physical",
        resolution,
        assignedUserId: 0,
        assignedProfileCode: activeProfileCode,
        active: true,
        c_user: profileMeta?.c_user || null,
        fbAccountName: frontInfo?.bundleId ? `App: ${frontInfo.name || frontInfo.bundleId}` : null,
      },
    ],
    multiUserSlots: [],
    hardwareHealth: {
      ok: true,
      batteryLevel: battery.batteryLevel ?? undefined,
      batteryTempC: battery.batteryTempC ?? undefined,
      acPowered: battery.acPowered ?? undefined,
      ramAvailableMb: battery.memoryFreeMb ?? undefined,
      runningUserCount: 1,
      totalUserCount: 1,
    },
  };
}

async function ensureWdaSession({ wdaUrl = DEFAULT_WDA_URL, fetchFn = fetch } = {}) {
  if (_iosCache.wdaSessionId) {
    try {
      const check = await fetchFn(`${wdaUrl.replace(/\/$/, "")}/session/${_iosCache.wdaSessionId}/window/size`, {
        signal: AbortSignal.timeout(900),
      });
      if (check?.ok) return _iosCache.wdaSessionId;
    } catch {
      _iosCache.wdaSessionId = "";
    }
  }
  const stRes = await fetchFn(`${wdaUrl.replace(/\/$/, "")}/status`, {
    signal: AbortSignal.timeout(1000),
  }).catch(() => null);
  const stJson = stRes?.ok ? await stRes.json().catch(() => null) : null;
  if (stJson?.sessionId) {
    _iosCache.wdaSessionId = String(stJson.sessionId);
    return _iosCache.wdaSessionId;
  }
  const createRes = await fetchFn(`${wdaUrl.replace(/\/$/, "")}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capabilities: {} }),
    signal: AbortSignal.timeout(2500),
  }).catch(() => null);
  const created = createRes?.ok ? await createRes.json().catch(() => null) : null;
  const sid = String(created?.sessionId || created?.value?.sessionId || "");
  if (sid) _iosCache.wdaSessionId = sid;
  return sid;
}

function normalizeControlAction(body = {}) {
  const rawAction = String(body.action || "").trim().toLowerCase();
  const keyCodeStr = String(body.keyCode || body.key || "").trim().toUpperCase();
  const keyNum = Number(body.keycode);
  if (rawAction === "keyevent" || rawAction === "key") {
    if (keyCodeStr === "KEYCODE_HOME" || keyNum === 3) return "home";
    if (keyCodeStr === "KEYCODE_BACK" || keyNum === 4) return "back";
    if (keyCodeStr === "KEYCODE_APP_SWITCH" || keyNum === 187) return "recents";
    if (keyCodeStr === "KEYCODE_POWER" || keyNum === 26) return "power";
  }
  return rawAction;
}

async function dispatchIosLiveControlAction(
  body = {},
  {
    mcpUrl = "",
    wdaUrl = DEFAULT_WDA_URL,
    sshPort,
    wifiHosts,
    fetchFn = fetch,
    execFileFn = execFileAsync,
    spawnFn = spawn,
    portProbeFn = checkTcpPortOpen,
  } = {},
) {
  const action = normalizeControlAction(body);
  const serial = String(body.serial || _iosCache.activeSerial || "").trim();
  const udid = stripIosSerialPrefix(serial);

  if (action === "select-device") {
    const devices = await listConnectedIosDevices({ execFileFn, fetchFn, wifiHosts, cacheMs: 0 });
    const target = devices.find((d) => d.serial === serial || d.udid === udid);
    if (!target) {
      return { ok: false, reason: "ios_device_offline", serial };
    }
    setActiveIosDeviceSerial(target.serial);
    if (!target.mcpUrl) {
      await ensureIosUsbmuxTunnels({ udid: target.udid, sshPort, spawnFn, portProbeFn }).catch(() => undefined);
    }
    return {
      ok: true,
      serial: target.serial,
      device: {
        serial: target.serial,
        model: target.model,
        product: target.product,
        platform: "ios",
        isWireless: target.isWireless,
      },
    };
  }

  if (action === "ensure-usbmux-tunnels") {
    return ensureIosUsbmuxTunnels({ udid, sshPort, spawnFn, portProbeFn });
  }

  const tx = resolveTransportConfig({ serial, mcpUrl, wdaUrl });
  // 1) Primary fast dispatch via ios-mcp :8090
  if (tx.mcpUrl) {
    if (action === "wake" || action === "unlock") {
      const r = await callIosMcpTool(tx.mcpUrl, "wake_and_home", {}, { fetchFn, timeoutMs: 4000 });
      if (r) return { ok: true, action, via: "ios-mcp", serial };
    }
    if (action === "home") {
      const stateRes = await callIosMcpTool(tx.mcpUrl, "get_screen_info", {}, { fetchFn, timeoutMs: 1200 });
      const st = parseMcpTextJson(stateRes);
      const tool = st?.locked ? "wake_and_home" : "press_home";
      const r = await callIosMcpTool(tx.mcpUrl, tool, {}, { fetchFn, timeoutMs: 3500 });
      if (r) return { ok: true, action: "home", via: "ios-mcp", serial };
    }
    if (action === "recents") {
      await callIosMcpTool(tx.mcpUrl, "press_home", { duration: 80 }, { fetchFn, timeoutMs: 1500 });
      const r = await callIosMcpTool(tx.mcpUrl, "press_home", { duration: 80 }, { fetchFn, timeoutMs: 1500 });
      if (r) return { ok: true, action: "recents", via: "ios-mcp", serial };
    }
    if (action === "power") {
      const r = await callIosMcpTool(tx.mcpUrl, "press_power", {}, { fetchFn, timeoutMs: 2000 });
      if (r) return { ok: true, action: "power", via: "ios-mcp", serial };
    }
    if (action === "tap") {
      const x = Math.max(0, Math.round(Number(body.x) || 0));
      const y = Math.max(0, Math.round(Number(body.y) || 0));
      const r = await callIosMcpTool(tx.mcpUrl, "tap_screen", { x, y }, { fetchFn, timeoutMs: 2500 });
      if (r) return { ok: true, action: "tap", x, y, via: "ios-mcp", serial };
    }
    if (action === "longpress") {
      const x = Math.max(0, Math.round(Number(body.x) || 0));
      const y = Math.max(0, Math.round(Number(body.y) || 0));
      const duration = Math.max(300, Math.min(3000, Number(body.durationMs) || 700));
      const r = await callIosMcpTool(tx.mcpUrl, "long_press", { x, y, duration }, { fetchFn, timeoutMs: 4000 });
      if (r) return { ok: true, action: "longpress", via: "ios-mcp", serial };
    }
    if (action === "swipe" || action === "back") {
      const x1 = action === "back" ? 8 : Math.max(0, Math.round(Number(body.x) || 0));
      const y1 = action === "back" ? 368 : Math.max(0, Math.round(Number(body.y) || 0));
      const x2 = action === "back" ? 280 : Math.max(0, Math.round(Number(body.x2) || x1));
      const y2 = action === "back" ? 368 : Math.max(0, Math.round(Number(body.y2) || y1));
      const duration = Math.max(80, Math.min(1200, Number(body.durationMs) || 260));
      const r = await callIosMcpTool(
        tx.mcpUrl,
        "swipe_screen",
        { fromX: x1, fromY: y1, toX: x2, toY: y2, duration },
        { fetchFn, timeoutMs: 3000 },
      );
      if (r) return { ok: true, action, via: "ios-mcp", serial };
    }
    if (action === "text" || action === "input-text") {
      const text = String(body.text || "");
      const r = await callIosMcpTool(tx.mcpUrl, "input_text", { text }, { fetchFn, timeoutMs: 4000 });
      if (r) return { ok: true, action: "text", length: text.length, via: "ios-mcp", serial };
    }
    if (action === "key" || action === "keyevent") {
      const rawKey = String(body.key || body.keyCode || body.keycode || "").toLowerCase();
      const mapped = rawKey.includes("enter") || rawKey === "66"
        ? "return"
        : rawKey.includes("del") || rawKey.includes("back") || rawKey === "67"
          ? "backspace"
          : rawKey;
      const r = await callIosMcpTool(tx.mcpUrl, "press_key", { key: mapped }, { fetchFn, timeoutMs: 2500 });
      if (r) return { ok: true, action: "key", key: mapped, via: "ios-mcp", serial };
    }
    if ((action === "open-url" || action === "open_url") && body.url) {
      const r = await callIosMcpTool(tx.mcpUrl, "open_url", { url: String(body.url) }, { fetchFn, timeoutMs: 3500 });
      if (r) return { ok: true, action: "open-url", url: body.url, via: "ios-mcp", serial };
    }
    if (action === "launch-app" || action === "launch") {
      const pkg = String(body.bundleId || body.packageName || "").trim();
      const alias = ANDROID_TO_IOS_APP_ALIASES[pkg];
      const candidates = alias ? alias.bundleIds : [pkg];
      for (const bid of candidates) {
        if (!bid) continue;
        const r = await callIosMcpTool(tx.mcpUrl, "launch_app", { bundle_id: bid }, { fetchFn, timeoutMs: 3500 });
        const parsed = parseMcpTextJson(r);
        if (r && !parsed?.error && !String(parsed?.text || "").toLowerCase().includes("failed")) {
          return { ok: true, action: "launch-app", bundleId: bid, via: "ios-mcp", serial };
        }
      }
      if (alias?.fallbackUrl) {
        const r = await callIosMcpTool(tx.mcpUrl, "open_url", { url: alias.fallbackUrl }, { fetchFn, timeoutMs: 3500 });
        if (r) return { ok: true, action: "launch-app", url: alias.fallbackUrl, via: "ios-mcp", serial };
      }
    }
  }

  // 2) Legacy WebDriverAgent HTTP fallback (:8100)
  const base = tx.wdaUrl.replace(/\/$/, "");
  if (action === "home") {
    const res = await fetchFn(`${base}/wda/homescreen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(2500),
    }).catch(() => null);
    return res?.ok ? { ok: true, action: "home", via: "wda", serial } : { ok: false, reason: "ios_wda_not_online", serial };
  }

  if (action === "tap" || action === "swipe" || action === "back") {
    const sid = await ensureWdaSession({ wdaUrl: base, fetchFn });
    if (!sid) {
      return { ok: false, reason: "ios_wda_not_online", serial };
    }
    const x1 = action === "back" ? 8 : Math.max(0, Math.round(Number(body.x) || 0));
    const y1 = action === "back" ? 360 : Math.max(0, Math.round(Number(body.y) || 0));
    const x2 = action === "back" ? 260 : Math.max(0, Math.round(Number(body.x2) || x1));
    const y2 = action === "back" ? 360 : Math.max(0, Math.round(Number(body.y2) || y1));
    const durationMs = Math.max(80, Math.min(1200, Number(body.durationMs) || 280));

    const pointerActions =
      action === "tap"
        ? [
            { type: "pointerMove", duration: 0, x: x1, y: y1 },
            { type: "pointerDown", button: 0 },
            { type: "pause", duration: 60 },
            { type: "pointerUp", button: 0 },
          ]
        : [
            { type: "pointerMove", duration: 0, x: x1, y: y1 },
            { type: "pointerDown", button: 0 },
            { type: "pointerMove", duration: durationMs, x: x2, y: y2 },
            { type: "pointerUp", button: 0 },
          ];

    const actRes = await fetchFn(`${base}/session/${sid}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actions: [{ type: "pointer", id: "finger1", parameters: { pointerType: "touch" }, actions: pointerActions }],
      }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    return actRes?.ok ? { ok: true, action, via: "wda", serial } : { ok: false, reason: "ios_wda_action_failed", serial };
  }

  if ((action === "open-url" || action === "open_url") && body.url) {
    const sid = await ensureWdaSession({ wdaUrl: base, fetchFn });
    if (!sid) return { ok: false, reason: "ios_wda_not_online", serial };
    const res = await fetchFn(`${base}/session/${sid}/url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: String(body.url) }),
      signal: AbortSignal.timeout(3500),
    }).catch(() => null);
    return res?.ok ? { ok: true, action, url: body.url, via: "wda", serial } : { ok: false, reason: "ios_wda_url_failed", serial };
  }

  return { ok: false, reason: `unsupported_ios_action:${action}`, serial };
}

async function augmentMobileProfilesResponse(payload, opts = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const vaultRoot = opts.vaultRoot || resolveMobileVaultRoot();
  const iosDevices = await listConnectedIosDevices(opts);
  const health =
    iosDevices.length > 0
      ? await probeIosEndpointHealth({ ...opts, deviceInfo: iosDevices[0] })
      : { iosMcpOnline: false, wdaOnline: false, sshOnline: false };

  let nextProfiles = payload.profiles;
  if (Array.isArray(payload.profiles)) {
    const craneMap = await resolveIosCraneProfilesMap({
      ...opts,
      vaultRoot,
      iosDevices,
      sshOnline: health.sshOnline,
    }).catch(() => new Map());
    nextProfiles = payload.profiles.map((row) => {
      const code = String(row?.code || "").trim().padStart(4, "0");
      const iosCrane = craneMap.get(code) || row?.iosCrane || null;
      if (!iosCrane) return row;
      return {
        ...row,
        hasIosContainer: true,
        iosCrane,
      };
    });
  }

  if (iosDevices.length === 0) {
    return nextProfiles !== payload.profiles ? { ...payload, profiles: nextProfiles } : payload;
  }

  const existingAvail = Array.isArray(payload.device?.availableDevices) ? payload.device.availableDevices : [];
  const existingFiltered = existingAvail.filter((d) => !isIosSerial(d?.serial));
  const mergedAvail = [
    ...existingFiltered.map((d) => ({
      ...d,
      active: _iosCache.activeSerial ? false : Boolean(d.active),
    })),
    ...iosDevices.map((d) => ({
      serial: d.serial,
      model: d.model,
      product: d.product,
      device: d.device,
      isWireless: d.isWireless,
      active: _iosCache.activeSerial === d.serial,
    })),
  ];

  return {
    ...payload,
    ...(nextProfiles !== payload.profiles ? { profiles: nextProfiles } : {}),
    device: {
      ...(payload.device || {}),
      iosOnline: true,
      iosMcpOnline: health.iosMcpOnline,
      iosWdaOnline: health.wdaOnline,
      iosSshOnline: health.sshOnline,
      availableDevices: mergedAvail,
    },
  };
}

function refreshSingleIosBgState(dev, opts = {}) {
  if (!dev?.serial) return Promise.resolve(null);
  let entry = _iosCache.bgStateBySerial.get(dev.serial);
  if (entry?.inFlight) return entry.inFlight;
  const prevState = entry?.state || null;
  const p = getIosLiveScreenState(dev, {
    ...opts,
    includeScreenshot: true,
    cacheMs: opts.cacheMs ?? 900,
  })
    .then((snap) => {
      if (snap) {
        const mergedSnap =
          !snap.screenDataUrl && prevState?.screenDataUrl
            ? {
                ...snap,
                screenDataUrl: prevState.screenDataUrl,
                displayScreenshots: { "0": prevState.screenDataUrl },
              }
            : snap;
        _iosCache.bgStateBySerial.set(dev.serial, {
          state: mergedSnap,
          ts: Date.now(),
          inFlight: null,
        });
        return mergedSnap;
      }
      if (entry) entry.inFlight = null;
      return prevState;
    })
    .catch(() => {
      if (entry) entry.inFlight = null;
      return prevState;
    });
  entry = { state: prevState, ts: entry?.ts || 0, inFlight: p };
  _iosCache.bgStateBySerial.set(dev.serial, entry);
  return p;
}

function stopIosBackgroundPoller() {
  if (_iosCache.bgPoller.timer) {
    clearInterval(_iosCache.bgPoller.timer);
    _iosCache.bgPoller.timer = null;
  }
}

function ensureIosBackgroundPoller(opts = {}) {
  if (_iosCache.bgPoller.timer) return;
  const intervalMs = Math.max(400, Number(opts.bgIntervalMs) || 1450);
  const timer = setInterval(() => {
    if (Date.now() - _iosCache.bgPoller.lastDemandAt > 30_000) {
      stopIosBackgroundPoller();
      return;
    }
    const devs = _iosCache.bgPoller.devices || [];
    for (const dev of devs) {
      void refreshSingleIosBgState(dev, opts);
    }
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  _iosCache.bgPoller.timer = timer;
}

async function augmentLiveScreenResponse(payload, queryParams = {}, opts = {}) {
  const iosDevices = await listConnectedIosDevices(opts);
  if (iosDevices.length === 0) return payload;

  const includeScreenshot = queryParams.includeScreenshot !== false;
  const allDevices = Boolean(queryParams.allDevices);
  const requestedSerial = String(queryParams.serial || "").trim();
  const activeSerial = isIosSerial(requestedSerial) ? requestedSerial : _iosCache.activeSerial;

  const existingAvail = Array.isArray(payload?.availableDevices) ? payload.availableDevices : [];
  const mergedAvail = [
    ...existingAvail.map((d) => ({
      ...d,
      active: activeSerial ? false : Boolean(d.active),
    })),
    ...iosDevices.map((d) => ({
      serial: d.serial,
      model: d.model,
      product: d.product,
      device: d.device,
      isWireless: d.isWireless,
      active: activeSerial === d.serial,
    })),
  ];

  const iosStates = {};
  if (allDevices || activeSerial) {
    const targetDevs = iosDevices.filter((dev) => allDevices || !activeSerial || dev.serial === activeSerial);
    const useAsyncPoller =
      opts.useBackgroundPoller === true ||
      (includeScreenshot &&
        opts.useBackgroundPoller !== false &&
        opts.fetchFn === undefined &&
        opts.execFileFn === undefined &&
        opts.portProbeFn === undefined);

    if (useAsyncPoller) {
      const now = Date.now();
      _iosCache.bgPoller.lastDemandAt = now;
      _iosCache.bgPoller.devices = targetDevs;
      ensureIosBackgroundPoller(opts);

      const coldPromises = [];
      for (const dev of targetDevs) {
        const entry = _iosCache.bgStateBySerial.get(dev.serial);
        if (!entry?.state || now - entry.ts >= 1200) {
          const p = refreshSingleIosBgState(dev, opts);
          if (!entry?.state) coldPromises.push(p);
        }
      }
      if (coldPromises.length > 0) {
        const coldWaitMs = Math.max(50, Number(opts.coldWaitBudgetMs) || 850);
        await Promise.race([
          Promise.all(coldPromises),
          new Promise((resolve) => setTimeout(resolve, coldWaitMs)),
        ]);
      }
      for (const dev of targetDevs) {
        const entry = _iosCache.bgStateBySerial.get(dev.serial);
        if (entry?.state) {
          iosStates[dev.serial] = entry.state;
        } else {
          const spec = resolveIosDeviceSpec(dev.product || "iPhone8,2");
          iosStates[dev.serial] = {
            ok: true,
            platform: "ios",
            adbOnline: true,
            iosOnline: true,
            isWireless: Boolean(dev.isWireless),
            serial: dev.serial,
            udid: stripIosSerialPrefix(dev.serial),
            liveDeviceModel: dev.model || spec.model,
            currentUserId: 0,
            screenDataUrl: null,
            displayScreenshots: {},
            displays: [
              {
                logicalId: 0,
                sfId: "ios-0",
                name: `iOS · ${dev.model || spec.model}`,
                kind: "physical",
                resolution: `${dev.width || spec.width}x${dev.height || spec.height}`,
                assignedUserId: 0,
                active: true,
              },
            ],
            multiUserSlots: [],
          };
        }
      }
    } else {
      const snaps = await Promise.all(
        targetDevs.map((dev) =>
          getIosLiveScreenState(dev, {
            ...opts,
            includeScreenshot,
          }),
        ),
      );
      targetDevs.forEach((dev, idx) => {
        if (snaps[idx]) iosStates[dev.serial] = snaps[idx];
      });
    }
  }

  if (activeSerial && iosStates[activeSerial]) {
    const primaryIos = iosStates[activeSerial];
    const combinedStates = {
      ...(payload?.deviceStates || {}),
      ...(payload?.serial && payload?.ok ? { [payload.serial]: payload } : {}),
      ...iosStates,
    };
    return {
      ...primaryIos,
      availableDevices: mergedAvail,
      deviceStates: combinedStates,
    };
  }

  return {
    ...(payload || {}),
    iosOnline: true,
    availableDevices: mergedAvail,
    deviceStates: {
      ...(payload?.deviceStates || {}),
      ...iosStates,
    },
  };
}

function resolveIosSshKeyPath(vaultRoot = resolveMobileVaultRoot()) {
  const custom = String(process.env.IOS_SSH_KEY_PATH || "").trim();
  if (custom) return custom;
  const candidates = [
    path.join(os.homedir(), ".ssh", "id_ed25519_p0003"),
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, ".ssh", "id_ed25519_p0003") : "",
    "C:\\Users\\CzP\\.ssh\\id_ed25519_p0003",
    path.join(vaultRoot, "ios", "id_ed25519_p0003"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function buildSshBaseArgs({ isScp = false, sshPort = DEFAULT_SSH_PORT, keyPath = "", vaultRoot = resolveMobileVaultRoot() } = {}) {
  const args = [
    isScp ? "-P" : "-p",
    String(sshPort),
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=4",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
  ];
  const resolvedKey = keyPath || resolveIosSshKeyPath(vaultRoot);
  if (resolvedKey && fs.existsSync(resolvedKey)) {
    args.push("-i", resolvedKey);
  }
  return args;
}

function writeActiveIosProfileCode(profileCode, { vaultRoot = resolveMobileVaultRoot(), udid = "", proxy = "" } = {}) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const iosDir = path.join(vaultRoot, "ios");
  fs.mkdirSync(iosDir, { recursive: true });
  const activeFile = path.join(iosDir, "active-profile.json");
  fs.writeFileSync(
    activeFile,
    JSON.stringify(
      {
        profileCode: cleanCode,
        udid: stripIosSerialPrefix(udid),
        proxy: String(proxy || ""),
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  return cleanCode;
}

async function runIosSshCommand(
  remoteCmd,
  {
    serial = "",
    sshPort,
    sshUser,
    sshHost,
    keyPath = "",
    vaultRoot = resolveMobileVaultRoot(),
    execFileFn = execFileAsync,
    timeout = 10_000,
  } = {},
) {
  const tx = resolveTransportConfig({ serial, sshPort, sshUser, sshHost });
  const args = buildSshBaseArgs({ isScp: false, sshPort: tx.sshPort, keyPath, vaultRoot });
  const envPrefix = 'export PATH="/var/jb/usr/local/bin:/var/jb/usr/bin:/var/jb/bin:/usr/bin:/bin:/usr/sbin:/sbin"; ';
  const finalCmd = String(remoteCmd || "").includes("PATH=") ? remoteCmd : `${envPrefix}${remoteCmd}`;
  args.push(`${tx.sshUser}@${tx.sshHost}`, finalCmd);
  return execFileFn("ssh", args, { timeout });
}

async function resolveSafariContainerPath({
  serial = "",
  sshPort,
  sshUser,
  sshHost,
  vaultRoot = resolveMobileVaultRoot(),
  execFileFn = execFileAsync,
} = {}) {
  const udid = stripIosSerialPrefix(serial || _iosCache.activeSerial || "default");
  const cached = _iosCache.containerByUdid.get(udid);
  if (cached) return cached;

  const findCmd = [
    'export PATH="/var/jb/usr/bin:/var/jb/bin:/usr/bin:/bin"',
    'f=$(grep -l "com.apple.mobilesafari" /var/mobile/Containers/Data/Application/*/.com.apple.mobile_container_manager.metadata.plist 2>/dev/null | head -n1)',
    'if [ -n "$f" ]; then dirname "$f"; fi',
  ].join("; ");
  const out = await runIosSshCommand(findCmd, {
    serial,
    sshPort,
    sshUser,
    sshHost,
    vaultRoot,
    execFileFn,
    timeout: 6000,
  }).catch(() => null);
  const resolved = String(out?.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("/var/mobile/Containers/Data/Application/"));
  if (resolved) {
    _iosCache.containerByUdid.set(udid, resolved);
    return resolved;
  }
  return "";
}

/** Parse Apple `Cookies.binarycookies` buffer into P0003 JSON cookie records. */
function parseBinaryCookies(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12 || buf.toString("ascii", 0, 4) !== "cook") {
    return [];
  }
  const numPages = buf.readUInt32BE(4);
  if (buf.length < 8 + numPages * 4) return [];
  const pageSizes = [];
  for (let i = 0; i < numPages; i += 1) {
    pageSizes.push(buf.readUInt32BE(8 + i * 4));
  }
  const readCString = (slice, start) => {
    if (start < 0 || start >= slice.length) return "";
    const end = slice.indexOf(0, start);
    return slice.toString("utf8", start, end === -1 ? slice.length : end);
  };
  const out = [];
  let offset = 8 + numPages * 4;
  for (const ps of pageSizes) {
    if (offset + ps > buf.length) break;
    const pg = buf.subarray(offset, offset + ps);
    offset += ps;
    if (pg.length < 8) continue;
    const numCookies = pg.readUInt32LE(4);
    for (let i = 0; i < numCookies; i += 1) {
      if (8 + i * 4 + 4 > pg.length) break;
      const co = pg.readUInt32LE(8 + i * 4);
      if (co + 56 > pg.length) continue;
      const rec = pg.subarray(co);
      const flags = rec.readUInt32LE(8);
      const urlOff = rec.readUInt32LE(16);
      const nameOff = rec.readUInt32LE(20);
      const pathOff = rec.readUInt32LE(24);
      const valOff = rec.readUInt32LE(28);
      const expCocoa = rec.readDoubleLE(40);
      const domain = readCString(rec, urlOff);
      const name = readCString(rec, nameOff);
      const cpath = readCString(rec, pathOff) || "/";
      const value = readCString(rec, valOff);
      if (!domain || !name) continue;
      out.push({
        name,
        value,
        domain,
        path: cpath,
        expires: Number.isFinite(expCocoa) && expCocoa > 0 ? Math.round(expCocoa + COCOA_EPOCH_OFFSET_SEC) : -1,
        secure: Boolean(flags & 0x1),
        httpOnly: Boolean(flags & 0x4),
      });
    }
  }
  return out;
}

/** Serialize P0003 JSON cookie records into Apple `Cookies.binarycookies` format. */
function serializeBinaryCookies(cookies = []) {
  const valid = (Array.isArray(cookies) ? cookies : []).filter((c) => c && c.domain && c.name);
  // Deduplicate by domain + name + path (keeping the last entry) so Apple BinaryCookieStorage
  // never stores conflicting duplicate keys in a domain page.
  const dedupedMap = new Map();
  for (const c of valid) {
    dedupedMap.set(`${c.domain}\0${c.name}\0${c.path || "/"}`, c);
  }
  const nowCocoa = Date.now() / 1000 - COCOA_EPOCH_OFFSET_SEC;
  const encodeRecord = (c) => {
    const uBuf = Buffer.from(String(c.domain), "utf8");
    const nBuf = Buffer.from(String(c.name), "utf8");
    const pBuf = Buffer.from(String(c.path || "/"), "utf8");
    const vBuf = Buffer.from(String(c.value ?? ""), "utf8");
    const hdrSize = 56;
    const urlOff = hdrSize;
    const nameOff = urlOff + uBuf.length + 1;
    const pathOff = nameOff + nBuf.length + 1;
    const valOff = pathOff + pBuf.length + 1;
    const total = valOff + vBuf.length + 1;
    const rec = Buffer.alloc(total);
    let flags = 0;
    if (c.secure) flags |= 0x1;
    if (c.httpOnly) flags |= 0x4;
    rec.writeUInt32LE(total, 0);
    rec.writeUInt32LE(0, 4);
    rec.writeUInt32LE(flags, 8);
    rec.writeUInt32LE(0, 12);
    rec.writeUInt32LE(urlOff, 16);
    rec.writeUInt32LE(nameOff, 20);
    rec.writeUInt32LE(pathOff, 24);
    rec.writeUInt32LE(valOff, 28);
    // Offset 32..40 remains 0 (comment/port padding)
    const expUnix = Number(c.expires || c.expirationDate);
    const expCocoa = Number.isFinite(expUnix) && expUnix > 0 ? expUnix - COCOA_EPOCH_OFFSET_SEC : nowCocoa + 365 * 86400;
    rec.writeDoubleLE(expCocoa, 40);
    rec.writeDoubleLE(nowCocoa, 48);
    uBuf.copy(rec, urlOff);
    nBuf.copy(rec, nameOff);
    pBuf.copy(rec, pathOff);
    vBuf.copy(rec, valOff);
    return rec;
  };

  // Group into one page per unique domain sorted in ascending ASCII order; CFNetwork indexes
  // each page solely under its first cookie's domain on iOS 15+.
  const byDomain = new Map();
  for (const c of dedupedMap.values()) {
    const dom = String(c.domain);
    let bucket = byDomain.get(dom);
    if (!bucket) {
      bucket = [];
      byDomain.set(dom, bucket);
    }
    bucket.push(encodeRecord(c));
  }
  const sortedDomains = Array.from(byDomain.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const pageChunks = sortedDomains.length > 0 ? sortedDomains.map((dom) => byDomain.get(dom)) : [[]];

  const pages = pageChunks.map((chunk) => {
    const tblHeaderSize = 8 + chunk.length * 4 + 4;
    let curOff = tblHeaderSize;
    const offsets = chunk.map((r) => {
      const o = curOff;
      curOff += r.length;
      return o;
    });
    const pg = Buffer.alloc(curOff);
    pg.writeUInt32BE(0x00000100, 0);
    pg.writeUInt32LE(chunk.length, 4);
    offsets.forEach((o, idx) => pg.writeUInt32LE(o, 8 + idx * 4));
    chunk.forEach((r, idx) => r.copy(pg, offsets[idx]));
    return pg;
  });

  const fileHdr = Buffer.alloc(8 + pages.length * 4);
  fileHdr.write("cook", 0, "ascii");
  fileHdr.writeUInt32BE(pages.length, 4);
  pages.forEach((pg, idx) => fileHdr.writeUInt32BE(pg.length, 8 + idx * 4));

  // iOS 15+ NSHTTPCookieStorage validates the 4-byte UInt32BE sum of page[0, 4, 8, ...]
  // and renames files with a mismatch/zero checksum to `Cookies.binarycookies - corrupt`.
  let checksumSum = 0;
  for (const pg of pages) {
    for (let i = 0; i < pg.length; i += 4) {
      checksumSum = (checksumSum + pg[i]) >>> 0;
    }
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(checksumSum, 0);
  return Buffer.concat([fileHdr, ...pages, checksum, BINARY_COOKIES_BPLIST_TRAILER]);
}

function buildShadowrocketProxyUrl(proxyStr, label = "P0003") {
  const raw = String(proxyStr || "").trim();
  if (!raw || raw.toLowerCase() === "direct") return "";
  try {
    let normalized = raw;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
      const parts = normalized.split(":");
      if (parts.length >= 4 && parts[2] && parts[3]) {
        normalized = `socks://${encodeURIComponent(parts[2])}:${encodeURIComponent(parts[3])}@${parts[0]}:${parts[1]}`;
      } else if (parts.length >= 2 && parts[0] && parts[1]) {
        normalized = `http://${parts[0]}:${parts[1]}`;
      } else {
        normalized = `http://${normalized}`;
      }
    }
    const u = new URL(normalized);
    const proto = u.protocol.replace(":", "").toLowerCase();
    const scheme = proto.startsWith("socks") ? "socks" : "http";
    const user = u.username ? decodeURIComponent(u.username) : "";
    const pass = u.password ? decodeURIComponent(u.password) : "";
    const creds = user ? `${user}:${pass}` : "";
    const hostPort = `${u.hostname}:${u.port || (scheme === "socks" ? "1080" : "8080")}`;
    // Shadowrocket decodes base64 once (`user:pass@host:port` or `host:port`); avoid double-base64 on creds
    const target = creds ? `${creds}@${hostPort}` : hostPort;
    const b64 = Buffer.from(target, "utf8").toString("base64");
    return `shadowrocket://add/${scheme}://${b64}?remarks=${encodeURIComponent(label)}`;
  } catch {
    return "";
  }
}

const _iosLanRelays = new Map();

function resolvePrimaryLanIpv4() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!Array.isArray(addrs)) continue;
    if (/vethernet|wsl|docker|hyper-v|tailscale|wireguard|loopback|vbox|vmware/i.test(name)) continue;
    for (const info of addrs) {
      if (!info || info.family !== "IPv4" || info.internal) continue;
      const ip = String(info.address || "");
      if (/^(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(ip)) {
        candidates.push({ ip, rank: /ethernet|eth|lan|wi-fi|wlan/i.test(name) ? 0 : 1 });
      }
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.ip || "127.0.0.1";
}

function parseUpstreamProxyParts(proxyStr) {
  const raw = String(proxyStr || "").trim();
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    const parts = raw.split(":");
    if (parts.length >= 4 && parts[2] && parts[3]) {
      return { host: parts[0], port: Number(parts[1]), user: parts[2], pass: parts[3] };
    }
    if (parts.length >= 2) {
      return { host: parts[0], port: Number(parts[1]), user: "", pass: "" };
    }
  }
  try {
    const u = new URL(raw);
    return {
      host: u.hostname,
      port: Number(u.port || 8080),
      user: decodeURIComponent(u.username || ""),
      pass: decodeURIComponent(u.password || ""),
    };
  } catch {
    return null;
  }
}

async function ensureIosLanProxyRelay(proxyStr, { rotate = false, lanIp = "" } = {}) {
  const raw = String(proxyStr || "").trim();
  if (!raw || raw.toLowerCase() === "direct") return { ok: true, lanProxyUrl: raw, skipped: true };

  if (/^mobile(?:5g|4g)?:\/\//i.test(raw)) {
    const deviceSpec = raw.replace(/^mobile(?:5g|4g)?:\/\//i, "").trim() || "auto";
    const poolPath = [
      path.resolve(__dirname, "..", "..", "..", "scripts", "lib", "vpn-proxy-pool.mjs"),
      "E:\\Dev\\Tool\\scripts\\lib\\vpn-proxy-pool.mjs",
    ].find((p) => fs.existsSync(p));
    if (poolPath) {
      try {
        const poolMod = await import(pathToFileURL(poolPath).href);
        if (typeof poolMod.acquireMobile5gProxy === "function") {
          const acq = await poolMod.acquireMobile5gProxy({
            deviceSpec,
            rotate: Boolean(rotate),
            exposeLan: true,
            lanIp: lanIp || undefined,
          });
          if (acq?.ok && (acq.lanProxyUrl || acq.proxyRaw)) {
            return {
              ok: true,
              lanProxyUrl: acq.lanProxyUrl || acq.proxyRaw,
              deviceId: acq.deviceId || deviceSpec,
              carrier: acq.carrier || "Viettel",
              exitIp: acq.exitIp || null,
            };
          }
        }
      } catch {
        /* fallback below */
      }
    }
    return { ok: false, reason: "mobile5g_pool_unavailable" };
  }

  // Relay Android Wi-Fi GOST proxies (192.168.x.x:31080/31081) through PC Ethernet so Wi-Fi AP Isolation never blocks iPhone
  const parsed = parseUpstreamProxyParts(raw);
  if (!parsed || !parsed.host || !Number.isFinite(parsed.port)) {
    return { ok: true, lanProxyUrl: raw, skipped: true };
  }
  const needsRelay = /^(?:192\.168\.0\.(?:120|208)|127\.0\.0\.1)$/i.test(parsed.host) && (parsed.port === 31080 || parsed.port === 31081 || parsed.host === "127.0.0.1");
  if (!needsRelay) return { ok: true, lanProxyUrl: raw, skipped: true };

  const relayKey = `${parsed.host}:${parsed.port}:${parsed.user}`;
  const existing = _iosLanRelays.get(relayKey);
  if (existing && existing.server?.listening) {
    return { ok: true, lanProxyUrl: existing.lanProxyUrl, relayPort: existing.port, reused: true };
  }

  const authHeader = parsed.user ? `Basic ${Buffer.from(`${parsed.user}:${parsed.pass}`, "utf8").toString("base64")}` : "";
  const server = http.createServer((clientReq, clientRes) => {
    const proxyReq = http.request(
      {
        host: parsed.host,
        port: parsed.port,
        method: clientReq.method,
        path: clientReq.url,
        headers: { ...clientReq.headers, ...(authHeader ? { "Proxy-Authorization": authHeader } : {}) },
      },
      (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(clientRes);
      },
    );
    proxyReq.on("error", () => {
      if (!clientRes.headersSent) clientRes.writeHead(502);
      clientRes.end();
    });
    clientReq.pipe(proxyReq);
  });

  server.on("connect", (req, clientSocket, head) => {
    const upstreamSocket = net.connect(parsed.port, parsed.host, () => {
      const hdrs = [
        `CONNECT ${req.url} HTTP/1.1`,
        `Host: ${req.url}`,
        ...(authHeader ? [`Proxy-Authorization: ${authHeader}`] : []),
        "Connection: keep-alive",
        "",
        "",
      ];
      upstreamSocket.write(hdrs.join("\r\n"));
    });
    let handshaked = false;
    upstreamSocket.on("data", (chunk) => {
      if (handshaked) return;
      handshaked = true;
      const headText = chunk.toString("utf8");
      if (headText.includes(" 200 ")) {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        const sep = chunk.indexOf("\r\n\r\n");
        if (sep >= 0 && sep + 4 < chunk.length) clientSocket.write(chunk.subarray(sep + 4));
        if (head && head.length) upstreamSocket.write(head);
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
      } else {
        clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        clientSocket.destroy();
        upstreamSocket.destroy();
      }
    });
    upstreamSocket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstreamSocket.destroy());
  });

  const port = await new Promise((resolve, reject) => {
    server.listen(0, "0.0.0.0", () => {
      server.unref();
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
    server.on("error", reject);
  });
  const effectiveLanIp = String(lanIp || resolvePrimaryLanIpv4());
  const lanProxyUrl = `http://${effectiveLanIp}:${port}`;
  _iosLanRelays.set(relayKey, { server, port, lanProxyUrl });
  return { ok: true, lanProxyUrl, relayPort: port, upstream: `${parsed.host}:${parsed.port}` };
}

async function cleanupShadowrocketServers({
  mcpUrl = "",
  prefix = "P0003-",
  keepRemarks = [],
  maxPasses = 30,
  fetchFn = fetch,
} = {}) {
  if (!mcpUrl) return { ok: false, reason: "missing_mcp_url", deleted: 0 };
  const keepSet = new Set((Array.isArray(keepRemarks) ? keepRemarks : [keepRemarks]).map((s) => String(s || "").trim()).filter(Boolean));
  const shouldDeleteRowText = (txt) => {
    const t = String(txt || "");
    if (!t.includes(prefix)) return false;
    for (const k of keepSet) {
      if (t.includes(k)) return false;
    }
    return /HTTP|Socks5|Shadowsocks|VMess|VLESS|Trojan/i.test(t) || t.includes(prefix);
  };

  await callIosMcpTool(mcpUrl, "open_url", { url: "shadowrocket://" }, { fetchFn, timeoutMs: 2500 });
  await new Promise((r) => setTimeout(r, 900));

  let deleted = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const uiRes = await callIosMcpTool(mcpUrl, "get_ui_elements", { visible_only: true, limit: 80 }, { fetchFn, timeoutMs: 2000 });
    const els = parseMcpTextJson(uiRes)?.elements || [];

    const okPopup = els.find((e) => /^(OK|Đóng)$/i.test(String(e?.text || "").trim()) && e?.tap);
    if (okPopup) {
      await callIosMcpTool(mcpUrl, "tap_screen", okPopup.tap, { fetchFn, timeoutMs: 1800 });
      await new Promise((r) => setTimeout(r, 350));
      continue;
    }

    const delBtn = els.find((e) => /^(Xóa|Delete)$/i.test(String(e?.text || "").trim()) && e?.tap);
    if (delBtn) {
      await callIosMcpTool(mcpUrl, "tap_screen", delBtn.tap, { fetchFn, timeoutMs: 1800 });
      deleted += 1;
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    const activeMatching = els.find(
      (e) => /^Dùng Hệ phục vụ/i.test(String(e?.text || "")) && shouldDeleteRowText(e?.text),
    );
    const nonMatchingRow = els.find((e) => {
      const t = String(e?.text || "");
      const y = Number(e?.visible_rect?.y || 0);
      return y >= 250 && y <= 670 && /HTTP|Socks5|Shadowsocks|VMess|VLESS|Trojan/i.test(t) && !shouldDeleteRowText(t) && !t.startsWith("Dùng Hệ phục vụ");
    });
    if (activeMatching && nonMatchingRow?.tap) {
      await callIosMcpTool(mcpUrl, "tap_screen", nonMatchingRow.tap, { fetchFn, timeoutMs: 1800 });
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    const targetRow = els.find((e) => {
      const t = String(e?.text || "");
      const y = Number(e?.visible_rect?.y || 0);
      return y >= 250 && y <= 670 && !t.startsWith("Dùng Hệ phục vụ") && shouldDeleteRowText(t) && e?.tap;
    });
    if (targetRow?.visible_rect) {
      const cy = Math.round(targetRow.visible_rect.y + targetRow.visible_rect.height / 2);
      await callIosMcpTool(
        mcpUrl,
        "swipe_screen",
        { fromX: 350, fromY: cy, toX: 80, toY: cy, duration: 280, steps: 14 },
        { fetchFn, timeoutMs: 2200 },
      );
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    break;
  }

  return { ok: true, deleted, prefix };
}

async function applyShadowrocketProxy(
  proxyStr,
  profileCode,
  { mcpUrl = "", rotate = false, bypassLanRelay = false, lanIp = "", cleanupStale = false, fetchFn = fetch } = {},
) {
  if (!mcpUrl) return { ok: false, skipped: true };
  const raw = String(proxyStr || "").trim();
  if (!raw) return { ok: true, skipped: true };
  if (raw.toLowerCase() === "direct") {
    await callIosMcpTool(mcpUrl, "open_url", { url: "shadowrocket://disconnect" }, { fetchFn, timeoutMs: 2500 });
    return { ok: true, mode: "disconnect" };
  }
  const relayRes = bypassLanRelay ? { ok: true, lanProxyUrl: raw } : await ensureIosLanProxyRelay(raw, { rotate, lanIp });
  if (!relayRes?.ok || !relayRes?.lanProxyUrl) {
    return { ok: false, reason: relayRes?.reason || "lan_proxy_relay_failed" };
  }
  const effectiveProxy = relayRes.lanProxyUrl;
  let proxyTag = effectiveProxy !== raw ? (String(effectiveProxy).match(/:(\d+)/)?.[1] || "") : "";
  if (!proxyTag) {
    try {
      const parsedUrl = new URL(effectiveProxy.includes("://") ? effectiveProxy : `http://${effectiveProxy}`);
      const hostSeg = String(parsedUrl.hostname || "").split(".").pop() || "";
      if (parsedUrl.port) proxyTag = hostSeg ? `${hostSeg}-${parsedUrl.port}` : parsedUrl.port;
    } catch {
      const m = String(effectiveProxy || "").match(/:(\d+)/);
      if (m?.[1]) proxyTag = m[1];
    }
  }
  const remarks = proxyTag ? `P0003-${profileCode}-${proxyTag}` : `P0003-${profileCode}`;
  const addUrl = buildShadowrocketProxyUrl(effectiveProxy, remarks);
  if (!addUrl) return { ok: false, reason: "invalid_proxy_url" };
  await callIosMcpTool(mcpUrl, "open_url", { url: addUrl }, { fetchFn, timeoutMs: 3000 });
  // Wait for Shadowrocket's "Sự thành công" HUD toast to clear before tapping the imported node row
  let matchingRow = null;
  for (const waitMs of [1800, 900]) {
    await new Promise((r) => setTimeout(r, waitMs));
    const uiRes = await callIosMcpTool(mcpUrl, "get_ui_elements", { visible_only: true, limit: 50 }, { fetchFn, timeoutMs: 2000 });
    const uiJson = parseMcpTextJson(uiRes);
    const els = Array.isArray(uiJson?.elements) ? uiJson.elements : [];
    matchingRow =
      els.find((e) => typeof e?.text === "string" && e.text.includes(remarks) && !e.text.includes("Dùng Hệ phục vụ") && e?.tap) ||
      null;
    if (matchingRow?.tap) break;
  }
  if (matchingRow?.tap) {
    await callIosMcpTool(mcpUrl, "tap_screen", matchingRow.tap, { fetchFn, timeoutMs: 2000 });
    await new Promise((r) => setTimeout(r, 350));
  }
  if (cleanupStale) {
    await cleanupShadowrocketServers({
      mcpUrl,
      prefix: `P0003-${profileCode}`,
      keepRemarks: [remarks],
      maxPasses: 8,
      fetchFn,
    }).catch(() => undefined);
  }
  await callIosMcpTool(mcpUrl, "open_url", { url: "shadowrocket://connect" }, { fetchFn, timeoutMs: 3000 });
  let vpnPermissionApproved = false;
  if (fetchFn === fetch) {
    await new Promise((r) => setTimeout(r, 900));
    const vpnUi = await callIosMcpTool(mcpUrl, "get_ui_elements", { visible_only: true, limit: 35 }, { fetchFn, timeoutMs: 1800 });
    const vpnEls = Array.isArray(parseMcpTextJson(vpnUi)?.elements) ? parseMcpTextJson(vpnUi).elements : [];
    const joinedVpn = vpnEls.map((e) => String(e?.text || "")).join(" ");
    if (/vpn|shadowrocket/i.test(joinedVpn)) {
      const allowBtn = vpnEls.find((e) => /^(Allow|Cho phép)$/i.test(String(e?.text || "").trim()) && e?.tap);
      if (allowBtn?.tap) {
        await callIosMcpTool(mcpUrl, "tap_screen", allowBtn.tap, { fetchFn, timeoutMs: 1800 });
        vpnPermissionApproved = true;
        await new Promise((r) => setTimeout(r, 700));
      }
    }
  }
  return {
    ok: true,
    mode: "connect",
    remarks,
    selectedRow: Boolean(matchingRow),
    vpnPermissionApproved,
    effectiveProxy,
    exitIp: relayRes.exitIp || null,
  };
}

async function switchCraneLiteContainer(
  containerName,
  { mcpUrl = "", appLabel = "Facebook", fetchFn = fetch } = {},
) {
  if (!mcpUrl || !containerName) return { ok: false, reason: "missing_mcp_or_container" };
  await callIosMcpTool(mcpUrl, "press_home", {}, { fetchFn, timeoutMs: 2500 });
  await new Promise((r) => setTimeout(r, 900));
  const homeRes = await callIosMcpTool(mcpUrl, "get_ui_elements", { visible_only: true, limit: 45 }, { fetchFn, timeoutMs: 2500 });
  const homeEls = parseMcpTextJson(homeRes)?.elements || [];
  const appIcon = homeEls.find((e) => (e?.text || "").trim() === appLabel && e?.tap);
  if (!appIcon) return { ok: false, reason: "app_icon_not_found_on_home", appLabel };
  await callIosMcpTool(mcpUrl, "long_press", { x: appIcon.tap.x, y: appIcon.tap.y, duration: 900 }, { fetchFn, timeoutMs: 3000 });
  await new Promise((r) => setTimeout(r, 900));
  const menuRes = await callIosMcpTool(mcpUrl, "get_ui_elements", { visible_only: true, limit: 35 }, { fetchFn, timeoutMs: 2500 });
  const menuEls = parseMcpTextJson(menuRes)?.elements || [];
  const containerBtn = menuEls.find((e) => /vùng chứa|container/i.test(e?.text || "") && e?.tap);
  if (!containerBtn) return { ok: false, reason: "crane_container_menu_missing" };
  await callIosMcpTool(mcpUrl, "tap_screen", containerBtn.tap, { fetchFn, timeoutMs: 2500 });
  await new Promise((r) => setTimeout(r, 900));
  const listRes = await callIosMcpTool(mcpUrl, "get_ui_elements", { visible_only: true, limit: 40 }, { fetchFn, timeoutMs: 2500 });
  const listEls = parseMcpTextJson(listRes)?.elements || [];
  const targetBtn = listEls.find((e) => (e?.text || "").trim() === containerName && e?.tap);
  if (!targetBtn) return { ok: false, reason: "crane_container_not_found", containerName };
  await callIosMcpTool(mcpUrl, "tap_screen", targetBtn.tap, { fetchFn, timeoutMs: 2500 });
  return { ok: true, containerName, appLabel };
}

async function switchIosDeviceProfile(
  profileCode,
  {
    serial = "",
    proxy = "",
    clearPackages = false,
    restoreIfAvailable = true,
    vaultRoot = resolveMobileVaultRoot(),
    mcpUrl = "",
    wdaUrl = DEFAULT_WDA_URL,
    sshPort,
    sshHost,
    sshUser,
    execFileFn = execFileAsync,
    fetchFn = fetch,
    portProbeFn = checkTcpPortOpen,
  } = {},
) {
  const prevCode = readActiveIosProfileCode(vaultRoot);
  const cleanCode = writeActiveIosProfileCode(profileCode, { vaultRoot, udid: serial || _iosCache.activeSerial, proxy });
  const containerId = `profile_${cleanCode}`;
  const metaPath = path.join(vaultRoot, "ios", `${cleanCode}.meta.json`);
  const prevMeta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
  const meta = {
    ...prevMeta,
    profileCode: cleanCode,
    platform: "iOS",
    craneContainerId: containerId,
    proxy: String(proxy || ""),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

  const tx = resolveTransportConfig({ serial, mcpUrl, wdaUrl, sshHost, sshPort, sshUser });
  const health = await probeIosEndpointHealth({
    serial,
    mcpUrl: tx.mcpUrl,
    wdaUrl: tx.wdaUrl,
    sshHost: tx.sshHost,
    sshPort: tx.sshPort,
    fetchFn,
    portProbeFn,
  });
  if (!health.sshOnline) {
    return {
      ok: false,
      reason: "ios_ssh_not_ready_install_openssh",
      profileCode: cleanCode,
      containerId,
      metaPath,
      iosMcpOnline: health.iosMcpOnline,
      iosWdaOnline: health.wdaOnline,
      iosSshOnline: false,
    };
  }

  let craneSwitched = false;
  let craneOutput = "";
  let safariContainer = "";
  try {
    safariContainer = await resolveSafariContainerPath({
      serial,
      sshPort: tx.sshPort,
      sshHost: tx.sshHost,
      sshUser: tx.sshUser,
      vaultRoot,
      execFileFn,
    });
    const vaultBase = "/var/jb/var/mobile/p0003-vaults";
    const safariRel = safariContainer || "/var/mobile/Containers/Data/Application/$(ls -t /var/mobile/Containers/Data/Application | head -n1)";
    const cmdParts = [
      'export PATH="/var/jb/usr/bin:/var/jb/bin:/usr/bin:/bin"',
      `mkdir -p ${vaultBase}/${cleanCode} ${vaultBase}/${prevCode}`,
      "killall -9 MobileSafari com.apple.WebKit.WebContent com.apple.WebKit.Networking 2>/dev/null || true",
      // Save previous profile Safari state before switching (or initialize current profile snapshot when staying on same code)
      safariContainer
        ? `tar -cf - -C "${safariContainer}" Library/Cookies Library/WebKit/WebsiteData Library/Safari 2>/dev/null | gzip > ${vaultBase}/${prevCode}/safari.tar.gz || true`
        : "",
      // Restore target container or reset clean if new / clearPackages requested (preserve when re-selecting same code unless clearPackages)
      !clearPackages && safariContainer && prevCode !== cleanCode
        ? `if [ -s ${vaultBase}/${cleanCode}/safari.tar.gz ]; then rm -rf "${safariContainer}/Library/Cookies/Cookies.binarycookies" "${safariContainer}/Library/WebKit/WebsiteData"; gzip -dc ${vaultBase}/${cleanCode}/safari.tar.gz | tar -xf - -C "${safariContainer}"; else rm -rf "${safariContainer}/Library/Cookies/Cookies.binarycookies" "${safariContainer}/Library/WebKit/WebsiteData"; fi`
        : clearPackages && safariContainer
          ? `rm -rf "${safariContainer}/Library/Cookies/Cookies.binarycookies" "${safariContainer}/Library/WebKit/WebsiteData"`
          : "",
      `echo "${cleanCode}" > ${vaultBase}/.active-profile`,
      // Also run Crane CLI if present (`profile_${cleanCode}` marker preserved)
      `if command -v crane >/dev/null 2>&1; then crane -s com.apple.mobilesafari -c ${containerId} 2>&1 || true; fi`,
      `echo "switched:${containerId}"`,
      safariRel ? "true" : "true",
    ].filter(Boolean);

    const out = await runIosSshCommand(cmdParts.join("; "), {
      serial,
      sshPort: tx.sshPort,
      sshHost: tx.sshHost,
      sshUser: tx.sshUser,
      vaultRoot,
      execFileFn,
      timeout: 12_000,
    });
    craneOutput = String(out?.stdout || "").trim();
    craneSwitched = true;
  } catch (err) {
    return {
      ok: false,
      reason: err?.message || "ios_ssh_crane_failed",
      profileCode: cleanCode,
      containerId,
      iosMcpOnline: health.iosMcpOnline,
      iosWdaOnline: health.wdaOnline,
      iosSshOnline: true,
    };
  }

  if (restoreIfAvailable) {
    const snapTar = path.join(vaultRoot, "ios", `${cleanCode}.tar.gz`);
    if (fs.existsSync(snapTar)) {
      await restoreIosProfileSnapshot(cleanCode, {
        serial,
        vaultRoot,
        sshPort: tx.sshPort,
        sshHost: tx.sshHost,
        sshUser: tx.sshUser,
        execFileFn,
        portProbeFn,
      }).catch(() => undefined);
    }
  }

  let proxyResult = null;
  if (proxy && tx.mcpUrl) {
    proxyResult = await applyShadowrocketProxy(proxy, cleanCode, { mcpUrl: tx.mcpUrl, fetchFn }).catch(() => null);
  }

  return {
    ok: true,
    platform: "ios",
    profileCode: cleanCode,
    containerId,
    safariContainer,
    craneSwitched,
    craneOutput,
    proxyResult,
    iosMcpOnline: health.iosMcpOnline,
    iosWdaOnline: health.wdaOnline,
    iosSshOnline: true,
    metaPath,
  };
}

const CRANE_LITE_PLIST_PATH = "/var/jb/var/mobile/Library/Preferences/com.opa334.craneliteprefs.plist";

function parseCraneLiteContainersFromXml(xmlText) {
  const xml = String(xmlText || "");
  const containerBlock = xml.match(/<key>Containers<\/key>\s*<array>([\s\S]*?)<\/array>/i);
  if (!containerBlock) return [];
  const entries = [];
  const dictMatches = containerBlock[1].matchAll(/<dict>([\s\S]*?)<\/dict>/gi);
  for (const m of dictMatches) {
    const body = m[1];
    const readStr = (k) => {
      const rm = body.match(new RegExp(`<key>${k}<\\/key>\\s*<string>([^<]*)<\\/string>`, "i"));
      return rm ? rm[1].trim() : "";
    };
    const identifier = readStr("identifier");
    const name = readStr("name");
    const customDeviceIdentifier = readStr("customDeviceIdentifier");
    if (identifier && identifier !== "DEFAULT") {
      entries.push({ identifier, name, customDeviceIdentifier });
    }
  }
  return entries;
}

function inferProfileCodeFromCraneName(name, fallbackCode = "") {
  const raw = String(name || "").trim();
  const fbMatch = /^P0003_FB_(\d+)$/i.exec(raw) || /^profile_(\d+)$/i.exec(raw);
  if (fbMatch) return fbMatch[1].padStart(4, "0");
  return fallbackCode ? String(fallbackCode).replace(/\D/g, "").padStart(4, "0") : "";
}

async function resolveIosCraneProfilesMap({
  vaultRoot = resolveMobileVaultRoot(),
  iosDevices = [],
  sshOnline = undefined,
  cacheMs = 6000,
  serial = "",
  sshPort,
  sshHost,
  sshUser,
  execFileFn = execFileAsync,
  portProbeFn = checkTcpPortOpen,
} = {}) {
  const now = Date.now();
  if (cacheMs > 0 && _iosCache.craneMap && now - _iosCache.craneMapAt < cacheMs) {
    return _iosCache.craneMap;
  }

  const map = new Map();
  const iosDir = path.join(vaultRoot, "ios");
  const craneDir = path.join(iosDir, "crane");

  // 1. Read local offloaded .crane.tar.gz archives + ios/*.meta.json manifests
  const archiveBytesByCode = new Map();
  try {
    if (fs.existsSync(craneDir)) {
      for (const f of fs.readdirSync(craneDir)) {
        const m = /^(\d{4})\.crane\.tar\.gz$/i.exec(f);
        if (!m) continue;
        try {
          archiveBytesByCode.set(m[1], fs.statSync(path.join(craneDir, f)).size);
        } catch {
          /* ignore stat error */
        }
      }
    }
  } catch {
    /* ignore missing dir */
  }

  try {
    if (fs.existsSync(iosDir)) {
      for (const f of fs.readdirSync(iosDir)) {
        const m = /^(\d{4})\.meta\.json$/i.exec(f);
        if (!m) continue;
        const code = m[1];
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(iosDir, f), "utf8"));
          if (meta?.craneContainerName || meta?.craneContainerUuid || archiveBytesByCode.has(code)) {
            const bytes = archiveBytesByCode.get(code) || Number(meta?.craneArchiveBytes || 0);
            const offloaded = Boolean(meta?.craneOffloaded);
            map.set(code, {
              containerName: meta?.craneContainerName || `P0003_FB_${code.slice(-2)}`,
              containerUuid: meta?.craneContainerUuid || "",
              state: offloaded ? "offloaded" : "on-device",
              activeOnDevice: false,
              onDevice: !offloaded,
              offloaded,
              archiveBytes: bytes,
            });
          }
        } catch {
          /* ignore invalid json */
        }
      }
    }
  } catch {
    /* ignore missing dir */
  }

  for (const [code, bytes] of archiveBytesByCode.entries()) {
    if (!map.has(code)) {
      map.set(code, {
        containerName: `P0003_FB_${Number.parseInt(code, 10) < 100 ? String(Number.parseInt(code, 10)).padStart(2, "0") : code}`,
        containerUuid: "",
        state: "offloaded",
        activeOnDevice: false,
        onDevice: false,
        offloaded: true,
        archiveBytes: bytes,
      });
    }
  }

  // 2. If SSH is online on live iPhone, inspect live Crane Lite plist & unpacked UUID folders
  const targetSerial = serial || iosDevices[0]?.serial || "";
  const tx = resolveTransportConfig({ serial: targetSerial, sshPort, sshHost, sshUser });
  const canProbeSsh =
    sshOnline !== undefined ? Boolean(sshOnline) : await portProbeFn(tx.sshPort, tx.sshHost).catch(() => false);
  if (canProbeSsh) {
    try {
      const cmd = [
        `cp "${CRANE_LITE_PLIST_PATH}" /tmp/p0003_crane_map.plist 2>/dev/null`,
        `plutil -convert xml1 /tmp/p0003_crane_map.plist >/dev/null 2>&1`,
        `cat /tmp/p0003_crane_map.plist 2>/dev/null`,
        `echo "===CRANE_DISK==="`,
        `ls -1d /var/mobile/Containers/Data/Application/*/Library/___Crane_Containers/* 2>/dev/null || true`,
      ].join("; ");
      const out = await runIosSshCommand(cmd, {
        serial: targetSerial,
        sshPort: tx.sshPort,
        sshHost: tx.sshHost,
        sshUser: tx.sshUser,
        vaultRoot,
        execFileFn,
        timeout: 6500,
      });
      const rawStdout = String(out?.stdout || "");
      const [xmlPart, diskPart = ""] = rawStdout.split("===CRANE_DISK===");
      const containers = parseCraneLiteContainersFromXml(xmlPart);
      const activeMatch = xmlPart.match(/<key>activeContainer<\/key>\s*<string>([^<]*)<\/string>/i);
      const activeUuid = activeMatch ? activeMatch[1].trim() : "";
      const diskUuids = new Set();
      for (const line of diskPart.split(/\r?\n/)) {
        const base = line.trim().split("/").pop();
        if (base && base !== "DEFAULT") diskUuids.add(base);
      }

      for (const entry of containers) {
        let code = inferProfileCodeFromCraneName(entry.name);
        if (!code) {
          for (const [k, v] of map.entries()) {
            if (v.containerUuid === entry.identifier || v.containerName === entry.name) {
              code = k;
              break;
            }
          }
        }
        if (!code) continue;
        const onDevice = diskUuids.has(entry.identifier);
        const activeOnDevice = onDevice && activeUuid === entry.identifier;
        const archiveBytes = archiveBytesByCode.get(code) || map.get(code)?.archiveBytes || 0;
        const state = activeOnDevice
          ? "active"
          : onDevice
            ? "on-device"
            : archiveBytes > 0
              ? "offloaded"
              : "uninitialized";
        map.set(code, {
          containerName: entry.name || map.get(code)?.containerName || "",
          containerUuid: entry.identifier,
          state,
          activeOnDevice,
          onDevice,
          offloaded: !onDevice && archiveBytes > 0,
          archiveBytes,
        });
      }
    } catch {
      /* retain local archive fallback map when SSH times out */
    }
  }

  _iosCache.craneMap = map;
  _iosCache.craneMapAt = now;
  return map;
}

function resolveCraneTargetMatch(containers, profileCode, requestedName = "") {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const num = Number.parseInt(cleanCode, 10);
  const candidates = [
    String(requestedName || "").trim(),
    Number.isFinite(num) ? `P0003_FB_${String(num).padStart(2, "0")}` : "",
    `P0003_FB_${cleanCode}`,
    `profile_${cleanCode}`,
    cleanCode,
  ].filter(Boolean);
  for (const cand of candidates) {
    const hit = containers.find((c) => c.name === cand || c.identifier === cand);
    if (hit) return hit;
  }
  return null;
}

async function offloadCraneLiteContainer(
  profileCode,
  {
    serial = "",
    containerName = "",
    bundleId = "com.facebook.Facebook",
    removeFromDevice = true,
    vaultRoot = resolveMobileVaultRoot(),
    sshPort,
    sshHost,
    sshUser,
    execFileFn = execFileAsync,
    portProbeFn = checkTcpPortOpen,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  if (_iosCache.devices.length === 0 && execFileFn === execFileAsync) {
    await listConnectedIosDevices({ execFileFn, vaultRoot }).catch(() => []);
  }
  const tx = resolveTransportConfig({ serial, sshPort, sshHost, sshUser });
  const sshOnline = await portProbeFn(tx.sshPort, tx.sshHost).catch(() => false);
  if (!sshOnline) {
    return { ok: false, reason: "ios_ssh_not_ready_install_openssh", profileCode: cleanCode };
  }
  const craneDir = path.join(vaultRoot, "ios", "crane");
  fs.mkdirSync(craneDir, { recursive: true });
  const localTar = path.join(craneDir, `${cleanCode}.crane.tar.gz`);
  const metaPath = path.join(vaultRoot, "ios", `${cleanCode}.meta.json`);
  const remoteTmp = `/var/mobile/Media/Downloads/p0003_crane_${cleanCode}.tar.gz`;
  try {
    const plistOut = await runIosSshCommand(
      `cp "${CRANE_LITE_PLIST_PATH}" /tmp/p0003_cranelite.plist && plutil -convert xml1 /tmp/p0003_cranelite.plist >/dev/null && cat /tmp/p0003_cranelite.plist`,
      { serial, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, vaultRoot, execFileFn, timeout: 8000 },
    );
    const containers = parseCraneLiteContainersFromXml(plistOut?.stdout || "");
    const metaPrev = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
    const target = resolveCraneTargetMatch(containers, cleanCode, containerName || metaPrev?.craneContainerName || metaPrev?.craneContainerUuid);
    if (!target) {
      return { ok: false, reason: "crane_container_not_found_in_plist", profileCode: cleanCode, requested: containerName || null };
    }
    const uuid = target.identifier;
    if (!/^[A-Za-z0-9-]{8,}$/.test(uuid)) {
      return { ok: false, reason: "invalid_crane_container_uuid", profileCode: cleanCode, uuid };
    }
    const tarCmd = [
      'export PATH="/var/jb/usr/bin:/var/jb/bin:/usr/bin:/bin"',
      "(killall -9 Facebook 2>/dev/null || true)",
      "mkdir -p /var/mobile/Media/Downloads",
      `(cd / && find var/mobile/Containers -maxdepth 7 -type d -name "${uuid}" -path "*/___Crane_Containers/*" 2>/dev/null > /tmp/p0003_crane_paths_${cleanCode}.txt)`,
      `[ -s /tmp/p0003_crane_paths_${cleanCode}.txt ] && tar -cf - -C / -T /tmp/p0003_crane_paths_${cleanCode}.txt | gzip > ${remoteTmp}`,
    ].join("; ");
    await runIosSshCommand(tarCmd, {
      serial,
      sshPort: tx.sshPort,
      sshHost: tx.sshHost,
      sshUser: tx.sshUser,
      vaultRoot,
      execFileFn,
      timeout: 25_000,
    });
    const scpArgs = buildSshBaseArgs({ isScp: true, sshPort: tx.sshPort, vaultRoot });
    scpArgs.push(`${tx.sshUser}@${tx.sshHost}:${remoteTmp}`, localTar);
    await execFileFn("scp", scpArgs, { timeout: 25_000 });
    const sizeBytes = fs.existsSync(localTar) ? fs.statSync(localTar).size : 0;
    if (sizeBytes === 0) {
      return { ok: false, reason: "crane_archive_empty", profileCode: cleanCode, containerUuid: uuid };
    }
    let removedFromDevice = false;
    if (removeFromDevice) {
      await runIosSshCommand(
        `while IFS= read -r rel; do [ -n "$rel" ] && rm -rf "/$rel"; done < /tmp/p0003_crane_paths_${cleanCode}.txt; rm -f ${remoteTmp} /tmp/p0003_crane_paths_${cleanCode}.txt`,
        { serial, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, vaultRoot, execFileFn, timeout: 12_000 },
      );
      removedFromDevice = true;
    } else {
      await runIosSshCommand(
        `rm -f ${remoteTmp} /tmp/p0003_crane_paths_${cleanCode}.txt`,
        { serial, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, vaultRoot, execFileFn, timeout: 6000 },
      ).catch(() => undefined);
    }
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          ...metaPrev,
          profileCode: cleanCode,
          platform: "iOS",
          craneBundleId: bundleId,
          craneContainerName: target.name,
          craneContainerUuid: uuid,
          craneArchivePath: localTar,
          craneArchiveBytes: sizeBytes,
          craneOffloaded: removedFromDevice,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
    return {
      ok: true,
      platform: "ios",
      profileCode: cleanCode,
      bundleId,
      containerName: target.name,
      containerUuid: uuid,
      archivePath: localTar,
      sizeBytes,
      removedFromDevice,
    };
  } catch (err) {
    return { ok: false, reason: err?.message || "ios_crane_offload_failed", profileCode: cleanCode };
  }
}

async function restoreCraneLiteContainer(
  profileCode,
  {
    serial = "",
    containerName = "",
    activate = true,
    vaultRoot = resolveMobileVaultRoot(),
    mcpUrl = "",
    sshPort,
    sshHost,
    sshUser,
    execFileFn = execFileAsync,
    fetchFn = fetch,
    portProbeFn = checkTcpPortOpen,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const localTar = path.join(vaultRoot, "ios", "crane", `${cleanCode}.crane.tar.gz`);
  if (!fs.existsSync(localTar)) {
    return { ok: false, reason: "crane_archive_not_found", profileCode: cleanCode, archivePath: localTar };
  }
  if (_iosCache.devices.length === 0 && execFileFn === execFileAsync) {
    await listConnectedIosDevices({ execFileFn, fetchFn, vaultRoot }).catch(() => []);
  }
  const tx = resolveTransportConfig({ serial, mcpUrl, sshPort, sshHost, sshUser });
  const sshOnline = await portProbeFn(tx.sshPort, tx.sshHost).catch(() => false);
  if (!sshOnline) {
    return { ok: false, reason: "ios_ssh_not_ready_install_openssh", profileCode: cleanCode };
  }
  const metaPath = path.join(vaultRoot, "ios", `${cleanCode}.meta.json`);
  const metaPrev = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
  const remoteTmp = `/var/mobile/Media/Downloads/p0003_crane_restore_${cleanCode}.tar.gz`;
  try {
    const scpArgs = buildSshBaseArgs({ isScp: true, sshPort: tx.sshPort, vaultRoot });
    scpArgs.push(localTar, `${tx.sshUser}@${tx.sshHost}:${remoteTmp}`);
    await execFileFn("scp", scpArgs, { timeout: 25_000 });
    await runIosSshCommand(
      `export PATH="/var/jb/usr/bin:/var/jb/bin:/usr/bin:/bin"; killall -9 Facebook 2>/dev/null || true; gzip -dc ${remoteTmp} | tar -xf - -C / && rm -f ${remoteTmp}`,
      { serial, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, vaultRoot, execFileFn, timeout: 25_000 },
    );
    const resolvedName = String(containerName || metaPrev?.craneContainerName || "").trim();
    let activated = false;
    if (activate && resolvedName && tx.mcpUrl) {
      const sw = await switchCraneLiteContainer(resolvedName, { mcpUrl: tx.mcpUrl, fetchFn }).catch(() => null);
      activated = Boolean(sw?.ok);
    }
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          ...metaPrev,
          profileCode: cleanCode,
          craneOffloaded: false,
          restoredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
    return {
      ok: true,
      platform: "ios",
      profileCode: cleanCode,
      containerName: resolvedName || null,
      archivePath: localTar,
      activated,
    };
  } catch (err) {
    return { ok: false, reason: err?.message || "ios_crane_restore_failed", profileCode: cleanCode };
  }
}

async function getIosStorageFreeBytes({
  serial = "",
  vaultRoot = resolveMobileVaultRoot(),
  sshPort,
  sshHost,
  sshUser,
  execFileFn = execFileAsync,
  portProbeFn = checkTcpPortOpen,
} = {}) {
  if (_iosCache.devices.length === 0 && execFileFn === execFileAsync) {
    await listConnectedIosDevices({ execFileFn, vaultRoot }).catch(() => []);
  }
  const tx = resolveTransportConfig({ serial, sshPort, sshHost, sshUser });
  const sshOnline = await portProbeFn(tx.sshPort, tx.sshHost).catch(() => false);
  if (!sshOnline) return { ok: false, reason: "ios_ssh_not_ready_install_openssh" };
  try {
    const out = await runIosSshCommand("df -k /private/var | tail -n 1", {
      serial,
      sshPort: tx.sshPort,
      sshHost: tx.sshHost,
      sshUser: tx.sshUser,
      vaultRoot,
      execFileFn,
      timeout: 6000,
    });
    const parts = String(out?.stdout || "").trim().split(/\s+/);
    const availKb = Number(parts[3]);
    if (!Number.isFinite(availKb) || availKb < 0) {
      return { ok: false, reason: "df_parse_failed", raw: out?.stdout || "" };
    }
    return {
      ok: true,
      freeKb: availKb,
      freeBytes: availKb * 1024,
      freeGb: Number((availKb / (1024 * 1024)).toFixed(2)),
    };
  } catch (err) {
    return { ok: false, reason: err?.message || "ios_df_failed" };
  }
}

async function mountCraneLiteProfile(
  profileCode,
  {
    serial = "",
    containerName = "",
    bundleId = "com.facebook.Facebook",
    minFreeGb = 10,
    maxOnDevice = 0,
    autoOffloadLru = true,
    activate = true,
    forceRestore = false,
    proxy = "",
    rotateProxy = false,
    vaultRoot = resolveMobileVaultRoot(),
    mcpUrl = "",
    sshPort,
    sshHost,
    sshUser,
    execFileFn = execFileAsync,
    fetchFn = fetch,
    portProbeFn = checkTcpPortOpen,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  if (_iosCache.devices.length === 0 && execFileFn === execFileAsync) {
    await listConnectedIosDevices({ execFileFn, fetchFn, vaultRoot }).catch(() => []);
  }
  const tx = resolveTransportConfig({ serial, mcpUrl, sshPort, sshHost, sshUser });
  const sshOnline = await portProbeFn(tx.sshPort, tx.sshHost).catch(() => false);
  if (!sshOnline) {
    return { ok: false, reason: "ios_ssh_not_ready_install_openssh", profileCode: cleanCode };
  }

  const plistOut = await runIosSshCommand(
    `cp "${CRANE_LITE_PLIST_PATH}" /tmp/p0003_cranelite.plist && plutil -convert xml1 /tmp/p0003_cranelite.plist >/dev/null && cat /tmp/p0003_cranelite.plist`,
    { serial, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, vaultRoot, execFileFn, timeout: 8000 },
  );
  const xmlText = String(plistOut?.stdout || "");
  const containers = parseCraneLiteContainersFromXml(xmlText);
  const activeMatch = xmlText.match(/<key>activeContainer<\/key>\s*<string>([^<]*)<\/string>/i);
  const activeUuid = activeMatch ? activeMatch[1].trim() : "";

  const metaPath = path.join(vaultRoot, "ios", `${cleanCode}.meta.json`);
  const metaPrev = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
  const target = resolveCraneTargetMatch(containers, cleanCode, containerName || metaPrev?.craneContainerName || metaPrev?.craneContainerUuid);
  const targetUuid = target?.identifier || "";
  const resolvedName = String(target?.name || containerName || metaPrev?.craneContainerName || "").trim();

  // Discover all currently unpacked Crane container UUIDs in Data/Application ordered oldest -> newest (LRU)
  const diskListOut = await runIosSshCommand(
    `ls -1dt /var/mobile/Containers/Data/Application/*/Library/___Crane_Containers/* 2>/dev/null || true`,
    { serial, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, vaultRoot, execFileFn, timeout: 6000 },
  );
  const newestFirstUuids = [];
  for (const line of String(diskListOut?.stdout || "").split(/\r?\n/)) {
    const base = line.trim().split("/").pop();
    if (base && base !== "DEFAULT" && !newestFirstUuids.includes(base)) {
      newestFirstUuids.push(base);
    }
  }
  const oldestFirstUuids = [...newestFirstUuids].reverse();
  let storageBefore = await getIosStorageFreeBytes({ serial, vaultRoot, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, execFileFn, portProbeFn });
  let curFreeGb = storageBefore.ok ? storageBefore.freeGb : minFreeGb;
  const freeGbBefore = storageBefore.ok ? storageBefore.freeGb : null;
  let onDiskCount = oldestFirstUuids.length;
  const offloadedContainers = [];

  if (autoOffloadLru) {
    const inferCodeForContainer = (c) => {
      const m = String(c?.name || "").match(/(\d+)$/);
      if (m) return m[1].padStart(4, "0");
      return "9999";
    };
    for (const candidateUuid of oldestFirstUuids) {
      const overCap = maxOnDevice > 0 && onDiskCount > maxOnDevice;
      const underMinFree = Number.isFinite(curFreeGb) && curFreeGb < minFreeGb;
      if (!overCap && !underMinFree) break;
      if (candidateUuid === targetUuid || candidateUuid === activeUuid) continue;
      const entry = containers.find((c) => c.identifier === candidateUuid);
      if (!entry) continue;
      const lruCode = inferCodeForContainer(entry);
      const offRes = await offloadCraneLiteContainer(lruCode, {
        serial,
        containerName: entry.name || candidateUuid,
        bundleId,
        removeFromDevice: true,
        vaultRoot,
        sshPort: tx.sshPort,
        sshHost: tx.sshHost,
        sshUser: tx.sshUser,
        execFileFn,
        portProbeFn,
      });
      if (offRes?.ok) {
        offloadedContainers.push({
          profileCode: lruCode,
          containerName: entry.name,
          containerUuid: candidateUuid,
          sizeBytes: offRes.sizeBytes,
        });
        onDiskCount = Math.max(0, onDiskCount - 1);
        const recheck = await getIosStorageFreeBytes({ serial, vaultRoot, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, execFileFn, portProbeFn });
        if (recheck.ok) curFreeGb = recheck.freeGb;
      }
    }
  }

  let restored = null;
  const localTar = path.join(vaultRoot, "ios", "crane", `${cleanCode}.crane.tar.gz`);
  const targetAlreadyOnDisk = targetUuid && newestFirstUuids.includes(targetUuid);
  if (fs.existsSync(localTar) && (!targetAlreadyOnDisk || forceRestore)) {
    restored = await restoreCraneLiteContainer(cleanCode, {
      serial,
      containerName: resolvedName,
      activate: false,
      vaultRoot,
      mcpUrl: tx.mcpUrl,
      sshPort: tx.sshPort,
      sshHost: tx.sshHost,
      sshUser: tx.sshUser,
      execFileFn,
      fetchFn,
      portProbeFn,
    });
  }

  let switched = null;
  if (activate && resolvedName && tx.mcpUrl) {
    switched = await switchCraneLiteContainer(resolvedName, { mcpUrl: tx.mcpUrl, fetchFn }).catch(() => null);
  }
  let proxyResult = null;
  if (proxy && tx.mcpUrl) {
    proxyResult = await applyShadowrocketProxy(proxy, cleanCode, { mcpUrl: tx.mcpUrl, rotate: rotateProxy, fetchFn }).catch(() => null);
  }
  const storageAfter = await getIosStorageFreeBytes({ serial, vaultRoot, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, execFileFn, portProbeFn });

  return {
    ok: true,
    platform: "ios",
    profileCode: cleanCode,
    containerName: resolvedName || null,
    containerUuid: targetUuid || null,
    freeGbBefore,
    freeGbAfter: storageAfter.ok ? storageAfter.freeGb : curFreeGb,
    offloadedContainers,
    restored,
    switched,
    proxyResult,
  };
}

async function backupIosProfileSnapshot(
  profileCode,
  {
    serial = "",
    vaultRoot = resolveMobileVaultRoot(),
    sshPort,
    sshHost,
    sshUser,
    execFileFn = execFileAsync,
    portProbeFn = checkTcpPortOpen,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  if (_iosCache.devices.length === 0 && execFileFn === execFileAsync) {
    await listConnectedIosDevices({ execFileFn, vaultRoot }).catch(() => []);
  }
  const tx = resolveTransportConfig({ serial, sshPort, sshHost, sshUser });
  const sshOnline = await portProbeFn(tx.sshPort, tx.sshHost).catch(() => false);
  if (!sshOnline) {
    return { ok: false, reason: "ios_ssh_not_ready_install_openssh", profileCode: cleanCode };
  }
  const iosDir = path.join(vaultRoot, "ios");
  fs.mkdirSync(iosDir, { recursive: true });
  const localTar = path.join(iosDir, `${cleanCode}.tar.gz`);
  const remoteTmp = `/var/mobile/Media/Downloads/p0003_ios_snap_${cleanCode}.tar.gz`;
  try {
    const safariContainer = await resolveSafariContainerPath({
      serial,
      sshPort: tx.sshPort,
      sshHost: tx.sshHost,
      sshUser: tx.sshUser,
      vaultRoot,
      execFileFn,
    });
    const tarCmd = safariContainer
      ? `mkdir -p /var/mobile/Media/Downloads && cd "${safariContainer}" && set -- && for d in Library/Cookies Library/WebKit/WebsiteData Library/Safari; do [ -e "$d" ] && set -- "$@" "$d"; done && [ $# -gt 0 ] && tar -cf - "$@" 2>/dev/null | gzip > ${remoteTmp}`
      : `mkdir -p /var/mobile/Media/Downloads && set -- && for d in /var/mobile/Library/Cookies /var/mobile/Library/Preferences/com.apple.mobilesafari.plist; do [ -e "$d" ] && set -- "$@" "$d"; done && [ $# -gt 0 ] && tar -cf - "$@" 2>/dev/null | gzip > ${remoteTmp}`;
    await runIosSshCommand(tarCmd, {
      serial,
      sshPort: tx.sshPort,
      sshHost: tx.sshHost,
      sshUser: tx.sshUser,
      vaultRoot,
      execFileFn,
      timeout: 15_000,
    });
    const scpArgs = buildSshBaseArgs({ isScp: true, sshPort: tx.sshPort, vaultRoot });
    scpArgs.push(`${tx.sshUser}@${tx.sshHost}:${remoteTmp}`, localTar);
    await execFileFn("scp", scpArgs, { timeout: 15_000 });
    await runIosSshCommand(`rm -f ${remoteTmp}`, {
      serial,
      sshPort: tx.sshPort,
      sshHost: tx.sshHost,
      sshUser: tx.sshUser,
      vaultRoot,
      execFileFn,
      timeout: 4000,
    }).catch(() => undefined);
    const sizeBytes = fs.existsSync(localTar) ? fs.statSync(localTar).size : 0;
    return { ok: true, platform: "ios", profileCode: cleanCode, archivePath: localTar, sizeBytes, safariContainer };
  } catch (err) {
    return { ok: false, reason: err?.message || "ios_backup_failed", profileCode: cleanCode };
  }
}

async function restoreIosProfileSnapshot(
  profileCode,
  {
    serial = "",
    vaultRoot = resolveMobileVaultRoot(),
    sshPort,
    sshHost,
    sshUser,
    execFileFn = execFileAsync,
    portProbeFn = checkTcpPortOpen,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const localTar = path.join(vaultRoot, "ios", `${cleanCode}.tar.gz`);
  if (!fs.existsSync(localTar)) {
    return { ok: false, reason: "ios_snapshot_not_found", profileCode: cleanCode, archivePath: localTar };
  }
  const tx = resolveTransportConfig({ serial, sshPort, sshHost, sshUser });
  const sshOnline = await portProbeFn(tx.sshPort, tx.sshHost).catch(() => false);
  if (!sshOnline) {
    return { ok: false, reason: "ios_ssh_not_ready_install_openssh", profileCode: cleanCode };
  }
  const remoteTmp = `/var/mobile/Media/Downloads/p0003_ios_restore_${cleanCode}.tar.gz`;
  try {
    const safariContainer = await resolveSafariContainerPath({
      serial,
      sshPort: tx.sshPort,
      sshHost: tx.sshHost,
      sshUser: tx.sshUser,
      vaultRoot,
      execFileFn,
    });
    const scpArgs = buildSshBaseArgs({ isScp: true, sshPort: tx.sshPort, vaultRoot });
    scpArgs.push(localTar, `${tx.sshUser}@${tx.sshHost}:${remoteTmp}`);
    await execFileFn("scp", scpArgs, { timeout: 15_000 });
    const targetDir = safariContainer || "/";
    await runIosSshCommand(
      `killall -9 MobileSafari com.apple.WebKit.Networking com.apple.WebKit.WebContent 2>/dev/null || true; gzip -dc ${remoteTmp} | tar -xf - -C "${targetDir}" && chown -R mobile:mobile "${targetDir}" 2>/dev/null; rm -f ${remoteTmp}`,
      {
        serial,
        sshPort: tx.sshPort,
        sshHost: tx.sshHost,
        sshUser: tx.sshUser,
        vaultRoot,
        execFileFn,
        timeout: 15_000,
      },
    );
    return { ok: true, platform: "ios", profileCode: cleanCode, archivePath: localTar, safariContainer };
  } catch (err) {
    return { ok: false, reason: err?.message || "ios_restore_failed", profileCode: cleanCode };
  }
}

async function launchIosScreenMirror(profileCode = "0001", opts = {}) {
  const devices = await listConnectedIosDevices(opts);
  if (devices.length === 0) {
    return { ok: false, reason: "no_ios_device_online" };
  }
  const requested = opts.serial ? devices.find((d) => d.serial === opts.serial || d.udid === stripIosSerialPrefix(opts.serial)) : null;
  const target = requested || devices.find((d) => d.serial === _iosCache.activeSerial) || devices[0];
  setActiveIosDeviceSerial(target.serial);
  const tunnels = target.mcpUrl ? { ok: true, started: [] } : await ensureIosUsbmuxTunnels({ udid: target.udid, ...opts });
  const health = await probeIosEndpointHealth({ ...opts, deviceInfo: target });
  const mode = health.iosMcpOnline
    ? "ios_mcp_wifi_mirror"
    : health.wdaOnline
      ? "wda_mjpeg_mirror"
      : "dvt_usbmux_mirror";
  return {
    ok: true,
    platform: "ios",
    mode,
    profileCode: String(profileCode || "0001").padStart(4, "0"),
    serial: target.serial,
    iosMcpOnline: health.iosMcpOnline,
    iosWdaOnline: health.wdaOnline,
    iosSshOnline: health.sshOnline,
    tunnels,
  };
}

async function extractIosCookiesToBrowserProfile(
  profileCode,
  {
    serial = "",
    vaultRoot = resolveMobileVaultRoot(),
    sshPort,
    sshHost,
    sshUser,
    execFileFn = execFileAsync,
    portProbeFn = checkTcpPortOpen,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  if (_iosCache.devices.length === 0 && execFileFn === execFileAsync) {
    await listConnectedIosDevices({ execFileFn, vaultRoot }).catch(() => []);
  }
  const tx = resolveTransportConfig({ serial, sshPort, sshHost, sshUser });
  const sshOnline = await portProbeFn(tx.sshPort, tx.sshHost).catch(() => false);
  if (!sshOnline) {
    return { ok: false, reason: "ios_ssh_not_ready_install_openssh", profileCode: cleanCode, cookiesCount: 0 };
  }
  const cookiesDir = path.join(vaultRoot, "cookies", cleanCode);
  fs.mkdirSync(cookiesDir, { recursive: true });
  const localBin = path.join(cookiesDir, "Cookies.binarycookies");
  const safariContainer = await resolveSafariContainerPath({
    serial,
    sshPort: tx.sshPort,
    sshHost: tx.sshHost,
    sshUser: tx.sshUser,
    vaultRoot,
    execFileFn,
  });
  const remoteBin = safariContainer
    ? `${safariContainer}/Library/Cookies/Cookies.binarycookies`
    : "/var/mobile/Library/Cookies/Cookies.binarycookies";
  try {
    const scpArgs = buildSshBaseArgs({ isScp: true, sshPort: tx.sshPort, vaultRoot });
    scpArgs.push(`${tx.sshUser}@${tx.sshHost}:${remoteBin}`, localBin);
    await execFileFn("scp", scpArgs, { timeout: 12_000 });
    const buf = fs.existsSync(localBin) ? fs.readFileSync(localBin) : Buffer.alloc(0);
    const parsedCookies = parseBinaryCookies(buf);
    if (parsedCookies.length > 0) {
      fs.writeFileSync(path.join(cookiesDir, "cookies.json"), JSON.stringify(parsedCookies, null, 2), "utf8");
    }
    const cUser = parsedCookies.find((c) => c.domain.includes("facebook.com") && c.name === "c_user")?.value || null;
    const cookiesCount = parsedCookies.length > 0 ? parsedCookies.length : buf.length > 0 ? 1 : 0;
    return {
      ok: true,
      platform: "ios",
      profileCode: cleanCode,
      binaryCookiesPath: localBin,
      sizeBytes: buf.length,
      cookiesCount,
      c_user: cUser,
      domains: Array.from(new Set(parsedCookies.map((c) => c.domain))),
    };
  } catch (err) {
    return { ok: false, reason: err?.message || "ios_pull_cookies_failed", profileCode: cleanCode, cookiesCount: 0 };
  }
}

async function pushBrowserCookiesToIosDevice(
  profileCode,
  {
    serial = "",
    cookies = null,
    vaultRoot = resolveMobileVaultRoot(),
    sshPort,
    sshHost,
    sshUser,
    execFileFn = execFileAsync,
    portProbeFn = checkTcpPortOpen,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  if (_iosCache.devices.length === 0 && execFileFn === execFileAsync) {
    await listConnectedIosDevices({ execFileFn, vaultRoot }).catch(() => []);
  }
  const tx = resolveTransportConfig({ serial, sshPort, sshHost, sshUser });
  const sshOnline = await portProbeFn(tx.sshPort, tx.sshHost).catch(() => false);
  if (!sshOnline) {
    return { ok: false, reason: "ios_ssh_not_ready_install_openssh", profileCode: cleanCode, pushedCount: 0 };
  }

  const cookiesDir = path.join(vaultRoot, "cookies", cleanCode);
  const localBin = path.join(cookiesDir, "Cookies.binarycookies");
  const localJson = path.join(cookiesDir, "cookies.json");
  let pushedCount = 0;

  if (Array.isArray(cookies) && cookies.length > 0) {
    fs.mkdirSync(cookiesDir, { recursive: true });
    fs.writeFileSync(localBin, serializeBinaryCookies(cookies));
    pushedCount = cookies.length;
  } else if (!fs.existsSync(localBin) && fs.existsSync(localJson)) {
    const parsed = JSON.parse(fs.readFileSync(localJson, "utf8"));
    if (Array.isArray(parsed) && parsed.length > 0) {
      fs.writeFileSync(localBin, serializeBinaryCookies(parsed));
      pushedCount = parsed.length;
    }
  } else if (fs.existsSync(localBin)) {
    const parsed = parseBinaryCookies(fs.readFileSync(localBin));
    pushedCount = parsed.length > 0 ? parsed.length : 1;
  }

  if (!fs.existsSync(localBin)) {
    return { ok: false, reason: "ios_binarycookies_not_found", profileCode: cleanCode, pushedCount: 0 };
  }

  const safariContainer = await resolveSafariContainerPath({
    serial,
    sshPort: tx.sshPort,
    sshHost: tx.sshHost,
    sshUser: tx.sshUser,
    vaultRoot,
    execFileFn,
  });
  const remoteBin = safariContainer
    ? `${safariContainer}/Library/Cookies/Cookies.binarycookies`
    : "/var/mobile/Library/Cookies/Cookies.binarycookies";

  try {
    await runIosSshCommand(
      `mkdir -p "$(dirname "${remoteBin}")"; killall -9 MobileSafari com.apple.WebKit.Networking 2>/dev/null || true`,
      { serial, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, vaultRoot, execFileFn, timeout: 6000 },
    ).catch(() => undefined);

    const scpArgs = buildSshBaseArgs({ isScp: true, sshPort: tx.sshPort, vaultRoot });
    scpArgs.push(localBin, `${tx.sshUser}@${tx.sshHost}:${remoteBin}`);
    await execFileFn("scp", scpArgs, { timeout: 12_000 });

    await runIosSshCommand(
      `chown mobile:mobile "${remoteBin}" 2>/dev/null || true; chmod 644 "${remoteBin}" 2>/dev/null || true`,
      { serial, sshPort: tx.sshPort, sshHost: tx.sshHost, sshUser: tx.sshUser, vaultRoot, execFileFn, timeout: 6000 },
    ).catch(() => undefined);

    return { ok: true, platform: "ios", profileCode: cleanCode, pushedCount, remoteBin };
  } catch (err) {
    return { ok: false, reason: err?.message || "ios_push_cookies_failed", profileCode: cleanCode, pushedCount: 0 };
  }
}

module.exports = {
  IOS_SERIAL_PREFIX,
  isIosSerial,
  stripIosSerialPrefix,
  makeIosSerial,
  resolveIosDeviceSpec,
  getActiveIosDeviceSerial,
  setActiveIosDeviceSerial,
  listConnectedIosDevices,
  probeIosEndpointHealth,
  ensureIosUsbmuxTunnels,
  getIosBatteryDiagnostics,
  captureIosScreenDataUrl,
  getIosLiveScreenState,
  dispatchIosLiveControlAction,
  augmentMobileProfilesResponse,
  augmentLiveScreenResponse,
  stopIosBackgroundPoller,
  runIosSshCommand,
  switchIosDeviceProfile,
  backupIosProfileSnapshot,
  restoreIosProfileSnapshot,
  launchIosScreenMirror,
  extractIosCookiesToBrowserProfile,
  pushBrowserCookiesToIosDevice,
  parseBinaryCookies,
  serializeBinaryCookies,
  buildShadowrocketProxyUrl,
  applyShadowrocketProxy,
  cleanupShadowrocketServers,
  resolveIosCraneProfilesMap,
  parseArpTableWifiHosts,
  discoverWifiHostsFromArp,
  switchCraneLiteContainer,
  parseCraneLiteContainersFromXml,
  offloadCraneLiteContainer,
  restoreCraneLiteContainer,
  getIosStorageFreeBytes,
  mountCraneLiteProfile,
  ensureIosLanProxyRelay,
  resolvePrimaryLanIpv4,
  callIosMcpTool,
};
