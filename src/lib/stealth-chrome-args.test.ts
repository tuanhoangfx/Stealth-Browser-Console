import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildStealthChromeArgs, buildLaunchOptions } = require("../../electron/engine/cloak-browser-engine.cjs");

describe("buildStealthChromeArgs", () => {
  it("omits --no-sandbox on Windows and macOS", () => {
    const profile = { fingerprintSeed: 12345 };
    const args = buildStealthChromeArgs(profile);
    expect(args.some((arg) => arg.startsWith("--fingerprint="))).toBe(true);
    if (process.platform === "win32" || process.platform === "darwin") {
      expect(args).not.toContain("--no-sandbox");
    }
    expect(args).toContain("--disable-infobars");
  });

  it("uses profile fingerprint seed", () => {
    const args = buildStealthChromeArgs({ fingerprintSeed: 99999 });
    expect(args).toContain("--fingerprint=99999");
  });

  it("spoofs the OS from profile.platform (independent of host)", () => {
    expect(buildStealthChromeArgs({ fingerprintSeed: 1, platform: "macos" })).toContain(
      "--fingerprint-platform=macos"
    );
    expect(buildStealthChromeArgs({ fingerprintSeed: 1, platform: "linux" })).toContain(
      "--fingerprint-platform=linux"
    );
    expect(buildStealthChromeArgs({ fingerprintSeed: 1, platform: "windows" })).toContain(
      "--fingerprint-platform=windows"
    );
  });
});

describe("buildLaunchOptions device surface", () => {
  it("threads engine-honored device fields into launch options", () => {
    const opts = buildLaunchOptions(
      {
        fingerprintSeed: 1,
        platform: "macos",
        timezone: "Asia/Tokyo",
        locale: "ja-JP",
        userAgent: "UA/1.0",
        viewportW: 1920,
        viewportH: 1080,
        colorScheme: "dark",
        windowMode: "preset-viewport"
      },
      "/tmp/profile"
    );
    expect(opts.timezone).toBe("Asia/Tokyo");
    expect(opts.locale).toBe("ja-JP");
    expect(opts.userAgent).toBe("UA/1.0");
    expect(opts.viewport).toEqual({ width: 1920, height: 1080 });
    expect(opts.colorScheme).toBe("dark");
  });

  it("leaves device fields unset when engine-default (cloakbrowser viewport)", () => {
    const opts = buildLaunchOptions(
      { fingerprintSeed: 1, viewportW: 0, viewportH: 0, windowMode: "engine-default" },
      "/tmp/profile"
    );
    expect(opts.timezone).toBeUndefined();
    expect(opts.locale).toBeUndefined();
    expect(opts.viewport).toBeUndefined();
    expect(opts.userAgent).toBeUndefined();
  });

  it("uses viewport null + start-maximized for host-maximized mode", () => {
    const opts = buildLaunchOptions({ fingerprintSeed: 1, windowMode: "host-maximized" }, "/tmp/profile");
    expect(opts.viewport).toBeNull();
    expect(opts.args).toContain("--start-maximized");
  });

  it("locks viewport for preset-viewport mode", () => {
    const opts = buildLaunchOptions(
      { fingerprintSeed: 1, windowMode: "preset-viewport", viewportW: 1920, viewportH: 1080 },
      "/tmp/profile"
    );
    expect(opts.viewport).toEqual({ width: 1920, height: 1080 });
    expect(opts.args).not.toContain("--start-maximized");
  });

  it("does not inject a custom profile chrome extension", () => {
    const opts = buildLaunchOptions({ fingerprintSeed: 1, name: "0218" }, "/tmp/profile-0218");
    expect((opts).profileChromeExtDir).toBeUndefined();
    expect(opts.extensionPaths).toBeUndefined();
  });
});
