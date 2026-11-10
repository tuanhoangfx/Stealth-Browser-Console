"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");

const rawExecFileAsync = promisify(execFile);
const execFileAsync = (file, args = [], options = {}) =>
  rawExecFileAsync(file, args, {
    windowsHide: true,
    ...options,
    env: {
      ...process.env,
      ADB_MDNS_AUTO_CONNECT: process.env.ADB_MDNS_AUTO_CONNECT || "0",
      ...(options.env || {}),
    },
  });

const ANDROID_FLAGSHIP_MODELS = Object.freeze([
  {
    manufacturer: "Google",
    brand: "google",
    model: "Pixel 8",
    device: "shiba",
    board: "shiba",
    hardware: "shiba",
    buildId: "UQ1A.240205.004",
    incremental: "11224170",
    fingerprint: "google/shiba/shiba:14/UQ1A.240205.004/11224170:user/release-keys",
    tacPrefix: "35847631",
    glRenderer: "Adreno (TM) 740",
    width: 412,
    height: 915,
    scale: 2.625,
  },
  {
    manufacturer: "Google",
    brand: "google",
    model: "Pixel 8 Pro",
    device: "husky",
    board: "husky",
    hardware: "husky",
    buildId: "UQ1A.240205.004",
    incremental: "11224170",
    fingerprint: "google/husky/husky:14/UQ1A.240205.004/11224170:user/release-keys",
    tacPrefix: "35912840",
    glRenderer: "Adreno (TM) 740",
    width: 412,
    height: 915,
    scale: 2.625,
  },
  {
    manufacturer: "Google",
    brand: "google",
    model: "Pixel 7 Pro",
    device: "cheetah",
    board: "cheetah",
    hardware: "cheetah",
    buildId: "UQ1A.240205.002",
    incremental: "11224170",
    fingerprint: "google/cheetah/cheetah:14/UQ1A.240205.002/11224170:user/release-keys",
    tacPrefix: "35472819",
    glRenderer: "Mali-G710",
    width: 412,
    height: 892,
    scale: 3.5,
  },
  {
    manufacturer: "samsung",
    brand: "samsung",
    model: "SM-S918B",
    device: "dm3q",
    board: "kalama",
    hardware: "qcom",
    buildId: "UP1A.231005.007",
    incremental: "S918BXXS3BWK5",
    fingerprint: "samsung/dm3qxxx/dm3q:14/UP1A.231005.007/S918BXXS3BWK5:user/release-keys",
    tacPrefix: "35290411",
    glRenderer: "Adreno (TM) 740",
    width: 384,
    height: 824,
    scale: 3.0,
  },
  {
    manufacturer: "samsung",
    brand: "samsung",
    model: "SM-S928B",
    device: "e3q",
    board: "pineapple",
    hardware: "qcom",
    buildId: "UP1A.231005.007",
    incremental: "S928BXXU1AWM9",
    fingerprint: "samsung/e3qxxx/e3q:14/UP1A.231005.007/S928BXXU1AWM9:user/release-keys",
    tacPrefix: "35601982",
    glRenderer: "Adreno (TM) 750",
    width: 384,
    height: 832,
    scale: 3.0,
  },
]);

function resolveAdbBinaryPath() {
  if (process.env.ANDROID_ADB_PATH) return process.env.ANDROID_ADB_PATH;
  const binName = process.platform === "win32" ? "adb.exe" : "adb";
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "bin", "platform-tools", binName),
    "E:\\Dev\\Tool\\bin\\platform-tools\\adb.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "adb";
}

function resolveMobileVaultRoot() {
  const sharedPath = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\mobile-vault";
  if (fs.existsSync("E:\\Dev\\Tool\\P0002-Social-Hub")) return sharedPath;
  return path.resolve(__dirname, "..", "..", "data", "mobile-vault");
}

function resolveAndroidModulesDir() {
  const sharedDir = "E:\\Dev\\Tool\\bin\\android-modules";
  if (fs.existsSync("E:\\Dev\\Tool")) return sharedDir;
  return path.resolve(__dirname, "..", "..", "data", "android-modules");
}

function computeLuhnCheckDigit(digits14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    let d = Number(digits14[i] || 0);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

function generateAndroidAntidetectIdentity(profileCode) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const hash = crypto.createHash("sha256").update(`p0002-android-antidetect:${cleanCode}`).digest();
  const modelSpec = ANDROID_FLAGSHIP_MODELS[hash[0] % ANDROID_FLAGSHIP_MODELS.length];
  let serial6 = "";
  for (let i = 0; i < 6; i += 1) {
    serial6 += String(hash[1 + i] % 10);
  }
  const imei14 = `${modelSpec.tacPrefix}${serial6}`.slice(0, 14);
  const imei = `${imei14}${computeLuhnCheckDigit(imei14)}`;
  const androidId = hash.subarray(8, 16).toString("hex");
  const gsfNum = (BigInt("0x" + hash.subarray(16, 24).toString("hex")) & 0x7fffffffffffffffn).toString(16).padStart(16, "0");
  const macBytes = [hash[24] & 0xfe | 0x02, hash[25], hash[26], hash[27], hash[28], hash[29]];
  const macAddress = macBytes.map((b) => b.toString(16).padStart(2, "0")).join(":");
  const chromePatch = 100 + (hash[30] % 95);
  const chromeFullVersion = `124.0.6367.${chromePatch}`;

  return {
    profileCode: cleanCode,
    manufacturer: modelSpec.manufacturer,
    brand: modelSpec.brand,
    model: modelSpec.model,
    device: modelSpec.device,
    board: modelSpec.board,
    hardware: modelSpec.hardware,
    release: "14",
    sdkInt: 34,
    buildId: modelSpec.buildId,
    incremental: modelSpec.incremental,
    fingerprint: modelSpec.fingerprint,
    imei,
    androidId,
    gsfId: gsfNum,
    macAddress,
    glVendor: modelSpec.glRenderer.startsWith("Mali") ? "ARM" : "Qualcomm",
    glRenderer: modelSpec.glRenderer,
    chromeFullVersion,
  };
}

function generateIosAntidetectIdentity(profileCode) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const hash = crypto.createHash("sha256").update(`p0002-ios-antidetect:${cleanCode}`).digest();
  const iosModels = [
    { model: "iPhone 13", deviceCode: "iPhone14,5", iosVersion: "16.6.1", buildId: "20G81", gpu: "Apple A15 GPU" },
    { model: "iPhone 12 Pro", deviceCode: "iPhone13,3", iosVersion: "16.5", buildId: "20F66", gpu: "Apple A14 GPU" },
    { model: "iPhone 11", deviceCode: "iPhone12,1", iosVersion: "16.6", buildId: "20G75", gpu: "Apple A13 GPU" },
    { model: "iPhone X", deviceCode: "iPhone10,6", iosVersion: "16.7.8", buildId: "20H343", gpu: "Apple A11 GPU" },
  ];
  const spec = iosModels[hash[0] % iosModels.length];
  const udid = `${hash.subarray(1, 5).toString("hex").toUpperCase()}-${hash.subarray(5, 13).toString("hex").toUpperCase()}`;
  return {
    profileCode: cleanCode,
    platform: "iOS",
    model: spec.model,
    deviceCode: spec.deviceCode,
    iosVersion: spec.iosVersion,
    buildId: spec.buildId,
    udid,
    craneContainerId: `profile_${cleanCode}`,
  };
}

function parseUpstreamProxySpec(proxyRaw) {
  const trimmed = String(proxyRaw || "").trim();
  if (!trimmed || /^(direct|local|none|:0)$/i.test(trimmed) || /^vpn:\/\//i.test(trimmed)) {
    return null;
  }
  try {
    if (/^(https?|socks5h?):\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      const protocol = u.protocol.replace(":", "").toLowerCase().startsWith("socks") ? "socks5" : "http";
      const host = u.hostname;
      const port = Number(u.port || (protocol === "socks5" ? 1080 : 80));
      const username = decodeURIComponent(u.username || "");
      const password = decodeURIComponent(u.password || "");
      if (!host || !port) return null;
      return {
        protocol,
        host,
        port,
        username,
        password,
        authHeader: username ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` : "",
        raw: trimmed,
      };
    }
  } catch {
    /* fall through */
  }
  const parts = trimmed.split(":");
  if (parts.length >= 2) {
    const host = parts[0].trim();
    const port = Number(parts[1].trim());
    const username = (parts[2] || "").trim();
    const password = parts.slice(3).join(":").trim();
    if (host && Number.isFinite(port) && port > 0) {
      return {
        protocol: "http",
        host,
        port,
        username,
        password,
        authHeader: username ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` : "",
        raw: trimmed,
      };
    }
  }
  return null;
}

