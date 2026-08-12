import { hubSyncMirrorPasswordApiUrl } from "./hub-api-routes";

export type SyncMirrorPasswordViaApiOptions = {
  apiUrl?: string;
  mirrorEmail: string;
  password: string;
  loginInput?: string;
};

/** Server-side mirror password sync (Hub-validated → Data Box). */
export async function syncMirrorPasswordViaApi(
  options: SyncMirrorPasswordViaApiOptions,
): Promise<{ ok: boolean; authEmail?: string; via?: string; error?: string }> {
  const url = hubSyncMirrorPasswordApiUrl(options.apiUrl);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: options.mirrorEmail.trim().toLowerCase(),
        password: options.password,
        login: options.loginInput?.trim() ?? "",
      }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; authEmail?: string; via?: string; error?: string }
      | null;
    return {
      ok: Boolean(res.ok && payload?.ok),
      authEmail: payload?.authEmail,
      via: payload?.via,
      error: payload?.error ?? (res.ok ? undefined : `HTTP ${res.status}`),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
