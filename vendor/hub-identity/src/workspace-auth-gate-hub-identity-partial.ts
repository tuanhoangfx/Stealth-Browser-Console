import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { HubAuthEnv } from "./hub-supabase-env";

export type WorkspaceAuthGateHubIdentityPartialConfig = {
  hubUrl: string;
  hubAnonKey: string;
  isHubConfigured: boolean;
  /** Reuse the tool identity client (preferred — one GoTrue client, persistSession SSOT). */
  getHubClient?: () => SupabaseClient | null;
  /** When Hub env is missing — e.g. P0022 store client for profile role lookup. */
  fallbackProfileRoleClient?: SupabaseClient | null;
  /** Apply cached Hub JWT before profile-role queries (tool `applyHubIdentitySession`). */
  prepareHubIdentitySession?: (client?: SupabaseClient) => void | Promise<unknown>;
};

/** Shared `profileRoleClient` + `onPrepareProfileRoleClient` for WorkspaceAuthGate adapters. */
export function createWorkspaceAuthGateHubIdentityPartial(
  config: WorkspaceAuthGateHubIdentityPartialConfig,
) {
  const reused = config.getHubClient?.() ?? null;
  return {
    profileRoleClient:
      reused ??
      (config.isHubConfigured
        ? createClient(config.hubUrl, config.hubAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : (config.fallbackProfileRoleClient ?? null)),
    onPrepareProfileRoleClient: config.prepareHubIdentitySession
      ? async (client: SupabaseClient) => {
          await config.prepareHubIdentitySession!(client);
        }
      : undefined,
  };
}

export type WorkspaceAuthGateHubForgotPasswordConfig = {
  hubUrl: string;
  hubAnonKey: string;
  isHubConfigured: () => boolean;
};

/** Hub-only forgot-password handlers for golden WorkspaceAuthGate. */
export function createWorkspaceAuthGateHubForgotPasswordHandlers(
  config: WorkspaceAuthGateHubForgotPasswordConfig,
) {
  return {
    isHubConfigured: config.isHubConfigured,
    resetPasswordForEmail: async (authEmail: string, redirectTo: string) => {
      const hub = createClient(config.hubUrl, config.hubAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return hub.auth.resetPasswordForEmail(authEmail, { redirectTo });
    },
  };
}

function hubAuthFromEnv(env: HubAuthEnv) {
  return {
    hubUrl: env.HUB_AUTH_URL || env.HUB_SUPABASE_URL,
    hubAnonKey: env.HUB_AUTH_ANON_KEY || env.HUB_SUPABASE_ANON_KEY,
    isHubConfigured: env.isHubAuthConfigured ?? env.isHubSupabaseConfigured,
  };
}

/** Wire gate identity/forgot-password from `createHubAuthEnv` — one call per tool. */
export function createWorkspaceAuthGateHubEnvPartial(options: {
  env: HubAuthEnv;
  prepareHubIdentitySession?: (client?: SupabaseClient) => void | Promise<unknown>;
  fallbackProfileRoleClient?: SupabaseClient | null;
  getHubClient?: () => SupabaseClient | null;
}) {
  const resolved = hubAuthFromEnv(options.env);
  return createWorkspaceAuthGateHubIdentityPartial({
    ...resolved,
    prepareHubIdentitySession: options.prepareHubIdentitySession,
    fallbackProfileRoleClient: options.fallbackProfileRoleClient,
    getHubClient: options.getHubClient,
  });
}

export function createWorkspaceAuthGateHubForgotPasswordFromEnv(options: { env: HubAuthEnv }) {
  const resolved = hubAuthFromEnv(options.env);
  return createWorkspaceAuthGateHubForgotPasswordHandlers({
    hubUrl: resolved.hubUrl,
    hubAnonKey: resolved.hubAnonKey,
    isHubConfigured: () => resolved.isHubConfigured,
  });
}
