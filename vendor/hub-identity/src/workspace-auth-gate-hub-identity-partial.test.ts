import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHubAuthEnv } from "./hub-supabase-env";
import {
  createWorkspaceAuthGateHubEnvPartial,
  createWorkspaceAuthGateHubForgotPasswordFromEnv,
} from "./workspace-auth-gate-hub-identity-partial";

describe("createWorkspaceAuthGateHubEnvPartial", () => {
  it("reuses getHubClient when provided (no second GoTrue client)", () => {
    const reused = createClient("https://hub-api.infi.io.vn", "anon", {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    const env = createHubAuthEnv({ url: "https://hub-api.infi.io.vn", anonKey: "anon" });
    const partial = createWorkspaceAuthGateHubEnvPartial({
      env,
      getHubClient: () => reused,
    });
    expect(partial.profileRoleClient).toBe(reused);
  });

  it("falls back to the data-plane client when Hub env is off", () => {
    const fallback = createClient("https://sb-api.infi.io.vn", "data-anon", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const env = createHubAuthEnv({ url: "https://hub-api.infi.io.vn", anonKey: "" });
    const partial = createWorkspaceAuthGateHubEnvPartial({
      env,
      fallbackProfileRoleClient: fallback,
    });
    expect(env.isHubAuthConfigured).toBe(false);
    expect(partial.profileRoleClient).toBe(fallback);
  });

  it("creates persistSession:false Hub client when configured and no reuse", () => {
    const env = createHubAuthEnv({ url: "https://hub-api.infi.io.vn", anonKey: "anon" });
    const partial = createWorkspaceAuthGateHubEnvPartial({ env });
    expect(partial.profileRoleClient).not.toBeNull();
    expect(partial.profileRoleClient).toBeDefined();
  });

  it("wires forgot-password from env", async () => {
    const env = createHubAuthEnv({ url: "https://hub-api.infi.io.vn", anonKey: "anon" });
    const forgot = createWorkspaceAuthGateHubForgotPasswordFromEnv({ env });
    expect(forgot.isHubConfigured()).toBe(true);
    expect(typeof forgot.resetPasswordForEmail).toBe("function");
  });

  it("calls prepare with the profile-role client", async () => {
    const reused = createClient("https://hub-api.infi.io.vn", "anon", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const prepare = vi.fn(async () => undefined);
    const env = createHubAuthEnv({ url: "https://hub-api.infi.io.vn", anonKey: "anon" });
    const partial = createWorkspaceAuthGateHubEnvPartial({
      env,
      getHubClient: () => reused,
      prepareHubIdentitySession: prepare,
    });
    await partial.onPrepareProfileRoleClient?.(reused);
    expect(prepare).toHaveBeenCalledWith(reused);
  });
});
