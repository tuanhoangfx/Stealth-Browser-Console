import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import { APP_VERSION, STEALTH_PRODUCT } from "./app-meta";
import { resolveAppVersionReleaseMeta, stealthHostVersionMeta } from "./app-release";

describe("P0003 version clock (P0020 SSOT)", () => {
  it("APP_VERSION reads package.json", () => {
    expect(APP_VERSION).toBe(packageJson.version);
    expect(STEALTH_PRODUCT.code).toBe("P0003");
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
