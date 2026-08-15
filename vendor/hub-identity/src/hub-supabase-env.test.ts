import { describe, expect, it } from "vitest";
import {
  createHubAuthEnv,
  createHubAuthEnvFromVite,
  createHubSupabaseEnv,
  HUB_AUTH_DEFAULT_URL,
  HUB_DATA_DEFAULT_URL,
} from "./hub-supabase-env";

describe("createHubAuthEnv", () => {
  it("defaults identity URL to Home Server hub-api, not supabase.com", () => {
    const env = createHubAuthEnv({ anonKey: "anon" });
    expect(env.HUB_AUTH_URL).toBe(HUB_AUTH_DEFAULT_URL);
    expect(env.HUB_AUTH_URL).toBe("https://hub-api.infi.io.vn");
    expect(env.HUB_AUTH_URL).not.toMatch(/supabase\.co/);
    expect(env.isHubAuthConfigured).toBe(true);
    expect(env.HUB_SUPABASE_URL).toBe(env.HUB_AUTH_URL);
    expect(env.isHubSupabaseConfigured).toBe(true);
  });

  it("keeps createHubSupabaseEnv as a wire alias", () => {
    expect(createHubSupabaseEnv).toBe(createHubAuthEnv);
  });

  it("is unconfigured when anon key is missing", () => {
    const env = createHubAuthEnv({ url: HUB_AUTH_DEFAULT_URL, anonKey: "  " });
    expect(env.isHubAuthConfigured).toBe(false);
  });

  it("exposes Home Server data API default (sb-api), not cloud", () => {
    expect(HUB_DATA_DEFAULT_URL).toBe("https://sb-api.infi.io.vn");
    expect(HUB_DATA_DEFAULT_URL).not.toMatch(/supabase\.co/);
  });
});

describe("createHubAuthEnvFromVite", () => {
  it("prefers VITE_HUB_AUTH_* over wire VITE_HUB_SUPABASE_*", () => {
    const env = createHubAuthEnvFromVite({
      VITE_HUB_AUTH_URL: "https://hub-api.infi.io.vn",
      VITE_HUB_AUTH_ANON_KEY: "auth-anon",
      VITE_HUB_SUPABASE_URL: "https://example.supabase.co",
      VITE_HUB_SUPABASE_ANON_KEY: "legacy-anon",
    });
    expect(env.HUB_AUTH_URL).toBe("https://hub-api.infi.io.vn");
    expect(env.HUB_AUTH_ANON_KEY).toBe("auth-anon");
    expect(env.HUB_SUPABASE_URL).toBe(env.HUB_AUTH_URL);
  });

  it("falls back to VITE_HUB_SUPABASE_* when AUTH keys are empty", () => {
    const env = createHubAuthEnvFromVite({
      VITE_HUB_SUPABASE_URL: HUB_AUTH_DEFAULT_URL,
      VITE_HUB_SUPABASE_ANON_KEY: "wire-anon",
    });
    expect(env.isHubAuthConfigured).toBe(true);
    expect(env.HUB_AUTH_ANON_KEY).toBe("wire-anon");
  });
});