function openUpstreamProxySocket(upstream, targetHost, targetPort, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!upstream || !upstream.host || !upstream.port) {
      const directSock = net.connect({ host: targetHost, port: Number(targetPort) }, () => resolve(directSock));
      directSock.setTimeout(timeoutMs, () => directSock.destroy(new Error("direct_timeout")));
      directSock.once("error", reject);
      return;
    }
    const sock = net.connect({ host: upstream.host, port: Number(upstream.port) });
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    sock.setTimeout(timeoutMs, () => fail(new Error("upstream_proxy_timeout")));
    sock.once("error", fail);

    if (upstream.protocol === "socks5") {
      sock.once("connect", () => {
        const hasAuth = Boolean(upstream.username);
        sock.write(hasAuth ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00]));
        sock.once("data", (greetingResp) => {
          if (!greetingResp || greetingResp[0] !== 0x05) return fail(new Error("socks5_invalid_greeting"));
          const method = greetingResp[1];
          const sendConnectCmd = () => {
            const hostBuf = Buffer.from(String(targetHost), "utf8");
            const portBuf = Buffer.alloc(2);
            portBuf.writeUInt16BE(Number(targetPort), 0);
            const req = Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]), hostBuf, portBuf]);
            sock.write(req);
            sock.once("data", (connResp) => {
              if (!connResp || connResp[1] !== 0x00) return fail(new Error("socks5_connect_rejected"));
              settled = true;
              sock.setTimeout(0);
              resolve(sock);
            });
          };
          if (method === 0x02) {
            const uBuf = Buffer.from(String(upstream.username || ""), "utf8");
            const pBuf = Buffer.from(String(upstream.password || ""), "utf8");
            sock.write(Buffer.concat([Buffer.from([0x01, uBuf.length]), uBuf, Buffer.from([pBuf.length]), pBuf]));
            sock.once("data", (authResp) => {
              if (!authResp || authResp[1] !== 0x00) return fail(new Error("socks5_auth_failed"));
              sendConnectCmd();
            });
          } else if (method === 0x00) {
            sendConnectCmd();
          } else {
            fail(new Error(`socks5_unsupported_method_${method}`));
          }
        });
      });
      return;
    }

    sock.once("connect", () => {
      const headers = [
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
        `Host: ${targetHost}:${targetPort}`,
        ...(upstream.authHeader ? [`Proxy-Authorization: ${upstream.authHeader}`] : []),
        "Proxy-Connection: Keep-Alive",
        "\r\n",
      ].join("\r\n");
      sock.write(headers);
      let buf = Buffer.alloc(0);
      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const idx = buf.indexOf("\r\n\r\n");
        if (idx === -1) return;
        sock.removeListener("data", onData);
        const statusLine = buf.slice(0, idx).toString("utf8").split("\r\n")[0] || "";
        if (!/^HTTP\/1\.[01]\s+200\b/i.test(statusLine)) {
          return fail(new Error(`upstream_connect_failed: ${statusLine}`));
        }
        settled = true;
        sock.setTimeout(0);
        const rest = buf.slice(idx + 4);
        if (rest.length > 0) sock.unshift(rest);
        resolve(sock);
      };
      sock.on("data", onData);
    });
  });
}

const _mobileProxyRelayState = {
  server: null,
  port: 0,
  upstream: null,
  profileCode: "",
};

async function ensureLocalMobileProxyRelayServer({ port = 18990, upstream = null, profileCode = "" } = {}) {
  _mobileProxyRelayState.upstream = upstream;
  if (profileCode) _mobileProxyRelayState.profileCode = profileCode;
  if (_mobileProxyRelayState.server && _mobileProxyRelayState.server.listening) {
    return {
      ok: true,
      port: _mobileProxyRelayState.port,
      profileCode: _mobileProxyRelayState.profileCode,
      upstream: _mobileProxyRelayState.upstream,
    };
  }
  const server = http.createServer((req, res) => {
    const activeUpstream = _mobileProxyRelayState.upstream;
    try {
      const targetUrl = new URL(req.url.startsWith("http") ? req.url : `http://${req.headers.host || "localhost"}${req.url}`);
      if (activeUpstream && activeUpstream.protocol === "http") {
        const proxyReq = http.request(
          {
            host: activeUpstream.host,
            port: activeUpstream.port,
            method: req.method,
            path: targetUrl.href,
            headers: {
              ...req.headers,
              ...(activeUpstream.authHeader ? { "Proxy-Authorization": activeUpstream.authHeader } : {}),
            },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );
        proxyReq.on("error", () => {
          if (!res.headersSent) res.writeHead(502);
          res.end("Bad Gateway");
        });
        req.pipe(proxyReq);
        return;
      }
      openUpstreamProxySocket(activeUpstream, targetUrl.hostname, Number(targetUrl.port || 80))
        .then((sock) => {
          const reqLine = `${req.method} ${targetUrl.pathname}${targetUrl.search} HTTP/1.1\r\n`;
          const hdrs = Object.entries(req.headers)
            .filter(([k]) => !/^proxy-/i.test(k))
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join("\r\n");
          sock.write(`${reqLine}${hdrs}\r\n\r\n`);
          req.pipe(sock);
          sock.pipe(res.socket || res);
        })
        .catch(() => {
          if (!res.headersSent) res.writeHead(502);
          res.end("Bad Gateway");
        });
    } catch {
      if (!res.headersSent) res.writeHead(400);
      res.end("Bad Request");
    }
  });
  server.on("connect", (req, clientSocket, head) => {
    const [targetHost, rawPort] = String(req.url || "").split(":");
    openUpstreamProxySocket(_mobileProxyRelayState.upstream, targetHost, Number(rawPort || 443))
      .then((upstreamSocket) => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head && head.length > 0) upstreamSocket.write(head);
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
        upstreamSocket.on("error", () => clientSocket.destroy());
        clientSocket.on("error", () => upstreamSocket.destroy());
      })
      .catch(() => {
        try {
          clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        } catch {
          /* ignore */
        }
        clientSocket.destroy();
      });
  });

  await new Promise((resolve, reject) => {
    const onError = (err) => {
      if (err && err.code === "EADDRINUSE" && port !== 0) {
        server.listen(0, "127.0.0.1", () => resolve());
        return;
      }
      reject(err);
    };
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", onError);
      resolve();
    });
  });

  const addr = server.address();
  _mobileProxyRelayState.server = server;
  _mobileProxyRelayState.port = typeof addr === "object" && addr ? addr.port : port;
  if (typeof server.unref === "function") server.unref();

  return {
    ok: true,
    port: _mobileProxyRelayState.port,
    profileCode: _mobileProxyRelayState.profileCode,
    upstream: _mobileProxyRelayState.upstream,
  };
}

async function configureAndroidUsbProxyTunnel(
  profileCode,
  { proxy = "", relayPort = 18990, serial = "", execFileFn = execFileAsync, startRelayServer = true } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const upstream = parseUpstreamProxySpec(proxy);
  const adbBin = resolveAdbBinaryPath();
  try {
    let targetSerial = serial;
    if (!targetSerial) {
      const { stdout } = await execFileFn(adbBin, ["devices"], { timeout: 3000 });
      const lines = String(stdout || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
      if (lines.length === 0) {
        return { ok: false, reason: "no_adb_device_online", profileCode: cleanCode, upstream };
      }
      targetSerial = lines[0].split(/\s+/)[0];
    }
    const adbArgs = (cmdArgs) => (targetSerial ? ["-s", targetSerial, ...cmdArgs] : cmdArgs);
    if (!upstream) {
      await execFileFn(adbBin, adbArgs(["shell", "settings", "put", "global", "http_proxy", ":0"]), { timeout: 3000 }).catch(() => undefined);
      await execFileFn(adbBin, adbArgs(["reverse", "--remove", `tcp:${relayPort}`]), { timeout: 3000 }).catch(() => undefined);
      return {
        ok: true,
        mode: "direct",
        serial: targetSerial,
        profileCode: cleanCode,
        globalHttpProxy: ":0",
        upstream: null,
      };
    }
    let boundPort = relayPort;
    if (startRelayServer) {
      const relayInfo = await ensureLocalMobileProxyRelayServer({
        port: relayPort,
        upstream,
        profileCode: cleanCode,
      });
      boundPort = relayInfo.port || relayPort;
    }
    await execFileFn(adbBin, adbArgs(["reverse", `tcp:${boundPort}`, `tcp:${boundPort}`]), { timeout: 3000 });
    const globalHttpProxy = `127.0.0.1:${boundPort}`;
    await execFileFn(adbBin, adbArgs(["shell", "settings", "put", "global", "http_proxy", globalHttpProxy]), { timeout: 3000 });
    return {
      ok: true,
      mode: "usb_relay",
      serial: targetSerial,
      profileCode: cleanCode,
      relayPort: boundPort,
      globalHttpProxy,
      upstream: {
        protocol: upstream.protocol,
        host: upstream.host,
        port: upstream.port,
        hasAuth: Boolean(upstream.username),
      },
    };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "proxy_tunnel_failed", profileCode: cleanCode, upstream };
  }
}

