const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateAndroidAntidetectIdentity,
  generateIosAntidetectIdentity,
  parseUpstreamProxySpec,
  configureAndroidUsbProxyTunnel,
  switchAndroidDeviceProfile,
  getMobileVaultProfileStatus,
  launchMobileScreenMirror,
  syncMobileVaultTagToP0020,
  enableAndroidWifiAdbBridge,
  generatePlayIntegrityFixConfig,
  refreshPlayIntegrityFixConfig,
  extractMobileCookiesToBrowserProfile,
  auditMobileStealthReadiness,
  pushBrowserCookiesToMobileDevice,
} = require("./mobile-stealth-bridge.cjs");

describe("mobile-stealth-bridge", () => {
  it("generates deterministic Android and iOS Crane identities per profileCode", () => {
    const a1 = generateAndroidAntidetectIdentity("0032");
    const a2 = generateAndroidAntidetectIdentity("0032");
    const a3 = generateAndroidAntidetectIdentity("0033");
    assert.equal(a1.imei, a2.imei);
    assert.equal(a1.androidId, a2.androidId);
    assert.notEqual(a1.imei, a3.imei);
    assert.equal(a1.imei.length, 15);

    const ios = generateIosAntidetectIdentity("0032");
    assert.equal(ios.craneContainerId, "profile_0032");
    assert.equal(ios.platform, "iOS");
  });

  it("parses HTTP/SOCKS5/colon proxies and configures USB ADB reverse tunnel", async () => {
    const spec = parseUpstreamProxySpec("http://user:pass@198.51.100.7:8080");
    assert.equal(spec.protocol, "http");
    assert.equal(spec.host, "198.51.100.7");
    assert.equal(spec.port, 8080);

    const adbCalls = [];
    const mockExecFile = async (bin, args) => {
      adbCalls.push(args);
      if (args[0] === "devices") {
        return { stdout: "List of devices attached\nPIXEL5USB\tdevice product:redfin model:Pixel_5 device:redfin\n" };
      }
      if (args.includes("http_proxy") && args.includes("get")) {
        return { stdout: "127.0.0.1:18990\n" };
      }
      if (args.some((a) => String(a).includes("p0002-antidetect-profile.json")) && args.includes("cat")) {
        return { stdout: JSON.stringify({ profileCode: "0032" }) };
      }
      return { stdout: "ok" };
    };

    const sw = await switchAndroidDeviceProfile("0032", {
      proxy: "http://user:pass@198.51.100.7:8080",
      startRelayServer: false,
      execFileFn: mockExecFile,
    });
    assert.equal(sw.ok, true);
    assert.equal(sw.serial, "PIXEL5USB");
    assert.equal(sw.proxyTunnel.mode, "usb_relay");
    assert.equal(sw.proxyTunnel.globalHttpProxy, "127.0.0.1:18990");

    const st = await getMobileVaultProfileStatus("0032", {
      proxy: "http://user:pass@198.51.100.7:8080",
      execFileFn: mockExecFile,
    });
    assert.equal(st.ok, true);
    assert.equal(st.device.connected, true);
    assert.equal(st.device.isCurrentProfileActive, true);
    assert.equal(st.device.proxyTunnelActive, true);

    const mir = await launchMobileScreenMirror("0032", {
      execFileFn: mockExecFile,
      spawnFn: () => ({ pid: 9999, unref() {} }),
    });
    assert.equal(mir.ok, true);
    assert.equal(mir.serial, "PIXEL5USB");

    const syncOut = await syncMobileVaultTagToP0020("0032", {
      hasSnapshot: true,
      supabaseUrl: "https://example.supabase.co",
      serviceKey: "test-key",
      fetchFn: async (url, init) => {
        if (!init || !init.method || init.method === "GET") {
          return {
            ok: true,
            json: async () => [{ id: "r1", service: "Gmail", browser: "0032", note: "" }],
          };
        }
        return { ok: true };
      },
    });
    assert.equal(syncOut.ok, true);
    assert.equal(syncOut.patchedCount, 1);

    const wifiOut = await enableAndroidWifiAdbBridge({
      execFileFn: async (bin, args) => {
        if (args[0] === "devices") {
          return { stdout: "List of devices attached\nPIXEL5USB\tdevice product:redfin model:Pixel_5 device:redfin\n" };
        }
        if (args.includes("wlan0")) {
          return { stdout: "21: wlan0    inet 192.168.1.88/24 brd 192.168.1.255 scope global wlan0\n" };
        }
        if (args[0] === "connect") {
          return { stdout: "connected to 192.168.1.88:5555\n" };
        }
        return { stdout: "restarting in TCP mode port: 5555\n" };
      },
    });
    assert.equal(wifiOut.ok, true);
    assert.equal(wifiOut.endpoint, "192.168.1.88:5555");

    const os = require("node:os");
    const path = require("node:path");
    const fs = require("node:fs");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-pif-ck-"));
    const pifCfg = generatePlayIntegrityFixConfig("0032");
    assert.equal(pifCfg.MANUFACTURER, "Google");
    const pifRes = await refreshPlayIntegrityFixConfig("0032", {
      vaultRoot: tmpDir,
      execFileFn: mockExecFile,
    });
    assert.equal(pifRes.ok, true);
    assert.equal(pifRes.pushedToDevice, true);

    const ckRes = await extractMobileCookiesToBrowserProfile("0032", {
      vaultRoot: tmpDir,
      dataDir: tmpDir,
      customCookies: [
        { name: "SID", value: "gm_1", domain: ".google.com", path: "/" },
        { name: "sessionid", value: "tt_1", domain: ".tiktok.com", path: "/" },
      ],
      execFileFn: mockExecFile,
    });
    assert.equal(ckRes.ok, true);
    assert.equal(ckRes.cookiesCount, 2);
    assert.deepEqual(ckRes.servicesUpdated, ["Gmail", "TikTok"]);

    const pushRes = await pushBrowserCookiesToMobileDevice("0032", {
      vaultRoot: tmpDir,
      dataDir: tmpDir,
      execFileFn: mockExecFile,
    });
    assert.equal(pushRes.ok, true);
    assert.equal(pushRes.pushedCount, 2);

    const audRes = await auditMobileStealthReadiness("0032", { execFileFn: mockExecFile });
    assert.equal(audRes.ok, true);
    assert.equal(audRes.checks.adbOnline, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
