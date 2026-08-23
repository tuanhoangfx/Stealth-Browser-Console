import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isHubTechnicalAuthEmail, normalizeLoginId } from "./hub-login";
import { hubSessionLabels } from "./hub-session-labels";
import { hubSyncMirrorPasswordApiUrl } from "./hub-api-routes";
import { updateHubPasswordWithMirrorSync } from "./workspace-mirror-password-recovery-sync";
import {
  tryRemoveHubAvatarObject,
  uploadHubAvatarObjectForSession,
} from "./hub-avatar-upload";

export type HubFullAccountAuthResult = { ok: boolean; message: string };

/** Self-edit profile fields — never mutates role / login_id / email / password. */
export type HubOwnProfileFields = {
  /** profiles.login_id — Hub Username */
  loginId: string;
  /** profiles.email — directory contact (Users detail SSOT). */
  email: string;
  /** profiles.contact_email — recovery/contact when distinct from email. */
  contactEmail: string;
  fullName: string;
  phone: string;
  zalo: string;
  telegram: string;
  meta: string;
  notes: string;
  /** profiles.avatar_url — Hub Storage public URL when set. */
  avatarUrl: string;
};

export type HubOwnProfilePatch = {
  fullName?: string;
  phone?: string;
  zalo?: string;
  telegram?: string;
  meta?: string;
  notes?: string;
  avatarUrl?: string | null;
};