async function backupAndroidProfileSnapshot(
  profileCode,
  {
    packages = ["com.google.android.gms", "com.google.android.youtube", "com.zhiliaoapp.musically", "com.facebook.katana"],
    vaultDir = path.join(resolveMobileVaultRoot(), "android"),
    execFileFn = execFileAsync,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const identity = generateAndroidAntidetectIdentity(cleanCode);
  const adbBin = resolveAdbBinaryPath();
  fs.mkdirSync(vaultDir, { recursive: true });
  const archivePath = path.join(vaultDir, `${cleanCode}.tar.gz`);
  const metaPath = path.join(vaultDir, `${cleanCode}.meta.json`);
  try {
    const { stdout } = await execFileFn(adbBin, ["devices"], { timeout: 3000 });
    const lines = String(stdout || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
    if (lines.length === 0) return { ok: false, reason: "no_adb_device_online", archivePath, identity };
    const serial = lines[0].split(/\s+/)[0];
    const adbArgs = (cmdArgs) => (serial ? ["-s", serial, ...cmdArgs] : cmdArgs);
    const remoteTmp = `/data/local/tmp/p0002_snap_${cleanCode}.tar.gz`;
    const pkgPaths = packages.map((p) => `/data/data/${p}`).join(" ");
    await execFileFn(
      adbBin,
      adbArgs([
        "shell",
        "su",
        "-c",
        `tar --exclude='*/cache/*' --exclude='*/code_cache/*' --exclude='*/no_backup/*' -czf ${remoteTmp} ${pkgPaths} /data/local/tmp/p0002-antidetect-profile.json 2>/dev/null || true`,
      ]),
      { timeout: 15000 },
    );
    await execFileFn(adbBin, adbArgs(["pull", remoteTmp, archivePath]), { timeout: 15000 });
    await execFileFn(adbBin, adbArgs(["shell", "rm", "-f", remoteTmp]), { timeout: 3000 }).catch(() => undefined);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ profileCode: cleanCode, serial, packages, identity, savedAt: new Date().toISOString(), archivePath }, null, 2),
      "utf8",
    );
    const p0020Sync = await syncMobileVaultTagToP0020(cleanCode, {
      model: identity.model,
      imei: identity.imei,
      hasSnapshot: true,
    }).catch(() => ({ ok: false }));
    return { ok: true, serial, archivePath, metaPath, identity, p0020Sync };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "backup_failed", archivePath, identity };
  }
}

