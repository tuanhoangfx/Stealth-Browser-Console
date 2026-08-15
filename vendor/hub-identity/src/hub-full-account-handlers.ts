import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLoginId } from "./hub-login";
import { hubSessionLabels } from "./hub-session-labels";
import { hubSyncMirrorPasswordApiUrl } from "./hub-api-routes";
import { updateHubPasswordWithMirrorSync } from "./workspace-mirror-password-recovery-sync";

export type HubFullAccountAuthResult = { ok: boolean; message: string };

/** Self-edit profile fields — never mutates role / login_id / email / password. */
export type HubOwnProfileFields = {
  fullName: string;
  phone: string;
  zalo: string;
  telegram: string;
  meta: string;
  notes: string;
};

export type HubOwnProfilePatch = {
  fullName?: string;
  phone?: string;
  zalo?: string;
  telegram?: string;
  meta?: string;
  notes?: string;
};

export type CreateHubFullAccountAuthHandlersOptions = {
  getClient: () => SupabaseClient | null;
  /** Await before each auth/DB call (apply Hub identity session, etc.). */
  prepareClient?: () => Promise<void>;
  syncApiUrl?: string | (() => string);
  /** Prefer live login_id from session labels. */
  getLoginId?: () => string | null | undefined;
};

async function readyClient(
  options: CreateHubFullAccountAuthHandlersOptions,
): Promise<SupabaseClient | null> {
  if (options.prepareClient) await options.prepareClient();
  return options.getClient();
}

function resolveSyncApiUrl(options: CreateHubFullAccountAuthHandlersOptions): string {
  if (typeof options.syncApiUrl === "function") return options.syncApiUrl();
  if (options.syncApiUrl) return options.syncApiUrl;
  return hubSyncMirrorPasswordApiUrl();
}

/**
 * Shared Full User Account modal auth callbacks — SSOT for every Hub sidebar host.
 * Password = direct update (no OTP). Email/username update profiles when signed in.
 */
export function createHubFullAccountAuthHandlers(options: CreateHubFullAccountAuthHandlersOptions) {
  async function onResolveRole(userId: string): Promise<string | null> {
    const client = await readyClient(options);
    if (!client || !userId.trim()) return null;
    const { data } = await client.from("profiles").select("role").eq("id", userId).maybeSingle();
    return data?.role ? String(data.role) : null;
  }

  async function onUpdateUsername(username: string): Promise<HubFullAccountAuthResult> {
    const client = await readyClient(options);
    if (!client) return { ok: false, message: "Hub identity is not configured." };
    const session = (await client.auth.getSession()).data.session;
    const id = session?.user?.id;
    if (!id) return { ok: false, message: "Not signed in." };
    const next = normalizeLoginId(username);
    if (!next) {
      return { ok: false, message: "Username must be 3–32 letters, numbers, . _ -" };
    }
    const { error } = await client
      .from("profiles")
      .update({ login_id: next, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Username updated." };
  }

  async function onLinkEmail(email: string): Promise<HubFullAccountAuthResult> {
    if (!email || !email.includes("@")) {
      return { ok: false, message: "Enter a valid email address." };
    }
    const client = await readyClient(options);
    if (!client) return { ok: false, message: "Hub identity is not configured." };
    const session = (await client.auth.getSession()).data.session;
    const { error } = await client.auth.updateUser({ email });
    if (!error && session?.user?.id) {
      await client
        .from("profiles")
        .update({ contact_email: email, email, updated_at: new Date().toISOString() })
        .eq("id", session.user.id);
    }
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Email updated." };
  }

  async function onUpdatePassword(password: string): Promise<HubFullAccountAuthResult> {
    const client = await readyClient(options);
    if (!client) return { ok: false, message: "Hub identity is not configured." };
    const session = (await client.auth.getSession()).data.session;
    const labels = hubSessionLabels(session);
    return updateHubPasswordWithMirrorSync({
      hubClient: client,
      password,
      syncApiUrl: resolveSyncApiUrl(options),
      loginInput: options.getLoginId?.() ?? labels.loginId,
    });
  }

  async function fetchOwnProfileFields(userId: string): Promise<HubOwnProfileFields | null> {
    const id = userId.trim();
    if (!id) return null;
    const client = await readyClient(options);
    if (!client) return null;
    const { data, error } = await client
      .from("profiles")
      .select("full_name, phone, zalo, telegram, meta, notes")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    return {
      fullName: typeof row.full_name === "string" ? row.full_name : "",
      phone: typeof row.phone === "string" ? row.phone : "",
      zalo: typeof row.zalo === "string" ? row.zalo : "",
      telegram: typeof row.telegram === "string" ? row.telegram : "",
      meta: typeof row.meta === "string" ? row.meta : "",
      notes: typeof row.notes === "string" ? row.notes : "",
    };
  }

  async function onUpdateOwnProfile(patch: HubOwnProfilePatch): Promise<HubFullAccountAuthResult> {
    const client = await readyClient(options);
    if (!client) return { ok: false, message: "Hub identity is not configured." };
    const session = (await client.auth.getSession()).data.session;
    const id = session?.user?.id;
    if (!id) return { ok: false, message: "Not signed in." };

    const row: Record<string, string> = { updated_at: new Date().toISOString() };
    if (patch.fullName !== undefined) row.full_name = patch.fullName.trim();
    if (patch.phone !== undefined) row.phone = patch.phone.trim();
    if (patch.zalo !== undefined) row.zalo = patch.zalo.trim();
    if (patch.telegram !== undefined) row.telegram = patch.telegram.trim();
    if (patch.meta !== undefined) row.meta = patch.meta.trim();
    if (patch.notes !== undefined) row.notes = patch.notes.trimEnd();

    if (Object.keys(row).length <= 1) {
      return { ok: true, message: "No profile changes." };
    }

    const { error } = await client.from("profiles").update(row).eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Profile updated." };
  }

  return {
    onResolveRole,
    onUpdateUsername,
    onLinkEmail,
    onUpdatePassword,
    fetchOwnProfileFields,
    onUpdateOwnProfile,
  };
}