export type CreateHubFullAccountAuthHandlersOptions = {
  getClient: () => SupabaseClient | null;
  /** Await before each auth/DB call (apply Hub identity session, etc.). */
  prepareClient?: () => Promise<void>;
  syncApiUrl?: string | (() => string);
  /** Prefer live login_id from session labels. */
  getLoginId?: () => string | null | undefined;
  /**
   * @deprecated Hub plane has no storage-api. Prefer getAvatarStorageConfig (Data Box).
   */
  getHubStorageConfig?: () => { url: string; anonKey: string } | null;
  /**
   * Avatar binary store — Data Box Storage (`sb-api`, CORS + storage-api).
   * Hub `profiles.avatar_url` still receives the public URL string.
   */
  getAvatarStorageConfig?: () => { url: string; anonKey: string } | null;
  /** Data Box JWT for Storage RLS (`auth.uid()` folder). */
  getAvatarUploadSession?: () => Promise<Session | null>;
  /**
   * Mirror avatar_url string onto Data Box `profiles` (dual-auth hosts).
   * Do not re-upload — Storage remains a single object.
   */
  mirrorAvatarUrl?: (avatarUrl: string | null) => Promise<void>;
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

function readClientStorageConfig(client: SupabaseClient): { url: string; anonKey: string } | null {
  const anyClient = client as unknown as {
    supabaseUrl?: string;
    supabaseKey?: string;
    rest?: { url?: string; headers?: Record<string, string> };
  };
  let url = String(anyClient.supabaseUrl ?? "").trim().replace(/\/+$/, "");
  if (!url && anyClient.rest?.url) {
    url = String(anyClient.rest.url)
      .trim()
      .replace(/\/rest\/v1\/?$/i, "")
      .replace(/\/+$/, "");
  }
  let anonKey = String(anyClient.supabaseKey ?? "").trim();
  if (!anonKey && anyClient.rest?.headers) {
    const headers = anyClient.rest.headers;
    anonKey = String(headers.apikey ?? headers.Authorization?.replace(/^Bearer\s+/i, "") ?? "").trim();
  }
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

async function mirrorAvatarBestEffort(
  options: CreateHubFullAccountAuthHandlersOptions,
  avatarUrl: string | null,
): Promise<void> {
  if (!options.mirrorAvatarUrl) return;
  try {
    await options.mirrorAvatarUrl(avatarUrl);
  } catch (error) {
    console.warn("[hub-account] Data Box avatar mirror failed:", error);
  }
}

function publicIdentifierError(error: unknown, fallback: string): string {
  const detail = error as { code?: string; message?: string } | null;
  if (detail?.code !== "23505" && !/duplicate key|unique constraint/i.test(detail?.message ?? "")) {
    return detail?.message || fallback;
  }
  const source = `${detail?.message ?? ""}`.toLowerCase();
  if (source.includes("phone")) return "This phone number is already linked to another user.";
  if (source.includes("contact_email") || source.includes("email")) {
    return "This contact email is already linked to another user.";
  }
  if (source.includes("login") || source.includes("username")) {
    return "This username is already in use.";
  }
  return "This identifier is already linked to another user.";
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
    if (error) return { ok: false, message: publicIdentifierError(error, "Username update failed.") };
    return { ok: true, message: "Username updated." };
  }

  async function onLinkEmail(email: string): Promise<HubFullAccountAuthResult> {
    if (!email || !email.includes("@")) {
      return { ok: false, message: "Enter a valid email address." };
    }
    const trimmed = email.trim().toLowerCase();
    if (isHubTechnicalAuthEmail(trimmed)) {
      return { ok: false, message: "Enter a real contact email — technical Hub addresses cannot be linked." };
    }
    const client = await readyClient(options);
    if (!client) return { ok: false, message: "Hub identity is not configured." };
    const session = (await client.auth.getSession()).data.session;
    const id = session?.user?.id?.trim();
    if (!id) return { ok: false, message: "Sign in again to link an email." };
    // Contact/recovery only — never replace opaque auth.users.email (username login stays stable).
    const { error } = await client
      .from("profiles")
      .update({ contact_email: trimmed, email: trimmed, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, message: publicIdentifierError(error, "Email link failed.") };
    return { ok: true, message: "Contact email linked." };
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
    const loginHint = String(options.getLoginId?.() ?? "")
      .trim()
      .toLowerCase();
    if (!id && !loginHint) return null;
    const client = await readyClient(options);
    if (!client) return null;

    const selectCols =
      "login_id, email, contact_email, full_name, phone, zalo, telegram, meta, notes, avatar_url";

    let row: Record<string, unknown> | null = null;
    if (id) {
      const byId = await client.from("profiles").select(selectCols).eq("id", id).maybeSingle();
      if (!byId.error && byId.data) row = byId.data as Record<string, unknown>;
    }
    // Dual-auth hosts may pass a Data Box user id — fall back to Hub login_id SSOT.
    if (!row && loginHint) {
      const byLogin = await client
        .from("profiles")
        .select(selectCols)
        .eq("login_id", loginHint)
        .maybeSingle();
      if (!byLogin.error && byLogin.data) row = byLogin.data as Record<string, unknown>;
    }
    if (!row) return null;

    return {
      loginId: typeof row.login_id === "string" ? row.login_id.trim() : "",
      email: typeof row.email === "string" ? row.email.trim() : "",
      contactEmail: typeof row.contact_email === "string" ? row.contact_email.trim() : "",
      fullName: typeof row.full_name === "string" ? row.full_name : "",
      phone: typeof row.phone === "string" ? row.phone : "",
      zalo: typeof row.zalo === "string" ? row.zalo : "",
      telegram: typeof row.telegram === "string" ? row.telegram : "",
      meta: typeof row.meta === "string" ? row.meta : "",
      notes: typeof row.notes === "string" ? row.notes : "",
      avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url.trim() : "",
    };
  }

  async function onUpdateOwnProfile(patch: HubOwnProfilePatch): Promise<HubFullAccountAuthResult> {
    const client = await readyClient(options);
    if (!client) return { ok: false, message: "Hub identity is not configured." };
    const session = (await client.auth.getSession()).data.session;
    const id = session?.user?.id;
    if (!id) return { ok: false, message: "Not signed in." };

    const row: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (patch.fullName !== undefined) row.full_name = patch.fullName.trim();
    if (patch.phone !== undefined) row.phone = patch.phone.trim();
    if (patch.zalo !== undefined) row.zalo = patch.zalo.trim();
    if (patch.telegram !== undefined) row.telegram = patch.telegram.trim();
    if (patch.meta !== undefined) row.meta = patch.meta.trim();
    if (patch.notes !== undefined) row.notes = patch.notes.trimEnd();
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl?.trim() || null;

    if (Object.keys(row).length <= 1) {
      return { ok: true, message: "No profile changes." };
    }

    const { error } = await client.from("profiles").update(row).eq("id", id);
    if (error) return { ok: false, message: publicIdentifierError(error, "Profile update failed.") };
    if (patch.avatarUrl !== undefined) {
      await mirrorAvatarBestEffort(options, patch.avatarUrl?.trim() || null);
    }
    return { ok: true, message: "Profile updated." };
  }

  async function onUploadAvatar(file: File): Promise<HubFullAccountAuthResult & { avatarUrl?: string }> {
    const client = await readyClient(options);
    if (!client) return { ok: false, message: "Hub identity is not configured." };
    let hubSession = (await client.auth.getSession()).data.session;
    if (!hubSession?.access_token || !hubSession.user?.id) {
      if (options.prepareClient) await options.prepareClient();
      hubSession = (await client.auth.getSession()).data.session;
    }
    if (!hubSession?.access_token || !hubSession.user?.id) {
      return { ok: false, message: "Not signed in to Hub. Sign in again, then retry avatar upload." };
    }

    // Hub nginx has no storage-api — upload binaries on Data Box (CORS + Kong storage).
    const storage =
      options.getAvatarStorageConfig?.() ??
      options.getHubStorageConfig?.() ??
      readClientStorageConfig(client);
    if (!storage?.url || !storage.anonKey) {
      return { ok: false, message: "Avatar Storage is not configured." };
    }

    let uploadSession = options.getAvatarUploadSession
      ? await options.getAvatarUploadSession()
      : null;
    if (!uploadSession?.access_token || !uploadSession.user?.id) {
      uploadSession = hubSession;
    }

    const previous = await fetchOwnProfileFields(hubSession.user.id);
    const uploaded = await uploadHubAvatarObjectForSession({
      supabaseUrl: storage.url,
      anonKey: storage.anonKey,
      session: uploadSession,
      file,
    });
    if (!uploaded.ok) return { ok: false, message: uploaded.message };

    const { error } = await client
      .from("profiles")
      .update({ avatar_url: uploaded.publicUrl, updated_at: new Date().toISOString() })
      .eq("id", hubSession.user.id);
    if (error) return { ok: false, message: publicIdentifierError(error, "Avatar save failed.") };

    if (previous?.avatarUrl && previous.avatarUrl !== uploaded.publicUrl) {
      void tryRemoveHubAvatarObject({
        client,
        supabaseUrl: storage.url,
        avatarUrl: previous.avatarUrl,
      });
    }
    await mirrorAvatarBestEffort(options, uploaded.publicUrl);
    return { ok: true, message: "Avatar updated.", avatarUrl: uploaded.publicUrl };
  }

  async function onClearAvatar(): Promise<HubFullAccountAuthResult> {
    const client = await readyClient(options);
    if (!client) return { ok: false, message: "Hub identity is not configured." };
    const session = (await client.auth.getSession()).data.session;
    const id = session?.user?.id;
    if (!id) return { ok: false, message: "Not signed in." };

    const previous = await fetchOwnProfileFields(id);
    const { error } = await client
      .from("profiles")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, message: publicIdentifierError(error, "Avatar remove failed.") };

    const storage = options.getHubStorageConfig?.() ?? readClientStorageConfig(client);
    if (storage && previous?.avatarUrl) {
      void tryRemoveHubAvatarObject({
        client,
        supabaseUrl: storage.url,
        avatarUrl: previous.avatarUrl,
      });
    }
    await mirrorAvatarBestEffort(options, null);
    return { ok: true, message: "Avatar removed." };
  }

  return {
    onResolveRole,
    onUpdateUsername,
    onLinkEmail,
    onUpdatePassword,
    fetchOwnProfileFields,
    onUpdateOwnProfile,
    onUploadAvatar,
    onClearAvatar,
  };
}
