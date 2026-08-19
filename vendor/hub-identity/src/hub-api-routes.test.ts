import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HUB_API_GATEWAY_ORIGIN,
  hubApiOrigin,
  hubResolveLoginApiUrl,
} from "./hub-api-routes";

describe("hubApiOrigin", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_HUB_API_ORIGIN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses CF gateway on public hosts when VITE_HUB_API_ORIGIN is unset", () => {
    vi.stubGlobal("window", { location: { hostname: "infi.io.vn" } });
    expect(hubApiOrigin()).toBe(HUB_API_GATEWAY_ORIGIN);
    expect(hubResolveLoginApiUrl()).toBe(`${HUB_API_GATEWAY_ORIGIN}/hub/auth/resolve-login`);
  });

  it("uses same-origin resolve-login on localhost even when VITE_HUB_API_ORIGIN is baked", () => {
    vi.stubEnv("VITE_HUB_API_ORIGIN", "https://api.infi.io.vn");
    vi.stubGlobal("window", { location: { hostname: "127.0.0.1" } });
    expect(hubApiOrigin()).toBe("");
    expect(hubResolveLoginApiUrl()).toBe("/api/hub/auth/resolve-login");
  });
});
