import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import {
  APP_VERSION,
  STEALTH_INTRO_URL,
  STEALTH_LATEST_RELEASE_URL,
  STEALTH_PRODUCT,
  STEALTH_USER_DOWNLOAD_URL,
} from "./app-meta";
import { resolveAppVersionReleaseMeta, stealthHostVersionMeta } from "./app-release";

describe("P0003 version clock (P0020 SSOT)", () => {
  it("APP_VERSION reads package.json", () => {
    expect(APP_VERSION).toBe(packageJson.version);
    expect(STEALTH_PRODUCT.code).toBe("P0003");
  });

  it("exposes P0008 intro, end-user update download, and GitHub latest release URLs", () => {
    expect(STEALTH_INTRO_URL).toBe("https://stealth.infi28.com/intro/");
    expect(STEALTH_USER_DOWNLOAD_URL).toBe("https://stealth.infi28.com/intro/download/");
    expect(STEALTH_LATEST_RELEASE_URL).toBe(
      "https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/latest",
    );
  });

  it("returns publishedAt for header activity timestamp", () => {
    const meta = resolveAppVersionReleaseMeta();
    expect(meta.shortLabel).not.toBe("MVP");
    expect(meta.publishedAt).toBeTruthy();
    expect(typeof meta.live).toBe("boolean");
  });

  it("host wrapper uses resolveHubProductVersionMeta line", () => {
    const host = stealthHostVersionMeta();
    expect(host.line).toBe(`v${packageJson.version}`);
    expect(host.releaseNotesCode).toBe("P0003");
    expect(host.publishedAt).toBeTruthy();
  });
});