async function restoreAndroidProfileSnapshot(
  profileCode,
  {
    packages = ["com.google.android.gms", "com.google.android.youtube", "com.zhiliaoapp.musically", "com.facebook.katana"],
    vaultDir = path.join(resolveMobileVaultRoot(), "android"),
    execFileFn = execFileAsync,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const identity = generateAndroidAntidetectIdentity(cleanCode);
  const archivePath = path.join(vaultDir, `${cleanCode}.tar.gz`);
  if (!fs.existsSync(archivePath)) return { ok: false, reason: "snapshot_not_found", archivePath, identity };
  const adbBin = resolveAdbBinaryPath();
  try {
    const { stdout } = await execFileFn(adbBin, ["devices"], { timeout: 3000 });
    const lines = String(stdout || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
    if (lines.length === 0) return { ok: false, reason: "no_adb_device_online", archivePath, identity };
    const serial = lines[0].split(/\s+/)[0];
    const adbArgs = (cmdArgs) => (serial ? ["-s", serial, ...cmdArgs] : cmdArgs);
    const remoteTmp = `/data/local/tmp/p0002_restore_${cleanCode}.tar.gz`;
    for (const pkg of packages) {
      await execFileFn(adbBin, adbArgs(["shell", "am", "force-stop", pkg]), { timeout: 3000 }).catch(() => undefined);
    }
    await execFileFn(adbBin, adbArgs(["push", archivePath, remoteTmp]), { timeout: 15000 });
    await execFileFn(
      adbBin,
      adbArgs([
        "shell",
        "su",
        "-c",
        `tar -xzf ${remoteTmp} -C / && restorecon -R /data/data/com.google.android.youtube /data/data/com.zhiliaoapp.musically /data/data/com.facebook.katana 2>/dev/null; rm -f ${remoteTmp}`,
      ]),
      { timeout: 15000 },
    );
    return { ok: true, serial, archivePath, identity };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "restore_failed", archivePath, identity };
  }
}

async function switchAndroidDeviceProfile(
  profileCode,
  {
    packages = ["com.google.android.youtube", "com.zhiliaoapp.musically", "com.facebook.katana"],
    clearPackages = false,
    restoreIfAvailable = true,
    proxy = "",
    relayPort = 18990,
    startRelayServer = true,
    vaultDir = path.join(resolveMobileVaultRoot(), "android"),
    execFileFn = execFileAsync,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const identity = generateAndroidAntidetectIdentity(cleanCode);
  const adbBin = resolveAdbBinaryPath();
  try {
    const { stdout } = await execFileFn(adbBin, ["devices"], { timeout: 3000 });
    const lines = String(stdout || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
    if (lines.length === 0) return { ok: false, reason: "no_adb_device_online", identity };
    const serial = lines[0].split(/\s+/)[0];
    const adbArgs = (cmdArgs) => (serial ? ["-s", serial, ...cmdArgs] : cmdArgs);
    const jsonB64 = Buffer.from(JSON.stringify(identity)).toString("base64");
    await execFileFn(adbBin, adbArgs(["shell", `echo '${jsonB64}' | base64 -d > /data/local/tmp/p0002-antidetect-profile.json`]), {
      timeout: 3000,
    }).catch(() => undefined);
    await execFileFn(adbBin, adbArgs(["shell", "settings", "put", "secure", "android_id", identity.androidId]), {
      timeout: 3000,
    }).catch(() => undefined);

    const proxyTunnel = await configureAndroidUsbProxyTunnel(cleanCode, {
      proxy,
      relayPort,
      serial,
      execFileFn,
      startRelayServer,
    });

    const pifRefresh = await refreshPlayIntegrityFixConfig(cleanCode, {
      serial,
      vaultRoot: path.dirname(vaultDir),
      execFileFn,
    }).catch(() => ({ ok: false }));

    const snapFile = path.join(vaultDir, `${cleanCode}.tar.gz`);
    let restoredSnapshot = false;
    if (restoreIfAvailable && fs.existsSync(snapFile)) {
      const rOut = await restoreAndroidProfileSnapshot(cleanCode, { packages, vaultDir, execFileFn });
      restoredSnapshot = Boolean(rOut && rOut.ok);
    } else if (clearPackages && Array.isArray(packages)) {
      for (const pkg of packages) {
        await execFileFn(adbBin, adbArgs(["shell", "pm", "clear", pkg]), { timeout: 4000 }).catch(() => undefined);
      }
    }
    return { ok: true, serial, identity, restoredSnapshot, proxyTunnel, pifRefresh };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "adb_switch_failed", identity };
  }
}

async function getMobileVaultProfileStatus(
  profileCode,
  { proxy = "", vaultRoot = resolveMobileVaultRoot(), execFileFn = execFileAsync } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const androidIdentity = generateAndroidAntidetectIdentity(cleanCode);
  const iosIdentity = generateIosAntidetectIdentity(cleanCode);
  const androidVaultDir = path.join(vaultRoot, "android");
  const iosVaultDir = path.join(vaultRoot, "ios");
  fs.mkdirSync(androidVaultDir, { recursive: true });
  fs.mkdirSync(iosVaultDir, { recursive: true });

  const archivePath = path.join(androidVaultDir, `${cleanCode}.tar.gz`);
  const metaPath = path.join(androidVaultDir, `${cleanCode}.meta.json`);
  const androidExists = fs.existsSync(archivePath);
  const stat = androidExists ? fs.statSync(archivePath) : null;
  let savedMeta = null;
  if (fs.existsSync(metaPath)) {
    try {
      savedMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch {
      savedMeta = null;
    }
  }
  const allSnapshots = fs
    .readdirSync(androidVaultDir)
    .filter((f) => f.endsWith(".tar.gz"))
    .map((f) => f.replace(/\.tar\.gz$/, ""));

  const adbBin = resolveAdbBinaryPath();
  let connected = false;
  let serial = "";
  let deviceModel = "";
  let globalHttpProxy = "";
  let activeProfileOnDevice = "";
  try {
    const { stdout } = await execFileFn(adbBin, ["devices", "-l"], { timeout: 2500 });
    const lines = String(stdout || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
    if (lines.length > 0) {
      connected = true;
      serial = lines[0].split(/\s+/)[0];
      deviceModel = ((lines[0].match(/model:(\S+)/) || [])[1] || "Android").replace(/_/g, " ");
      const proxyOut = await execFileFn(adbBin, ["-s", serial, "shell", "settings", "get", "global", "http_proxy"], {
        timeout: 2000,
      }).catch(() => ({ stdout: "" }));
      globalHttpProxy = String((proxyOut && proxyOut.stdout) || "").trim();
      const profOut = await execFileFn(adbBin, ["-s", serial, "shell", "cat", "/data/local/tmp/p0002-antidetect-profile.json"], {
        timeout: 2000,
      }).catch(() => ({ stdout: "" }));
      try {
        const parsed = JSON.parse(String((profOut && profOut.stdout) || "").trim());
        activeProfileOnDevice = String((parsed && parsed.profileCode) || "");
      } catch {
        activeProfileOnDevice = "";
      }
    }
  } catch {
    /* offline */
  }

  const modulesDir = resolveAndroidModulesDir();
  const stagedModules = fs.existsSync(modulesDir)
    ? fs.readdirSync(modulesDir).filter((f) => f.endsWith(".zip") || f.endsWith(".apk"))
    : [];

  return {
    ok: true,
    profileCode: cleanCode,
    androidIdentity: {
      brand: androidIdentity.brand,
      manufacturer: androidIdentity.manufacturer,
      model: androidIdentity.model,
      device: androidIdentity.device,
      release: androidIdentity.release,
      buildId: androidIdentity.buildId,
      imei: androidIdentity.imei,
      androidId: androidIdentity.androidId,
      gsfId: androidIdentity.gsfId,
      glRenderer: androidIdentity.glRenderer,
      macAddress: androidIdentity.macAddress,
    },
    iosIdentity: {
      model: iosIdentity.model,
      deviceCode: iosIdentity.deviceCode,
      iosVersion: iosIdentity.iosVersion,
      udid: iosIdentity.udid,
      craneContainerId: iosIdentity.craneContainerId,
    },
    device: {
      connected,
      serial,
      deviceModel,
      isWireless: Boolean(connected && serial.includes(":")),
      wifiAdbEndpoint: (readSavedWifiAdbEndpoint(vaultRoot) && readSavedWifiAdbEndpoint(vaultRoot).endpoint) || (serial.includes(":") ? serial : ""),
      activeProfileOnDevice,
      isCurrentProfileActive: Boolean(connected && activeProfileOnDevice === cleanCode),
      globalHttpProxy: globalHttpProxy && globalHttpProxy !== "null" ? globalHttpProxy : ":0",
      proxyTunnelActive: Boolean(globalHttpProxy && /^127\.0\.0\.1:\d+$/.test(globalHttpProxy)),
      iosWdaOnline: false,
    },
    snapshot: {
      exists: androidExists,
      sizeBytes: stat ? stat.size : 0,
      updatedAt: stat ? stat.mtime.toISOString() : (savedMeta && savedMeta.savedAt) || null,
      archivePath,
      totalSnapshots: allSnapshots.length,
      snapshotProfiles: allSnapshots.slice(0, 50),
    },
    modules: {
      stagedCount: stagedModules.length,
      stagedModules,
    },
    scrcpyInstalled: fs.existsSync(resolveScrcpyBinaryPath()),
    parsedProxy: parseUpstreamProxySpec(proxy),
  };
}

function resolveScrcpyBinaryPath() {
  if (process.env.ANDROID_SCRCPY_PATH) return process.env.ANDROID_SCRCPY_PATH;
  const binName = process.platform === "win32" ? "scrcpy.exe" : "scrcpy";
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "bin", "scrcpy", binName),
    "E:\\Dev\\Tool\\bin\\scrcpy\\scrcpy.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "scrcpy";
}

async function launchMobileScreenMirror(
  profileCode,
  { serial = "", stayAwake = true, maxSize = 1080, bitRate = "4M", execFileFn = execFileAsync, spawnFn = spawn } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const identity = generateAndroidAntidetectIdentity(cleanCode);
  const scrcpyBin = resolveScrcpyBinaryPath();
  const adbBin = resolveAdbBinaryPath();
  try {
    let targetSerial = serial;
    if (!targetSerial) {
      const { stdout } = await execFileFn(adbBin, ["devices"], { timeout: 3000 });
      const lines = String(stdout || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
      if (lines.length === 0) return { ok: false, reason: "no_adb_device_online", profileCode: cleanCode };
      targetSerial = lines[0].split(/\s+/)[0];
    }
    const windowTitle = `P0003 Mobile #${cleanCode} · ${identity.model} (${targetSerial})`;
    const args = ["-s", targetSerial, "--window-title", windowTitle, "--max-size", String(maxSize), "--video-bit-rate", String(bitRate)];
    if (stayAwake) args.push("--stay-awake");
    const child = spawnFn(scrcpyBin, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env: { ...process.env, ADB: adbBin },
    });
    if (child && typeof child.unref === "function") child.unref();
    return { ok: true, serial: targetSerial, profileCode: cleanCode, windowTitle, pid: (child && child.pid) || 0, scrcpyBin };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "scrcpy_launch_failed", profileCode: cleanCode };
  }
}

function readDataboxEnvFallback() {
  let supabaseUrl = process.env.DATABOX_SUPABASE_URL || process.env.SUPABASE_URL || "";
  let serviceKey = process.env.DATABOX_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (supabaseUrl && serviceKey) return { supabaseUrl, serviceKey };
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "..", ".env.shared"),
    "E:\\Dev\\.env.shared",
  ];
  for (const envPath of candidates) {
    try {
      if (fs.existsSync(envPath)) {
        const raw = fs.readFileSync(envPath, "utf8");
        for (const line of raw.split(/\r?\n/)) {
          const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
          if (!m) continue;
          const val = m[2].replace(/^['"]|['"]$/g, "").trim();
          if (m[1] === "DATABOX_SUPABASE_URL" && !supabaseUrl) supabaseUrl = val;
          if (m[1] === "DATABOX_SUPABASE_SERVICE_ROLE_KEY" && !serviceKey) serviceKey = val;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { supabaseUrl, serviceKey };
}

async function syncMobileVaultTagToP0020(
  profileCode,
  { model = "", imei = "", hasSnapshot = true, promoteChallengedMail = false, supabaseUrl = "", serviceKey = "", fetchFn = fetch } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const numCode = String(Number.parseInt(cleanCode, 10) || 1);
  const identity = generateAndroidAntidetectIdentity(cleanCode);
  const resolvedModel = model || identity.model;
  const resolvedImei = imei || identity.imei;
  const env = readDataboxEnvFallback();
  const baseUrl = (supabaseUrl || env.supabaseUrl || "").replace(/\/$/, "");
  const key = serviceKey || env.serviceKey || "";

  if (!baseUrl || !key) {
    return { ok: false, reason: "databox_env_unconfigured", profileCode: cleanCode, patchedCount: 0 };
  }
  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    const qUrl = `${baseUrl}/rest/v1/twofa_accounts?select=id,service,account,browser,status,note,stealth_snapshot&browser=in.(${encodeURIComponent(cleanCode)},${encodeURIComponent(numCode)})&deleted_at=is.null&limit=50`;
    const listRes = await fetchFn(qUrl, { headers, signal: AbortSignal.timeout(6000) });
    if (!listRes || !listRes.ok) {
      return { ok: false, reason: `http_${(listRes && listRes.status) || 0}`, profileCode: cleanCode, patchedCount: 0 };
    }
    const rows = await listRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ok: true, profileCode: cleanCode, checkedRows: 0, patchedCount: 0 };
    }
    const tag = `[mobile_vault:ready|${resolvedModel}]`;
    const nowIso = new Date().toISOString();
    let patchedCount = 0;
    for (const row of rows) {
      const oldNote = String(row.note || "");
      const cleanedNote = oldNote.replace(/\[mobile_vault:[^\]]*\]\s*/g, "").trim();
      const nextNote = hasSnapshot ? (cleanedNote ? `${tag} ${cleanedNote}` : tag) : cleanedNote;
      const oldSnap = row.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : {};
      const isMail = /^(gmail|outlook|hotmail|yahoo)$/i.test(String(row.service || "").trim());
      const nextSnap = {
        ...oldSnap,
        ...(promoteChallengedMail && isMail ? { status: "logged_in", reason: "mobile_qr_unlocked", checked_at: nowIso } : {}),
        mobile_vault: {
          ready: Boolean(hasSnapshot),
          model: resolvedModel,
          imei: resolvedImei,
          updated_at: nowIso,
        },
      };
      const patchBody = {
        note: nextNote,
        stealth_snapshot: nextSnap,
        ...(promoteChallengedMail && isMail ? { status: "active" } : {}),
      };
      const pRes = await fetchFn(`${baseUrl}/rest/v1/twofa_accounts?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(patchBody),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (pRes && pRes.ok) patchedCount += 1;
    }
    return { ok: true, profileCode: cleanCode, checkedRows: rows.length, patchedCount, tag };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "p0020_sync_failed", profileCode: cleanCode, patchedCount: 0 };
  }
}

function readSavedWifiAdbEndpoint(vaultRoot = resolveMobileVaultRoot()) {
  try {
    const file = path.join(vaultRoot, "wifi-adb-endpoint.json");
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && parsed.endpoint ? parsed : null;
  } catch {
    return null;
  }
}

async function scanWirelessAdbDynamicPort(
  host = "",
  { timeoutMs = 120, concurrency = 96, execFileFn = execFileAsync } = {},
) {
  const cleanHost = String(host || "").trim().replace(/:\d+$/, "");
  if (!cleanHost) return null;

  try {
    const { stdout } = await execFileFn(resolveAdbBinaryPath(), ["mdns", "services"], { timeout: 1200 });
    const mdnsText = String(stdout || "");
    const hostEsc = cleanHost.replace(/\./g, "\\.");
    const tlsMatch = new RegExp(`_adb-tls-connect\\._tcp\\s+${hostEsc}:(\\d{4,5})\\b`).exec(mdnsText);
    const anyMatch = new RegExp(`${hostEsc}:(\\d{4,5})\\b`).exec(mdnsText);
    const rawCandidate = Number((tlsMatch && tlsMatch[1]) || (anyMatch && anyMatch[1]) || 0);
    const candidatePort = rawCandidate === 5555 ? 0 : rawCandidate;
    if (candidatePort > 0) {
      if (execFileFn !== execFileAsync) return candidatePort;
      const isOpen = await new Promise((resolve) => {
        const sock = new net.Socket();
        sock.setTimeout(Math.max(250, timeoutMs));
        sock.once("connect", () => {
          sock.destroy();
          resolve(true);
        });
        sock.once("timeout", () => {
          sock.destroy();
          resolve(false);
        });
        sock.once("error", () => {
          sock.destroy();
          resolve(false);
        });
        sock.connect(candidatePort, cleanHost);
      });
      if (isOpen) return candidatePort;
    }
  } catch {
    /* fallback to fast TCP scan */
  }

  const ports = [];
  for (let p = 33000; p <= 46999; p++) ports.push(p);
  let idx = 0;
  let foundPort = null;

  async function worker() {
    while (idx < ports.length && foundPort === null) {
      const port = ports[idx++];
      await new Promise((resolve) => {
        const sock = new net.Socket();
        sock.setTimeout(timeoutMs);
        sock.once("connect", () => {
          foundPort = port;
          sock.destroy();
          resolve();
        });
        sock.once("timeout", () => {
          sock.destroy();
          resolve();
        });
        sock.once("error", () => {
          sock.destroy();
          resolve();
        });
        sock.connect(port, cleanHost);
      });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return foundPort;
}

async function enableAndroidWifiAdbBridge({
  host = "",
  port = 5555,
  serial = "",
  vaultRoot = resolveMobileVaultRoot(),
  execFileFn = execFileAsync,
} = {}) {
  const adbBin = resolveAdbBinaryPath();
  const tcpPort = Number(port) || 5555;
  fs.mkdirSync(vaultRoot, { recursive: true });
  const endpointFile = path.join(vaultRoot, "wifi-adb-endpoint.json");

  try {
    let targetHost = String(host || "").trim().replace(/:\d+$/, "");
    let usbSerial = String(serial || "").trim();

    if (!targetHost) {
      if (!usbSerial) {
        const { stdout } = await execFileFn(adbBin, ["devices"], { timeout: 3000 });
        const lines = String(stdout || "")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
        if (lines.length === 0) {
          const saved = readSavedWifiAdbEndpoint(vaultRoot);
          if (saved && saved.endpoint) {
            const cOut = await execFileFn(adbBin, ["connect", saved.endpoint], { timeout: 4000 }).catch(() => ({ stdout: "" }));
            if (/connected to|already connected/i.test(String((cOut && cOut.stdout) || ""))) {
              return { ok: true, mode: "reconnected_saved", endpoint: saved.endpoint, host: saved.host, port: saved.port };
            }
          }
          if (execFileFn === execFileAsync) {
            const savedHost = String((saved && saved.host) || (saved && saved.endpoint ? saved.endpoint.split(":")[0] : "") || "").trim();
            if (savedHost) {
              const dynPort = await scanWirelessAdbDynamicPort(savedHost, { execFileFn });
              if (dynPort) {
                const dynEndpoint = `${savedHost}:${dynPort}`;
                const dynConn = await execFileFn(adbBin, ["connect", dynEndpoint], { timeout: 4000 }).catch(() => ({ stdout: "" }));
                if (/connected to|already connected/i.test(String((dynConn && dynConn.stdout) || ""))) {
                  const meta = {
                    host: savedHost,
                    port: dynPort,
                    endpoint: dynEndpoint,
                    usbSerial: (saved && saved.usbSerial) || "",
                    connected: true,
                    updatedAt: new Date().toISOString(),
                  };
                  fs.writeFileSync(endpointFile, JSON.stringify(meta, null, 2), "utf8");
                  return { ok: true, mode: "reconnected_dynamic_port", endpoint: dynEndpoint, host: savedHost, port: dynPort };
                }
              }
            }
          }
          return { ok: false, reason: "no_adb_device_online" };
        }
        const usbLine = lines.find((l) => !l.split(/\s+/)[0].includes(":")) || lines[0];
        usbSerial = usbLine.split(/\s+/)[0];
      }

      if (usbSerial.includes(":")) {
        targetHost = usbSerial.split(":")[0];
      } else {
        const adbArgs = (cmdArgs) => ["-s", usbSerial, ...cmdArgs];
        const wlanOut = await execFileFn(adbBin, adbArgs(["shell", "ip", "-f", "inet", "addr", "show", "wlan0"]), {
          timeout: 3000,
        }).catch(() => ({ stdout: "" }));
        const inetMatch = /inet\s+(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(String((wlanOut && wlanOut.stdout) || ""));
        if (inetMatch) {
          targetHost = inetMatch[1];
        } else {
          const routeOut = await execFileFn(adbBin, adbArgs(["shell", "ip", "route"]), { timeout: 3000 }).catch(() => ({ stdout: "" }));
          const srcMatch = /src\s+(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(String((routeOut && routeOut.stdout) || ""));
          if (srcMatch) targetHost = srcMatch[1];
        }
      }
    }

    if (!targetHost) return { ok: false, reason: "wlan0_ip_not_found", serial: usbSerial };

    const isMdnsSerial = usbSerial.includes("._adb-tls-connect._tcp") || usbSerial.includes("._adb._tcp");
    const isRealUsbSerial = Boolean(usbSerial && !isMdnsSerial && !usbSerial.includes(":"));
    if (isRealUsbSerial) {
      await execFileFn(adbBin, ["-s", usbSerial, "tcpip", String(tcpPort)], { timeout: 4000 }).catch(() => undefined);
    }

    let endpoint = `${targetHost}:${tcpPort}`;
    let connOut = await execFileFn(adbBin, ["connect", endpoint], { timeout: 5000 }).catch((e) => ({
      stdout: String((e && (e.stdout || e.message)) || ""),
    }));
    let stdoutText = String((connOut && connOut.stdout) || "").trim();
    let connected = /connected to|already connected/i.test(stdoutText) || stdoutText === "ok";

    if (!connected && targetHost && execFileFn === execFileAsync) {
      const dynPort = await scanWirelessAdbDynamicPort(targetHost, { execFileFn });
      if (dynPort) {
        const dynEndpoint = `${targetHost}:${dynPort}`;
        const dynConn = await execFileFn(adbBin, ["connect", dynEndpoint], { timeout: 4000 }).catch(() => ({ stdout: "" }));
        if (/connected to|already connected/i.test(String((dynConn && dynConn.stdout) || ""))) {
          connOut = dynConn;
          stdoutText = String((connOut && connOut.stdout) || "").trim();
          connected = true;
          endpoint = dynEndpoint;
        }
      }
    }

    fs.writeFileSync(
      endpointFile,
      JSON.stringify({ host: targetHost, port: tcpPort, endpoint, usbSerial, connected, updatedAt: new Date().toISOString() }, null, 2),
      "utf8",
    );

    return { ok: connected, mode: "wifi_tcp", host: targetHost, port: tcpPort, endpoint, usbSerial, stdout: stdoutText };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "wifi_adb_failed" };
  }
}

const PIXEL_BETA_PIF_POOL = [
  {
    MANUFACTURER: "Google",
    MODEL: "Pixel 6a",
    PRODUCT: "bluejay_beta",
    DEVICE: "bluejay",
    FINGERPRINT: "google/bluejay_beta/bluejay:16/BP22.250325.007/13352765:user/release-keys",
    BUILD_ID: "BP22.250325.007",
    SECURITY_PATCH: "2026-03-05",
    DEVICE_INITIAL_SDK_INT: "31",
    FIRST_API_LEVEL: "31",
  },
  {
    MANUFACTURER: "Google",
    MODEL: "Pixel 7",
    PRODUCT: "panther_beta",
    DEVICE: "panther",
    FINGERPRINT: "google/panther_beta/panther:16/BP22.250325.007/13352765:user/release-keys",
    BUILD_ID: "BP22.250325.007",
    SECURITY_PATCH: "2026-03-05",
    DEVICE_INITIAL_SDK_INT: "31",
    FIRST_API_LEVEL: "31",
  },
  {
    MANUFACTURER: "Google",
    MODEL: "Pixel 8",
    PRODUCT: "shiba_beta",
    DEVICE: "shiba",
    FINGERPRINT: "google/shiba_beta/shiba:16/BP22.250325.007/13352765:user/release-keys",
    BUILD_ID: "BP22.250325.007",
    SECURITY_PATCH: "2026-03-05",
    DEVICE_INITIAL_SDK_INT: "31",
    FIRST_API_LEVEL: "31",
  },
  {
    MANUFACTURER: "Google",
    MODEL: "Pixel 8 Pro",
    PRODUCT: "husky_beta",
    DEVICE: "husky",
    FINGERPRINT: "google/husky_beta/husky:16/BP22.250325.007/13352765:user/release-keys",
    BUILD_ID: "BP22.250325.007",
    SECURITY_PATCH: "2026-03-05",
    DEVICE_INITIAL_SDK_INT: "31",
    FIRST_API_LEVEL: "31",
  },
  {
    MANUFACTURER: "Google",
    MODEL: "Pixel 5",
    PRODUCT: "redfin_beta",
    DEVICE: "redfin",
    FINGERPRINT: "google/redfin_beta/redfin:14/UPB5.230623.009/10695460:user/release-keys",
    BUILD_ID: "UPB5.230623.009",
    SECURITY_PATCH: "2025-11-05",
    DEVICE_INITIAL_SDK_INT: "29",
    FIRST_API_LEVEL: "29",
  },
];

function generatePlayIntegrityFixConfig(profileCode = "0001") {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const digest = crypto.createHash("sha256").update(`p0002-pif:${cleanCode}`).digest();
  const base = PIXEL_BETA_PIF_POOL[digest[0] % PIXEL_BETA_PIF_POOL.length];
  return {
    ...base,
    BRAND: "google",
    TYPE: "user",
    TAGS: "release-keys",
    spoofBuild: true,
    spoofProps: true,
    spoofProvider: true,
    spoofSignature: false,
    verboseLogs: 0,
    profileCode: cleanCode,
  };
}

async function refreshPlayIntegrityFixConfig(
  profileCode = "0001",
  {
    serial = "",
    fetchOnline = false,
    vaultRoot = resolveMobileVaultRoot(),
    execFileFn = execFileAsync,
    fetchFn = fetch,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const pifDir = path.join(vaultRoot, "pif");
  fs.mkdirSync(pifDir, { recursive: true });

  let pifConfig = generatePlayIntegrityFixConfig(cleanCode);
  let onlineSource = false;

  if (fetchOnline) {
    try {
      const res = await fetchFn(
        "https://raw.githubusercontent.com/osm0sis/PlayIntegrityFork/main/module/example.pif.json",
        { signal: AbortSignal.timeout(4000) },
      );
      if (res && res.ok) {
        const text = await res.text();
        const stripped = text.replace(/\/\/.*$/gm, "").trim();
        const parsed = JSON.parse(stripped);
        if (parsed && parsed.FINGERPRINT) {
          pifConfig = { ...pifConfig, ...parsed, profileCode: cleanCode };
          onlineSource = true;
        }
      }
    } catch {
      /* fallback to deterministic Pixel Canary/Beta pool */
    }
  }

  const pifFilePath = path.join(pifDir, `${cleanCode}.pif.json`);
  const latestPath = path.join(vaultRoot, "pif-latest.json");
  fs.writeFileSync(pifFilePath, JSON.stringify(pifConfig, null, 2), "utf8");
  fs.writeFileSync(latestPath, JSON.stringify(pifConfig, null, 2), "utf8");

  const adbBin = resolveAdbBinaryPath();
  let targetSerial = String(serial || "").trim();
  let pushedToDevice = false;
  try {
    if (!targetSerial) {
      const { stdout } = await execFileFn(adbBin, ["devices"], { timeout: 2500 });
      const lines = String(stdout || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
      if (lines.length > 0) targetSerial = lines[0].split(/\s+/)[0];
    }
    if (targetSerial) {
      const adbArgs = (cmdArgs) => ["-s", targetSerial, ...cmdArgs];
      const b64 = Buffer.from(JSON.stringify(pifConfig, null, 2), "utf8").toString("base64");
      await execFileFn(adbBin, adbArgs(["shell", `echo '${b64}' | base64 -d > /data/local/tmp/p0002-pif.json`]), {
        timeout: 3000,
      });
      await execFileFn(
        adbBin,
        adbArgs([
          "shell",
          "su",
          "-c",
          "cp /data/local/tmp/p0002-pif.json /data/adb/pif.json 2>/dev/null; cp /data/local/tmp/p0002-pif.json /data/adb/modules/playintegrityfix/custom.pif.json 2>/dev/null; killall com.google.android.gms.unstable 2>/dev/null",
        ]),
        { timeout: 4000 },
      ).catch(() => undefined);
      pushedToDevice = true;
    }
  } catch {
    /* device offline, staged on disk */
  }

  return {
    ok: true,
    profileCode: cleanCode,
    serial: targetSerial || null,
    pushedToDevice,
    onlineSource,
    pifFilePath,
    pifConfig,
  };
}

async function extractMobileCookiesToBrowserProfile(
  profileCode = "0001",
  {
    serial = "",
    customCookies = null,
    vaultRoot = resolveMobileVaultRoot(),
    dataDir = path.resolve(vaultRoot, ".."),
    execFileFn = execFileAsync,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const cookiesDir = path.join(vaultRoot, "cookies", cleanCode);
  fs.mkdirSync(cookiesDir, { recursive: true });

  const adbBin = resolveAdbBinaryPath();
  let targetSerial = String(serial || "").trim();
  const extracted = Array.isArray(customCookies) ? [...customCookies] : [];

  try {
    if (!targetSerial) {
      const { stdout } = await execFileFn(adbBin, ["devices"], { timeout: 3000 });
      const lines = String(stdout || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
      if (lines.length === 0 && extracted.length === 0) {
        return { ok: false, reason: "no_adb_device_online", profileCode: cleanCode, cookiesCount: 0 };
      }
      if (lines.length > 0) targetSerial = lines[0].split(/\s+/)[0];
    }

    if (targetSerial) {
      const adbArgs = (cmdArgs) => ["-s", targetSerial, ...cmdArgs];
      const jsonOut = await execFileFn(
        adbBin,
        adbArgs(["shell", "cat", "/data/local/tmp/p0002-mobile-cookies.json"]),
        { timeout: 3000 },
      ).catch(() => ({ stdout: "" }));
      const rawJsonText = String((jsonOut && jsonOut.stdout) || "").trim();
      if (rawJsonText.startsWith("[") || rawJsonText.startsWith("{")) {
        try {
          const parsed = JSON.parse(rawJsonText);
          const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed && parsed.cookies) ? parsed.cookies : [];
          for (const c of list) {
            if (c && c.name && c.value && c.domain) extracted.push(c);
          }
        } catch {
          /* ignore */
        }
      }

      const remoteCookiePaths = [
        { tag: "chrome", path: "/data/data/com.android.chrome/app_chrome/Default/Cookies" },
        { tag: "chrome_net", path: "/data/data/com.android.chrome/app_chrome/Default/Network/Cookies" },
        { tag: "gms", path: "/data/data/com.google.android.gms/app_webview/Default/Cookies" },
        { tag: "tiktok", path: "/data/data/com.zhiliaoapp.musically/app_webview/Default/Cookies" },
        { tag: "facebook", path: "/data/data/com.facebook.katana/app_webview/Default/Cookies" },
      ];

      for (const item of remoteCookiePaths) {
        const remoteTmp = `/data/local/tmp/p0002_ck_${item.tag}.db`;
        const localDbPath = path.join(cookiesDir, `${item.tag}.Cookies.sqlite`);
        await execFileFn(
          adbBin,
          adbArgs(["shell", "su", "-c", `cp ${item.path} ${remoteTmp} 2>/dev/null && chmod 644 ${remoteTmp}`]),
          { timeout: 3000 },
        ).catch(() => undefined);
        await execFileFn(adbBin, adbArgs(["pull", remoteTmp, localDbPath]), { timeout: 4000 }).catch(() => undefined);

        if (fs.existsSync(localDbPath) && fs.statSync(localDbPath).size > 1024) {
          try {
            const { DatabaseSync } = require("node:sqlite");
            const db = new DatabaseSync(localDbPath, { open: true, readOnly: true });
            const rows = db
              .prepare(
                "SELECT host_key, name, value, encrypted_value, path, CAST(expires_utc AS TEXT) AS expires_utc, is_secure, is_httponly, samesite FROM cookies",
              )
              .all();
            db.close();
            for (const r of rows) {
              const domain = String(r.host_key || "").trim();
              const name = String(r.name || "").trim();
              let value = String(r.value || "");
              if (!value && r.encrypted_value) {
                const buf = Buffer.from(r.encrypted_value);
                const str = buf.toString("utf8").replace(/^v1[01]/, "");
                if (/^[\x20-\x7E]+$/.test(str)) value = str;
              }
              if (!domain || !name || !value) continue;
              extracted.push({
                name,
                value,
                domain,
                path: String(r.path || "/"),
                secure: Boolean(r.is_secure),
                httpOnly: Boolean(r.is_httponly),
                sameSite: r.samesite === 0 ? "None" : r.samesite === 2 ? "Strict" : "Lax",
                expires: Math.round(Date.now() / 1000) + 365 * 86400,
              });
            }
          } catch {
            /* sqlite read error */
          }
        }
      }
    }
  } catch (err) {
    if (extracted.length === 0) {
      return {
        ok: false,
        reason: (err && err.message) || "mobile_cookie_extract_failed",
        profileCode: cleanCode,
        cookiesCount: 0,
      };
    }
  }

  const dedupMap = new Map();
  for (const c of extracted) {
    if (!c || !c.domain || !c.name || !c.value) continue;
    dedupMap.set(`${c.domain}|${c.name}|${c.path || "/"}`, {
      name: String(c.name),
      value: String(c.value),
      domain: String(c.domain),
      path: String(c.path || "/"),
      secure: c.secure !== false,
      httpOnly: Boolean(c.httpOnly),
      sameSite: c.sameSite || "Lax",
      expires: Number(c.expires) || Math.round(Date.now() / 1000) + 365 * 86400,
    });
  }
  const cookies = Array.from(dedupMap.values());
  const nowIso = new Date().toISOString();

  const bundlePath = path.join(vaultRoot, "cookies", `${cleanCode}.json`);
  fs.writeFileSync(
    bundlePath,
    JSON.stringify({ profileCode: cleanCode, serial: targetSerial || null, updatedAt: nowIso, cookies }, null, 2),
    "utf8",
  );

  fs.mkdirSync(dataDir, { recursive: true });
  const readJsonSafe = (p, fb) => {
    try {
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) || fb : fb;
    } catch {
      return fb;
    }
  };

  const servicesUpdated = [];
  const gmCookies = cookies.filter((c) => c.domain.includes("google.com") || c.domain.includes("youtube.com"));
  const olCookies = cookies.filter(
    (c) => c.domain.includes("live.com") || c.domain.includes("outlook.com") || c.domain.includes("microsoft.com"),
  );
  if (gmCookies.length > 0 || olCookies.length > 0) {
    const mailPath = path.join(dataDir, "mail-cookie-vault.json");
    const mailRaw = readJsonSafe(mailPath, { updatedAt: nowIso, profiles: {} });
    if (!mailRaw.profiles) mailRaw.profiles = {};
    if (!mailRaw.profiles[cleanCode]) mailRaw.profiles[cleanCode] = {};
    if (gmCookies.length > 0) {
      mailRaw.profiles[cleanCode].gmail = {
        code: cleanCode,
        provider: "gmail",
        updatedAt: nowIso,
        source: "mobile_vault_adb_extract",
        cookies: gmCookies,
      };
      servicesUpdated.push("Gmail");
    }
    if (olCookies.length > 0) {
      mailRaw.profiles[cleanCode].outlook = {
        code: cleanCode,
        provider: "outlook",
        updatedAt: nowIso,
        source: "mobile_vault_adb_extract",
        cookies: olCookies,
      };
      servicesUpdated.push("Outlook");
    }
    mailRaw.updatedAt = nowIso;
    fs.writeFileSync(mailPath, JSON.stringify(mailRaw, null, 2), "utf8");
  }

  const fbCookies = cookies.filter((c) => c.domain.includes("facebook.com"));
  if (fbCookies.length > 0) {
    const fbPath = path.join(dataDir, "fb-cookie-vault.json");
    const fbVault = readJsonSafe(fbPath, {});
    const cUser = fbCookies.find((c) => c.name === "c_user");
    fbVault[cleanCode] = {
      code: cleanCode,
      fbUserId: cUser ? cUser.value : null,
      updatedAt: nowIso,
      source: "mobile_vault_adb_extract",
      cookies: fbCookies,
    };
    fs.writeFileSync(fbPath, JSON.stringify(fbVault, null, 2), "utf8");
    servicesUpdated.push("Facebook");
  }

  const ttCookies = cookies.filter((c) => c.domain.includes("tiktok.com"));
  if (ttCookies.length > 0) {
    const ttPath = path.join(dataDir, "tiktok-cookie-vault.json");
    const ttRaw = readJsonSafe(ttPath, { updatedAt: nowIso, profiles: {} });
    if (!ttRaw.profiles) ttRaw.profiles = {};
    ttRaw.profiles[cleanCode] = {
      code: cleanCode,
      updatedAt: nowIso,
      source: "mobile_vault_adb_extract",
      cookies: ttCookies,
    };
    ttRaw.updatedAt = nowIso;
    fs.writeFileSync(ttPath, JSON.stringify(ttRaw, null, 2), "utf8");
    servicesUpdated.push("TikTok");
  }

  return {
    ok: true,
    profileCode: cleanCode,
    serial: targetSerial || null,
    cookiesCount: cookies.length,
    servicesUpdated,
    bundlePath,
  };
}

async function auditMobileStealthReadiness(
  profileCode = "0001",
  { serial = "", execFileFn = execFileAsync } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const adbBin = resolveAdbBinaryPath();
  try {
    let targetSerial = String(serial || "").trim();
    if (!targetSerial) {
      const { stdout } = await execFileFn(adbBin, ["devices"], { timeout: 3000 });
      const lines = String(stdout || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
      if (lines.length === 0) {
        return {
          ok: false,
          reason: "no_adb_device_online",
          profileCode: cleanCode,
          readyForUnlock: false,
          checks: { adbOnline: false, rootAccess: false, modulesInstalled: false, pifConfigured: false, proxyActive: false },
        };
      }
      targetSerial = lines[0].split(/\s+/)[0];
    }

    const adbArgs = (cmdArgs) => ["-s", targetSerial, ...cmdArgs];
    const rootOut = await execFileFn(adbBin, adbArgs(["shell", "su", "-c", "id"]), { timeout: 3000 }).catch(() => ({
      stdout: "",
    }));
    const rootAccess = String((rootOut && rootOut.stdout) || "").includes("uid=0");

    const modOut = await execFileFn(adbBin, adbArgs(["shell", "su", "-c", "ls -1 /data/adb/modules 2>/dev/null"]), {
      timeout: 3000,
    }).catch(() => ({ stdout: "" }));
    const installedModules = String((modOut && modOut.stdout) || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const hasPif = installedModules.some((m) => /playintegrity/i.test(m));
    const hasZygisk = installedModules.some((m) => /zygisk/i.test(m));
    const hasLsposed = installedModules.some((m) => /lsposed/i.test(m));

    const pifOut = await execFileFn(
      adbBin,
      adbArgs(["shell", "su", "-c", "cat /data/adb/pif.json /data/adb/modules/playintegrityfix/custom.pif.json 2>/dev/null"]),
      { timeout: 3000 },
    ).catch(() => ({ stdout: "" }));
    const pifConfigured = String((pifOut && pifOut.stdout) || "").includes("FINGERPRINT");

    const proxyOut = await execFileFn(adbBin, adbArgs(["shell", "settings", "get", "global", "http_proxy"]), {
      timeout: 2500,
    }).catch(() => ({ stdout: "" }));
    const globalHttpProxy = String((proxyOut && proxyOut.stdout) || "").trim();
    const proxyActive = Boolean(globalHttpProxy && globalHttpProxy !== ":0" && globalHttpProxy !== "null");

    const ipOut = await execFileFn(
      adbBin,
      adbArgs(["shell", "curl", "-s", "--max-time", "4", "https://api.ipify.org"]),
      { timeout: 5000 },
    ).catch(() => ({ stdout: "" }));
    const exitIp = String((ipOut && ipOut.stdout) || "").trim() || null;

    const checks = {
      adbOnline: true,
      isWireless: targetSerial.includes(":"),
      rootAccess,
      modulesInstalled: hasPif && (hasZygisk || hasLsposed),
      hasPif,
      hasZygisk,
      hasLsposed,
      pifConfigured,
      proxyActive,
    };

    return {
      ok: true,
      profileCode: cleanCode,
      serial: targetSerial,
      readyForUnlock: Boolean(checks.adbOnline && checks.rootAccess && (checks.pifConfigured || checks.hasPif)),
      installedModules,
      globalHttpProxy: globalHttpProxy || ":0",
      exitIp,
      checks,
    };
  } catch (err) {
    return {
      ok: false,
      reason: (err && err.message) || "audit_failed",
      profileCode: cleanCode,
      readyForUnlock: false,
    };
  }
}

async function pushBrowserCookiesToMobileDevice(
  profileCode = "0001",
  {
    serial = "",
    customCookies = null,
    vaultRoot = resolveMobileVaultRoot(),
    dataDir = path.resolve(vaultRoot, ".."),
    execFileFn = execFileAsync,
  } = {},
) {
  const cleanCode = String(profileCode || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const adbBin = resolveAdbBinaryPath();
  const readJsonSafe = (p, fb) => {
    try {
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) || fb : fb;
    } catch {
      return fb;
    }
  };

  const cookies = Array.isArray(customCookies) ? [...customCookies] : [];
  if (cookies.length === 0) {
    const mailRaw = readJsonSafe(path.join(dataDir, "mail-cookie-vault.json"), { profiles: {} });
    const fbVault = readJsonSafe(path.join(dataDir, "fb-cookie-vault.json"), {});
    const ttRaw = readJsonSafe(path.join(dataDir, "tiktok-cookie-vault.json"), { profiles: {} });
    const gm = (mailRaw.profiles && mailRaw.profiles[cleanCode] && mailRaw.profiles[cleanCode].gmail && mailRaw.profiles[cleanCode].gmail.cookies) || [];
    const ol = (mailRaw.profiles && mailRaw.profiles[cleanCode] && mailRaw.profiles[cleanCode].outlook && mailRaw.profiles[cleanCode].outlook.cookies) || [];
    const fb = (fbVault[cleanCode] && fbVault[cleanCode].cookies) || [];
    const tt = (ttRaw.profiles && ttRaw.profiles[cleanCode] && ttRaw.profiles[cleanCode].cookies) || [];
    cookies.push(...gm, ...ol, ...fb, ...tt);
  }

  if (cookies.length === 0) {
    return { ok: false, reason: "no_vault_cookies_for_profile", profileCode: cleanCode, pushedCount: 0 };
  }

  try {
    let targetSerial = String(serial || "").trim();
    if (!targetSerial) {
      const { stdout } = await execFileFn(adbBin, ["devices"], { timeout: 3000 });
      const lines = String(stdout || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("List of devices") && /\bdevice\b/.test(l));
      if (lines.length === 0) {
        return { ok: false, reason: "no_adb_device_online", profileCode: cleanCode, pushedCount: 0 };
      }
      targetSerial = lines[0].split(/\s+/)[0];
    }

    const adbArgs = (cmdArgs) => ["-s", targetSerial, ...cmdArgs];
    const payloadB64 = Buffer.from(JSON.stringify({ profileCode: cleanCode, cookies }, null, 2), "utf8").toString("base64");
    await execFileFn(
      adbBin,
      adbArgs(["shell", `echo '${payloadB64}' | base64 -d > /data/local/tmp/p0002-mobile-cookies.json`]),
      { timeout: 4000 },
    );

    return {
      ok: true,
      profileCode: cleanCode,
      serial: targetSerial,
      pushedCount: cookies.length,
    };
  } catch (err) {
    return {
      ok: false,
      reason: (err && err.message) || "push_cookies_failed",
      profileCode: cleanCode,
      pushedCount: 0,
    };
  }
}

module.exports = {
  generateAndroidAntidetectIdentity,
  generateIosAntidetectIdentity,
  parseUpstreamProxySpec,
  openUpstreamProxySocket,
  ensureLocalMobileProxyRelayServer,
  configureAndroidUsbProxyTunnel,
  backupAndroidProfileSnapshot,
  restoreAndroidProfileSnapshot,
  switchAndroidDeviceProfile,
  getMobileVaultProfileStatus,
  resolveScrcpyBinaryPath,
  launchMobileScreenMirror,
  syncMobileVaultTagToP0020,
  readSavedWifiAdbEndpoint,
  enableAndroidWifiAdbBridge,
  generatePlayIntegrityFixConfig,
  refreshPlayIntegrityFixConfig,
  extractMobileCookiesToBrowserProfile,
  auditMobileStealthReadiness,
  pushBrowserCookiesToMobileDevice,
};
