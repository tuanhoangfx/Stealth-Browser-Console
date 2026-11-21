const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  isIosSerial,
  stripIosSerialPrefix,
  makeIosSerial,
  resolveIosDeviceSpec,
  setActiveIosDeviceSerial,
  getActiveIosDeviceSerial,
  listConnectedIosDevices,
  probeIosEndpointHealth,
  getIosBatteryDiagnostics,
  getIosLiveScreenState,
  dispatchIosLiveControlAction,
  augmentMobileProfilesResponse,
  augmentLiveScreenResponse,
  switchIosDeviceProfile,
  backupIosProfileSnapshot,
  launchIosScreenMirror,
  extractIosCookiesToBrowserProfile,
  pushBrowserCookiesToIosDevice,
  parseBinaryCookies,
  serializeBinaryCookies,
  buildShadowrocketProxyUrl,
  parseArpTableWifiHosts,
  switchCraneLiteContainer,
  parseCraneLiteContainersFromXml,
  offloadCraneLiteContainer,
  restoreCraneLiteContainer,
  mountCraneLiteProfile,
  ensureIosLanProxyRelay,
  cleanupShadowrocketServers,
  resolveIosCraneProfilesMap,
} = require("./ios-stealth-bridge.cjs");

describe("ios-stealth-bridge", () => {
  it("parses ios serial prefixes and device specs", () => {
    assert.equal(isIosSerial("ios:d2d95212a2"), true);
    assert.equal(isIosSerial("192.168.0.208:5555"), false);
    assert.equal(stripIosSerialPrefix("ios:abc123"), "abc123");
    assert.equal(makeIosSerial("abc123"), "ios:abc123");
    assert.equal(resolveIosDeviceSpec("iPhone8,2").model, "iPhone 6s Plus");
    assert.equal(resolveIosDeviceSpec("iPhone8,2").width, 414);
    assert.equal(resolveIosDeviceSpec("iPhone8,2").height, 736);
  });

  it("discovers USB iPhones via pymobiledevice3 usbmux list and merges into availableDevices", async () => {
    setActiveIosDeviceSerial("");
    const mockExec = async (_bin, args) => {
      if (args[0] === "usbmux" && args[1] === "list") {
        return {
          stdout: JSON.stringify([
            {
              UniqueDeviceID: "d2d95212a2dee88a25c1b58877f6f9ade5472802",
              ProductType: "iPhone8,2",
              ProductVersion: "15.8.2",
              BuildVersion: "19H384",
              ConnectionType: "USB",
            },
          ]),
        };
      }
      if (args[0] === "lockdown" && args[1] === "get") {
        return {
          stdout: JSON.stringify({
            BatteryCurrentCapacity: 42,
            ExternalConnected: true,
          }),
        };
      }
      return { stdout: "" };
    };

    const mockFetch = async (url) => {
      if (url.endsWith("/status")) {
        return { ok: true, json: async () => ({ value: { ready: true, os: { version: "15.8.2" } }, sessionId: "sid-1" }) };
      }
      if (url.endsWith("/screenshot")) {
        return { ok: true, json: async () => ({ value: "iVBORw0KGgo=" }) };
      }
      return { ok: true, json: async () => ({ value: {} }) };
    };

    const devs = await listConnectedIosDevices({ execFileFn: mockExec, cacheMs: 0 });
    assert.equal(devs.length, 1);
    assert.equal(devs[0].serial, "ios:d2d95212a2dee88a25c1b58877f6f9ade5472802");
    assert.equal(devs[0].model, "iPhone 6s Plus (15.8.2)");

    const health = await probeIosEndpointHealth({
      fetchFn: mockFetch,
      portProbeFn: async () => true,
    });
    assert.equal(health.wdaOnline, true);
    assert.equal(health.sshOnline, true);

    const bat = await getIosBatteryDiagnostics("ios:d2d95212a2dee88a25c1b58877f6f9ade5472802", {
      execFileFn: mockExec,
      cacheMs: 0,
    });
    assert.equal(bat.batteryLevel, 42);
    assert.equal(bat.acPowered, true);

    const state = await getIosLiveScreenState(devs[0], {
      execFileFn: mockExec,
      fetchFn: mockFetch,
      portProbeFn: async () => true,
    });
    assert.equal(state.ok, true);
    assert.equal(state.iosWdaOnline, true);
    assert.equal(state.screenDataUrl, "data:image/png;base64,iVBORw0KGgo=");
    assert.equal(state.displays[0].resolution, "414x736");

    const augProfiles = await augmentMobileProfilesResponse(
      { ok: true, device: { availableDevices: [{ serial: "192.168.0.208:5555", model: "Pixel 6a", active: true }] } },
      { execFileFn: mockExec, fetchFn: mockFetch, portProbeFn: async () => false, cacheMs: 0 },
    );
    assert.equal(augProfiles.device.iosOnline, true);
    assert.equal(augProfiles.device.iosWdaOnline, true);
    assert.equal(augProfiles.device.availableDevices.length, 2);

    const augLive = await augmentLiveScreenResponse(
      { ok: true, serial: "192.168.0.208:5555", availableDevices: [{ serial: "192.168.0.208:5555", model: "Pixel 6a", active: true }] },
      { allDevices: true, includeScreenshot: true },
      { execFileFn: mockExec, fetchFn: mockFetch, portProbeFn: async () => true, cacheMs: 0 },
    );
    assert.ok(augLive.deviceStates["ios:d2d95212a2dee88a25c1b58877f6f9ade5472802"]);
  });

  it("routes select-device, tap, swipe, and home actions to WDA", async () => {
    const calls = [];
    const mockExec = async (_bin, args) => {
      if (args[0] === "usbmux" && args[1] === "list") {
        return {
          stdout: JSON.stringify([
            {
              UniqueDeviceID: "d2d95212a2dee88a25c1b58877f6f9ade5472802",
              ProductType: "iPhone8,2",
              ProductVersion: "15.8.2",
              ConnectionType: "USB",
            },
          ]),
        };
      }
      return { stdout: "{}" };
    };
    const mockFetch = async (url, init) => {
      calls.push({ url, method: init?.method || "GET", body: init?.body || "" });
      if (url.endsWith("/status")) {
        return { ok: true, json: async () => ({ value: { ready: true }, sessionId: "sid-test" }) };
      }
      return { ok: true, json: async () => ({ value: {} }) };
    };

    const sel = await dispatchIosLiveControlAction(
      { action: "select-device", serial: "ios:d2d95212a2dee88a25c1b58877f6f9ade5472802" },
      {
        execFileFn: mockExec,
        fetchFn: mockFetch,
        spawnFn: () => ({ unref() {} }),
        portProbeFn: async () => true,
      },
    );
    assert.equal(sel.ok, true);
    assert.equal(getActiveIosDeviceSerial(), "ios:d2d95212a2dee88a25c1b58877f6f9ade5472802");

    const tapRes = await dispatchIosLiveControlAction(
      { action: "tap", x: 120, y: 240 },
      { fetchFn: mockFetch },
    );
    assert.equal(tapRes.ok, true);
    assert.ok(calls.some((c) => c.url.includes("/session/sid-test/actions")));

    const homeRes = await dispatchIosLiveControlAction(
      { action: "key", keycode: 3 },
      { fetchFn: mockFetch },
    );
    assert.equal(homeRes.ok, true);
    assert.ok(calls.some((c) => c.url.endsWith("/wda/homescreen")));

    const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-ios-vault-"));
    const sshCmds = [];
    const swOffline = await switchIosDeviceProfile("0007", {
      vaultRoot: tmpVault,
      fetchFn: mockFetch,
      portProbeFn: async () => false,
    });
    assert.equal(swOffline.ok, false);
    assert.equal(swOffline.reason, "ios_ssh_not_ready_install_openssh");

    const swOnline = await switchIosDeviceProfile("0007", {
      vaultRoot: tmpVault,
      proxy: "http://127.0.0.1:8080",
      restoreIfAvailable: false,
      fetchFn: mockFetch,
      portProbeFn: async () => true,
      execFileFn: async (bin, args) => {
        sshCmds.push({ bin, args });
        return { stdout: "switched profile_0007" };
      },
    });
    assert.equal(swOnline.ok, true);
    assert.equal(swOnline.containerId, "profile_0007");
    assert.equal(sshCmds.some((c) => c.bin === "ssh" && c.args.join(" ").includes("profile_0007")), true);

    const bk = await backupIosProfileSnapshot("0007", {
      vaultRoot: tmpVault,
      portProbeFn: async () => true,
      execFileFn: async () => ({ stdout: "" }),
    });
    assert.equal(bk.ok, true);

    const mir = await launchIosScreenMirror("0007", {
      execFileFn: mockExec,
      fetchFn: mockFetch,
      spawnFn: () => ({ unref() {} }),
      portProbeFn: async () => true,
      cacheMs: 0,
    });
    assert.equal(mir.ok, true);
    assert.equal(mir.mode, "wda_mjpeg_mirror");

    const ckDir = path.join(tmpVault, "cookies", "0007");
    fs.mkdirSync(ckDir, { recursive: true });
    fs.writeFileSync(path.join(ckDir, "Cookies.binarycookies"), Buffer.from("cook0"));
    const pullCk = await extractIosCookiesToBrowserProfile("0007", {
      vaultRoot: tmpVault,
      portProbeFn: async () => true,
      execFileFn: async () => ({ stdout: "" }),
    });
    assert.equal(pullCk.ok, true);
    assert.equal(pullCk.cookiesCount, 1);

    const pushCk = await pushBrowserCookiesToIosDevice("0007", {
      vaultRoot: tmpVault,
      portProbeFn: async () => true,
      execFileFn: async () => ({ stdout: "" }),
    });
    assert.equal(pushCk.ok, true);
    assert.equal(pushCk.pushedCount, 1);

    setActiveIosDeviceSerial("");
  });

  it("discovers Wi-Fi ios-mcp devices, dispatches HID gestures/apps, and round-trips Cookies.binarycookies", async () => {
    setActiveIosDeviceSerial("");
    const mcpCalls = [];
    const mockFetchMcp = async (url, init) => {
      const payload = init?.body ? JSON.parse(init.body) : {};
      const toolName = payload?.params?.name || "";
      mcpCalls.push({ url, toolName, args: payload?.params?.arguments || {} });
      if (toolName === "get_device_info") {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 1,
            result: {
              content: [{
                type: "text",
                text: JSON.stringify({
                  machine: "iPhone8,2",
                  systemVersion: "15.8.2",
                  screenWidth: 414,
                  screenHeight: 736,
                  screenScale: 3,
                  batteryLevel: 65,
                  batteryState: "charging",
                  memoryFreeMB: 312.4,
                }),
              }],
            },
          }),
        };
      }
      if (toolName === "screenshot") {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 1,
            result: { content: [{ type: "image", mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg==" }] },
          }),
        };
      }
      if (toolName === "get_screen_info") {
        return {
          ok: true,
          json: async () => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify({ locked: false }) }] } }),
        };
      }
      if (toolName === "launch_app") {
        return {
          ok: true,
          json: async () => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "Failed: app not installed" }] } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }),
      };
    };

    const wifiDevs = await listConnectedIosDevices({
      execFileFn: async () => { throw new Error("usb offline"); },
      fetchFn: mockFetchMcp,
      wifiHosts: [{ host: "192.168.0.222", port: 8090, udid: "d2d95212a2dee88a25c1b58877f6f9ade5472802" }],
      cacheMs: 0,
    });
    assert.equal(wifiDevs.length, 1);
    assert.equal(wifiDevs[0].isWireless, true);
    assert.equal(wifiDevs[0].mcpUrl, "http://192.168.0.222:8090/mcp");

    const sel = await dispatchIosLiveControlAction(
      { action: "select-device", serial: wifiDevs[0].serial },
      {
        execFileFn: async () => ({ stdout: "[]" }),
        fetchFn: mockFetchMcp,
        wifiHosts: [{ host: "192.168.0.222", port: 8090, udid: "d2d95212a2dee88a25c1b58877f6f9ade5472802" }],
      },
    );
    assert.equal(sel.ok, true);

    const state = await getIosLiveScreenState(wifiDevs[0], {
      fetchFn: mockFetchMcp,
      portProbeFn: async () => true,
      cacheMs: 0,
    });
    assert.equal(state.iosMcpOnline, true);
    assert.equal(state.hardwareHealth.ramAvailableMb, 312);
    assert.ok(state.screenDataUrl.startsWith("data:image/jpeg;base64,"));

    const home = await dispatchIosLiveControlAction(
      { action: "keyevent", keyCode: "KEYCODE_HOME", serial: wifiDevs[0].serial },
      { fetchFn: mockFetchMcp, mcpUrl: wifiDevs[0].mcpUrl },
    );
    assert.equal(home.ok, true);
    assert.equal(home.via, "ios-mcp");

    const back = await dispatchIosLiveControlAction(
      { action: "keyevent", keyCode: "KEYCODE_BACK", serial: wifiDevs[0].serial },
      { fetchFn: mockFetchMcp, mcpUrl: wifiDevs[0].mcpUrl },
    );
    assert.equal(back.ok, true);
    assert.ok(mcpCalls.some((c) => c.toolName === "swipe_screen" && c.args.fromX === 8));

    const fb = await dispatchIosLiveControlAction(
      { action: "launch-app", packageName: "com.facebook.katana", serial: wifiDevs[0].serial },
      { fetchFn: mockFetchMcp, mcpUrl: wifiDevs[0].mcpUrl },
    );
    assert.equal(fb.ok, true);
    assert.equal(fb.url, "https://m.facebook.com");

    const sampleCookies = [
      { domain: ".facebook.com", name: "c_user", value: "1000999", path: "/", secure: true, httpOnly: true, expires: 1850000000 },
      { domain: ".facebook.com", name: "xs", value: "abc:xyz", path: "/", secure: true, httpOnly: true, expires: 1850000000 },
    ];
    const bin = serializeBinaryCookies(sampleCookies);
    const parsed = parseBinaryCookies(bin);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].name, "c_user");
    assert.equal(parsed[0].value, "1000999");
    assert.equal(parsed[0].secure, true);
    assert.equal(parsed[0].httpOnly, true);

    const srUrl = buildShadowrocketProxyUrl("socks5://user1:pass1@1.2.3.4:1080", "P0003-0001");
    assert.ok(srUrl.startsWith("shadowrocket://add/socks://"));

    const srNoAuth = buildShadowrocketProxyUrl("socks5://160.250.166.30:11790", "P0003-VT2");
    assert.equal(
      srNoAuth,
      `shadowrocket://add/socks://${Buffer.from("160.250.166.30:11790", "utf8").toString("base64")}?remarks=P0003-VT2`,
    );
    const srTrailingColons = buildShadowrocketProxyUrl("160.250.166.30:11790::", "P0003-VT3");
    assert.equal(
      srTrailingColons,
      `shadowrocket://add/http://${Buffer.from("160.250.166.30:11790", "utf8").toString("base64")}?remarks=P0003-VT3`,
    );

    const arpSample = [
      "Interface: 192.168.0.189 --- 0xb",
      "  192.168.0.1           10-27-f5-00-11-22     dynamic",
      "  192.168.0.223         de-e9-19-08-47-8d     dynamic",
      "  192.168.0.224         84:89:AD:91:03:B2     dynamic",
    ].join("\n");
    const arpHits = parseArpTableWifiHosts(arpSample);
    assert.equal(arpHits.length, 2);
    assert.equal(arpHits[0].host, "192.168.0.223");
    assert.equal(arpHits[1].host, "192.168.0.224");

    const craneFetch = async (_url, init) => {
      const payload = init?.body ? JSON.parse(init.body) : {};
      const toolName = payload?.params?.name || "";
      if (toolName === "get_ui_elements") {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 1,
            result: {
              content: [{
                type: "text",
                text: JSON.stringify({
                  elements: [
                    { text: "Facebook", tap: { x: 255, y: 273 } },
                    { text: "Vùng chứa, P0003_FB_01", tap: { x: 164, y: 381 } },
                    { text: "P0003_FB_03", tap: { x: 164, y: 584 } },
                  ],
                }),
              }],
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }) };
    };
    const swCrane = await switchCraneLiteContainer("P0003_FB_03", {
      mcpUrl: "http://192.168.0.222:8090/mcp",
      fetchFn: craneFetch,
    });
    assert.equal(swCrane.ok, true);
    assert.equal(swCrane.containerName, "P0003_FB_03");

    const samplePlistXml = `
      <dict><key>Containers</key><array>
        <dict><key>identifier</key><string>DEFAULT</string><key>name</key><string></string></dict>
        <dict><key>identifier</key><string>4E29FDC2-5C8A-46D9-A558-1F3D3F0C6157</string><key>name</key><string>P0003_FB_01</string></dict>
      </array></dict>`;
    const parsedContainers = parseCraneLiteContainersFromXml(samplePlistXml);
    assert.equal(parsedContainers.length, 1);
    assert.equal(parsedContainers[0].identifier, "4E29FDC2-5C8A-46D9-A558-1F3D3F0C6157");

    const srAuth = buildShadowrocketProxyUrl("http://infi:open5G@192.168.0.120:31081", "P0003-S9");
    assert.equal(
      srAuth,
      `shadowrocket://add/http://${Buffer.from("infi:open5G@192.168.0.120:31081", "utf8").toString("base64")}?remarks=P0003-S9`,
    );

    const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-ios-crane-"));
    const craneArchiveTarget = path.join(tmpVault, "ios", "crane", "0001.crane.tar.gz");
    const offRes = await offloadCraneLiteContainer("0001", {
      vaultRoot: tmpVault,
      portProbeFn: async () => true,
      execFileFn: async (bin, args) => {
        if (bin === "ssh" && args.join(" ").includes("cranelite")) {
          return { stdout: samplePlistXml };
        }
        if (bin === "scp") {
          fs.mkdirSync(path.dirname(craneArchiveTarget), { recursive: true });
          fs.writeFileSync(craneArchiveTarget, Buffer.from("gzip-stub"));
        }
        return { stdout: "ok" };
      },
    });
    assert.equal(offRes.ok, true);
    assert.equal(offRes.containerUuid, "4E29FDC2-5C8A-46D9-A558-1F3D3F0C6157");
    assert.equal(offRes.removedFromDevice, true);

    const resCrane = await restoreCraneLiteContainer("0001", {
      vaultRoot: tmpVault,
      mcpUrl: "http://192.168.0.222:8090/mcp",
      fetchFn: craneFetch,
      portProbeFn: async () => true,
      execFileFn: async () => ({ stdout: "ok" }),
    });
    assert.equal(resCrane.ok, true);
    assert.equal(resCrane.containerName, "P0003_FB_01");

    const relay = await ensureIosLanProxyRelay("192.168.0.120:31081:infi:open5G", { lanIp: "192.168.0.189" });
    assert.equal(relay.ok, true);
    assert.ok(relay.lanProxyUrl.startsWith("http://192.168.0.189:"));

    // Prepare 2 containers in plist; simulate low free flash (8 GiB < minFreeGb=10) so P0003_FB_01 is auto-offloaded LRU when mounting P0003_FB_02
    const lruPlistXml = `
      <dict><key>Containers</key><array>
        <dict><key>identifier</key><string>4E29FDC2-5C8A-46D9-A558-1F3D3F0C6157</string><key>name</key><string>P0003_FB_01</string></dict>
        <dict><key>identifier</key><string>F033B7F6-BC62-47A2-9848-27072203EF71</string><key>name</key><string>P0003_FB_02</string></dict>
      </array><key>activeContainer</key><string>DEFAULT</string></dict>`;
    fs.writeFileSync(path.join(tmpVault, "ios", "crane", "0002.crane.tar.gz"), Buffer.from("tar-0002"));
    let dfCalls = 0;
    const mountRes = await mountCraneLiteProfile("0002", {
      vaultRoot: tmpVault,
      minFreeGb: 10,
      autoOffloadLru: true,
      mcpUrl: "http://192.168.0.222:8090/mcp",
      fetchFn: async (_url, init) => {
        const payload = init?.body ? JSON.parse(init.body) : {};
        if (payload?.params?.name === "get_ui_elements") {
          return {
            ok: true,
            json: async () => ({
              jsonrpc: "2.0",
              id: 1,
              result: {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    elements: [
                      { text: "Facebook", tap: { x: 255, y: 273 } },
                      { text: "Vùng chứa, P0003_FB_01", tap: { x: 164, y: 381 } },
                      { text: "P0003_FB_02", tap: { x: 164, y: 624 } },
                    ],
                  }),
                }],
              },
            }),
          };
        }
        return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }) };
      },
      portProbeFn: async () => true,
      execFileFn: async (bin, args) => {
        const joined = args.join(" ");
        if (bin === "ssh" && joined.includes("df -k")) {
          dfCalls += 1;
          // First check: 8 GiB free (< 10 GiB); after offload: 12 GiB free
          const kb = dfCalls === 1 ? 8 * 1024 * 1024 : 12 * 1024 * 1024;
          return { stdout: `/dev/disk0s1s2 62914560 54525952 ${kb} 87% 100 1000 0% /private/var` };
        }
        if (bin === "ssh" && joined.includes("ls -1dt")) {
          // Newest first -> P0003_FB_01 is oldest (last), so it must be offloaded
          return { stdout: "/var/mobile/Containers/Data/Application/APP/Library/___Crane_Containers/4E29FDC2-5C8A-46D9-A558-1F3D3F0C6157\n" };
        }
        if (bin === "ssh" && joined.includes("cranelite")) {
          return { stdout: lruPlistXml };
        }
        if (bin === "scp" && joined.includes("0001.crane.tar.gz")) {
          fs.writeFileSync(path.join(tmpVault, "ios", "crane", "0001.crane.tar.gz"), Buffer.from("offload-0001"));
        }
        return { stdout: "ok" };
      },
    });
    assert.equal(mountRes.ok, true);
    assert.equal(mountRes.offloadedContainers.length, 1);
    assert.equal(mountRes.offloadedContainers[0].containerName, "P0003_FB_01");
    assert.equal(mountRes.restored?.ok, true);
    assert.equal(mountRes.switched?.ok, true);

    setActiveIosDeviceSerial("");
    assert.ok(sel);
  });

  it("maps live Crane containers & offloaded archives onto profiles and cleans stale Shadowrocket nodes", async () => {
    const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-crane-map-"));
    fs.mkdirSync(path.join(tmpVault, "ios", "crane"), { recursive: true });
    fs.writeFileSync(path.join(tmpVault, "ios", "crane", "0003.crane.tar.gz"), Buffer.from("tar-0003-data"));
    const plistXml = `
      <dict><key>Containers</key><array>
        <dict><key>identifier</key><string>UUID-1111</string><key>name</key><string>P0003_FB_01</string></dict>
        <dict><key>identifier</key><string>UUID-2222</string><key>name</key><string>P0003_FB_02</string></dict>
        <dict><key>identifier</key><string>UUID-3333</string><key>name</key><string>P0003_FB_03</string></dict>
      </array><key>activeContainer</key><string>UUID-1111</string></dict>===CRANE_DISK===/var/mobile/Containers/Data/Application/APP/Library/___Crane_Containers/UUID-1111
/var/mobile/Containers/Data/Application/APP/Library/___Crane_Containers/UUID-2222\n`;

    const mockExec = async (bin, args) => {
      if (bin === "pymobiledevice3" && args[0] === "usbmux") {
        return { stdout: JSON.stringify([{ UniqueDeviceID: "d2d9", ProductType: "iPhone8,2", ProductVersion: "15.8.2", ConnectionType: "USB" }]) };
      }
      return { stdout: plistXml };
    };
    const craneMap = await resolveIosCraneProfilesMap({
      vaultRoot: tmpVault,
      cacheMs: 0,
      sshOnline: true,
      execFileFn: mockExec,
    });
    assert.equal(craneMap.get("0001")?.state, "active");
    assert.equal(craneMap.get("0002")?.state, "on-device");
    assert.equal(craneMap.get("0003")?.state, "offloaded");
    assert.ok(craneMap.get("0003")?.archiveBytes > 0);

    const aug = await augmentMobileProfilesResponse(
      { ok: true, profiles: [{ code: "0001", hasIosContainer: false }, { code: "0003", hasIosContainer: false }], device: {} },
      { vaultRoot: tmpVault, cacheMs: 0, execFileFn: mockExec, portProbeFn: async () => true, fetchFn: async () => ({ ok: false }) },
    );
    assert.equal(aug.profiles[0].hasIosContainer, true);
    assert.equal(aug.profiles[0].iosCrane.containerName, "P0003_FB_01");
    assert.equal(aug.profiles[0].iosCrane.state, "active");
    assert.equal(aug.profiles[1].iosCrane.state, "offloaded");

    // Verify cleanupShadowrocketServers switches off selected P0003 row then deletes both
    let state = ["Dùng Hệ phục vụ P0003-0001, HTTP / AUTO", "P0003-VT2, HTTP / AUTO", "180.149.35.213:42783, HTTP / AUTO"];
    let confirmPending = false;
    const srRes = await cleanupShadowrocketServers({
      mcpUrl: "http://192.168.0.222:8090/mcp",
      prefix: "P0003-",
      maxPasses: 12,
      fetchFn: async (_u, init) => {
        const body = init?.body ? JSON.parse(init.body) : {};
        const name = body?.params?.name;
        if (name === "tap_screen") {
          if (confirmPending) {
            state = state.filter((s) => !s.includes("P0003-VT2"));
            confirmPending = false;
          } else {
            state = ["P0003-0001, HTTP / AUTO", "P0003-VT2, HTTP / AUTO", "Dùng Hệ phục vụ 180.149.35.213:42783, HTTP / AUTO"];
          }
        } else if (name === "swipe_screen") {
          confirmPending = true;
        }
        const elements = confirmPending
          ? [{ text: "Bạn có chắc chắn muốn xóa không?", tap: { x: 207, y: 368 } }, { text: "Xóa", tap: { x: 274, y: 418 } }]
          : state.map((s, idx) => ({ text: s, visible_rect: { y: 280 + idx * 44, x: 20, width: 374, height: 44 }, tap: { x: 207, y: 300 + idx * 44 } }));
        return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify({ elements }) }] } }) };
      },
    });
    assert.equal(srRes.ok, true);
    assert.ok(srRes.deleted >= 1);
  });
});
