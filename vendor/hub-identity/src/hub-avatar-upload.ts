/**
 * Hub `avatars` Storage upload — Bearer fetch (same pattern as Todo attachments).
 * Avoid awaiting GoTrue setSession on the upload path.
 */
import type { Session, SupabaseClient } from "@supabase/supabase-js";

export const HUB_AVATAR_BUCKET = "avatars";
export const HUB_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const HUB_AVATAR_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const HUB_AVATAR_UPLOAD_TIMEOUT_MS = 20_000;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function hubAvatarExt(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

export function assertHubAvatarFile(file: File): void {
  const type = file.type || "";
  if (!ALLOWED_MIME.has(type) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    throw new Error("Avatar must be JPEG, PNG, WebP, or GIF.");
  }
  if (file.size > HUB_AVATAR_MAX_BYTES) {
    throw new Error("Avatar must be 2 MB or smaller.");
  }
}

export function hubAvatarObjectPath(userId: string, file: File): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}`;
  return `${userId}/${id}.${hubAvatarExt(file)}`;
}

export function hubAvatarPublicUrl(supabaseUrl: string, objectPath: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const encoded = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/storage/v1/object/public/${HUB_AVATAR_BUCKET}/${encoded}`;
}

async function uploadHubAvatarObject(input: {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  path: string;
  file: File;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = input.timeoutMs ?? HUB_AVATAR_UPLOAD_TIMEOUT_MS;
  const base = input.supabaseUrl.replace(/\/+$/, "");
  const encodedPath = input.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `${base}/storage/v1/object/${HUB_AVATAR_BUCKET}/${encodedPath}`;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer =
    controller &&
    setTimeout(() => {
      controller.abort();
    }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        apikey: input.anonKey,
        "Content-Type": input.file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: input.file,
      signal: controller?.signal,
    });
    if (!response.ok) {
      let detail = "";
      try {
        const json = (await response.json()) as { message?: string; error?: string };
        detail = json.message || json.error || "";
      } catch {
        detail = await response.text().catch(() => "");
      }
      throw new Error(detail || `HTTP ${response.status}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Avatar upload timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type HubAvatarUploadResult = { ok: true; publicUrl: string; path: string } | { ok: false; message: string };

/**
 * Upload avatar to Hub Storage and return the public URL (caller updates profiles.avatar_url).
 */
export async function uploadHubAvatarObjectForSession(input: {
  supabaseUrl: string;
  anonKey: string;
  session: Session;
  file: File;
}): Promise<HubAvatarUploadResult> {
  try {
    assertHubAvatarFile(input.file);
    const path = hubAvatarObjectPath(input.session.user.id, input.file);
    await uploadHubAvatarObject({
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      accessToken: input.session.access_token,
      path,
      file: input.file,
    });
    return {
      ok: true,
      path,
      publicUrl: hubAvatarPublicUrl(input.supabaseUrl, path),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Best-effort remove previous object when URL is a Hub avatars public URL. */
export async function tryRemoveHubAvatarObject(input: {
  client: SupabaseClient;
  supabaseUrl: string;
  avatarUrl: string | null | undefined;
}): Promise<void> {
  const url = String(input.avatarUrl ?? "").trim();
  if (!url) return;
  const marker = `/storage/v1/object/public/${HUB_AVATAR_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return;
  const objectPath = decodeURIComponent(url.slice(idx + marker.length).split("?")[0] ?? "");
  if (!objectPath || objectPath.includes("..")) return;
  try {
    await input.client.storage.from(HUB_AVATAR_BUCKET).remove([objectPath]);
  } catch {
    /* ignore */
  }
}
