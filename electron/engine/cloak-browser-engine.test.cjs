const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  FROZEN_CLOAKBROWSER_WRAPPER_VERSION,
  FROZEN_CLOAKBROWSER_CHROMIUM_VERSION,
  enforceFrozenCloakbrowserEnv,
  extractMirrorZipArchive,
  buildLaunchOptions,
  buildProfileMarkerArgs,
  buildStealthChromeArgs,
  chromeExtensionArgs,
} = require("./cloak-browser-engine.cjs");
const { unpackedExtensionId } = require("../lib/profile-chrome-preferences.cjs");

describe("chromeExtensionArgs", () => {
  it("uses extension ids for disable-extensions-except and paths for load-extension", () => {
    const dir = path.join("C:", "cache", "e0001");
    const [exceptFlag, loadFlag] = chromeExtensionArgs([dir]);
    const id = unpackedExtensionId(dir);
    assert.equal(exceptFlag, `--disable-extensions-except=${id}`);
    assert.equal(loadFlag, `--load-extension=${path.resolve(dir).replace(/\\/g, "/")}`);
  });
});

describe("native extension launch mode", () => {
  it("defaults to native (no managed flags required)", () => {
    const prev = process.env.STEALTH_EXTENSION_MODE;
    delete process.env.STEALTH_EXTENSION_MODE;
    delete require.cache[require.resolve("../lib/extension-launch-mode.cjs")];
    const { nativeExtensionsEnabled } = require("../lib/extension-launch-mode.cjs");
    assert.equal(nativeExtensionsEnabled(), true);
    if (prev === undefined) delete process.env.STEALTH_EXTENSION_MODE;
    else process.env.STEALTH_EXTENSION_MODE = prev;
  });
});

describe("profile launch markers", () => {
  it("adds profile id and user data tag near the front of chrome args", () => {
    const profile = { id: "abc-123", fingerprintSeed: 424242 };
    const markers = buildProfileMarkerArgs(profile, "C:\\Users\\me\\AppData\\Roaming\\stealth-browser-console-dev");
    assert.deepEqual(markers, [
      "--stealth-profile-id=abc-123",
      "--stealth-user-data-tag=stealth-browser-console-dev",
    ]);

    const args = buildStealthChromeArgs(profile, "C:\\Users\\me\\AppData\\Roaming\\stealth-browser-console-dev");
    assert.equal(args[0], "--fingerprint=424242");
    assert.equal(args[1], "--stealth-profile-id=abc-123");
    assert.equal(args[2], "--stealth-user-data-tag=stealth-browser-console-dev");
  });

  it("never passes --disable-gpu or --disable-gpu-compositing in headless or headed mode and keeps coherent headless viewport", () => {
    const prevSmoke = process.env.STEALTH_AGENT_SMOKE;
    delete process.env.STEALTH_AGENT_SMOKE;
    try {
      const headlessProfile = { id: "hl-1", fingerprintSeed: 123456, headless: true, windowMode: "host-maximized" };
      const headlessArgs = buildStealthChromeArgs(headlessProfile, "D:\\StealthBrowser");
      assert.equal(headlessArgs.includes("--disable-gpu"), false, "must not cripple WebGL with --disable-gpu");
      assert.equal(headlessArgs.includes("--disable-gpu-compositing"), false, "must not pass --disable-gpu-compositing");
      if (process.platform === "win32" || process.platform === "darwin") {
        assert.equal(headlessArgs.includes("--ignore-gpu-blocklist"), true, "must keep --ignore-gpu-blocklist for WebGL/WebGPU spoofing");
      }

      const headlessOpts = buildLaunchOptions(headlessProfile, "D:\\StealthBrowser\\profiles\\hl-1", "D:\\StealthBrowser");
      assert.equal(headlessOpts.viewport, undefined, "headless host-maximized must omit viewport so CloakBrowser DEFAULT_VIEWPORT (1920x947) applies");

      const headedProfile = { id: "hd-1", fingerprintSeed: 123456, headless: false, windowMode: "host-maximized" };
      const headedOpts = buildLaunchOptions(headedProfile, "D:\\StealthBrowser\\profiles\\hd-1", "D:\\StealthBrowser");
      assert.equal(headedOpts.viewport, null, "headed host-maximized must use viewport:null for native OS window sizing");
    } finally {
      if (prevSmoke === undefined) delete process.env.STEALTH_AGENT_SMOKE;
      else process.env.STEALTH_AGENT_SMOKE = prevSmoke;
    }
  });

  it("freezes CloakBrowser at 0.4.8 (chromium-146.0.7680.177.5) and disables background auto-update checks", () => {
    enforceFrozenCloakbrowserEnv();
    assert.equal(FROZEN_CLOAKBROWSER_WRAPPER_VERSION, "0.4.8");
    assert.equal(FROZEN_CLOAKBROWSER_CHROMIUM_VERSION, "146.0.7680.177.5");
    assert.equal(process.env.CLOAKBROWSER_AUTO_UPDATE, "false");
    assert.equal(process.env.CLOAKBROWSER_VERSION, "146.0.7680.177.5");
  });

  it("extractMirrorZipArchive unpacks nested archive cleanly via System32 tar.exe", () => {
    if (process.platform !== "win32") return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-mirror-tar-"));
    try {
      const src = path.join(tmp, "src");
      const dst = path.join(tmp, "dst");
      const zipPath = path.join(tmp, "mirror.zip");
      fs.mkdirSync(path.join(src, "locales"), { recursive: true });
      fs.writeFileSync(path.join(src, "chrome.exe"), "MZ-mock-chrome", "utf8");
      fs.writeFileSync(path.join(src, "locales", "en-US.pak"), "pak-data", "utf8");

      const sysTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
      execFileSync(sysTar, ["-a", "-c", "-f", zipPath, "-C", src, "chrome.exe", "locales"], { windowsHide: true });

      const ok = extractMirrorZipArchive(zipPath, dst);
      assert.equal(ok, true);
      assert.equal(fs.readFileSync(path.join(dst, "chrome.exe"), "utf8"), "MZ-mock-chrome");
      assert.equal(fs.readFileSync(path.join(dst, "locales", "en-US.pak"), "utf8"), "pak-data");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
