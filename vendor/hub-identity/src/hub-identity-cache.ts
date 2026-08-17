/** Cross-tab Tool Hub JWT cache — localStorage SSOT + BroadcastChannel sync (same origin). */

export type HubIdentitySnapshot = {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  user_id: string | null;
  user_email: string | null;
  supabase_url: string;
  supabase_anon_key: string;
  cached_at: number;
};

export const HUB_IDENTITY_STORAGE_KEY = "x1z10:hub-identity-v2";
export const HUB_IDENTITY_BC_CHANNEL = "x1z10:hub-identity";
export const HUB_IDENTITY_EVENT = "x1z10:hub-identity";
export const HUB_IDENTITY_SIGNED_OUT_KEY = "x1z10:hub-identity-signed-out";
/** Sign-out intent window — cross-origin pulls must not re-adopt the token we just dropped. */
export const HUB_IDENTITY_SIGN_OUT_TTL_MS = 60_000;

const LEGACY_STORAGE_KEYS = ["p0016:hub-identity-v1", "p0020:hub-identity-v1"] as const;

export type HubIdentityChangeDetail = {
  source?: string;
  type: "updated" | "cleared";
};

type BroadcastPayload = {
  type: "updated" | "cleared";
  source?: string;
};

let bc: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!bc) bc = new BroadcastChannel(HUB_IDENTITY_BC_CHANNEL);
  return bc;
}

function notifyLocal(detail: HubIdentityChangeDetail) {
  window.dispatchEvent(new CustomEvent(HUB_IDENTITY_EVENT, { detail }));
  // Backward compat for existing listeners during rollout.
  window.dispatchEvent(new CustomEvent("p0016:hub-identity", { detail }));
  window.dispatchEvent(new CustomEvent("p0020:hub-identity", { detail }));
}

function broadcastChange(detail: HubIdentityChangeDetail) {
  getBroadcastChannel()?.postMessage({
    type: detail.type,
    source: detail.source,
  } satisfies BroadcastPayload);
  notifyLocal(detail);
}

function migrateLegacyStorage(): HubIdentitySnapshot | null {
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
      if (!raw) continue;
      const snap = JSON.parse(raw) as HubIdentitySnapshot;
      if (!snap?.access_token && !snap?.user_email) continue;
      const migrated: HubIdentitySnapshot = { ...snap, cached_at: snap.cached_at ?? Date.now() };
      localStorage.setItem(HUB_IDENTITY_STORAGE_KEY, JSON.stringify(migrated));
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
      return migrated;
    } catch {
      /* skip corrupt legacy row */
    }
  }
  return null;
}

export function readHubIdentity(): HubIdentitySnapshot | null {
  try {
    const raw = localStorage.getItem(HUB_IDENTITY_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as HubIdentitySnapshot;
    return migrateLegacyStorage();
  } catch {
    return null;
  }
}

/** Record a deliberate sign-out so a stale cross-origin snapshot cannot restore the session. */
export function markHubIdentitySignedOut(at: number = Date.now()): void {
  try {
    localStorage.setItem(HUB_IDENTITY_SIGNED_OUT_KEY, String(at));
  } catch {
    /* ignore quota */
  }
}

export function clearHubIdentitySignOutMark(): void {
  try {
    localStorage.removeItem(HUB_IDENTITY_SIGNED_OUT_KEY);
  } catch {
    /* ignore */
  }
}

export function isHubIdentitySignOutFresh(ttlMs: number = HUB_IDENTITY_SIGN_OUT_TTL_MS): boolean {
  try {
    const raw = localStorage.getItem(HUB_IDENTITY_SIGNED_OUT_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    if (Date.now() - at <= ttlMs) return true;
    localStorage.removeItem(HUB_IDENTITY_SIGNED_OUT_KEY);
    return false;
  } catch {
    return false;
  }
}

export function cacheHubIdentity(
  payload: Omit<HubIdentitySnapshot, "cached_at">,
  source?: string,
): void {
  if (source === "cross-origin" && isHubIdentitySignOutFresh()) return;
  if (source !== "cross-origin" && payload.access_token?.trim()) clearHubIdentitySignOutMark();
  const prev = readHubIdentity();
  const snapshot: HubIdentitySnapshot = { ...payload, cached_at: Date.now() };
  if (
    prev?.access_token === snapshot.access_token &&
    prev?.refresh_token === snapshot.refresh_token &&
    prev?.user_id === snapshot.user_id &&
    prev?.expires_at === snapshot.expires_at
  ) {
    return;
  }
  localStorage.setItem(HUB_IDENTITY_STORAGE_KEY, JSON.stringify(snapshot));
  broadcastChange({ type: "updated", source });
}

function hasStoredHubIdentity(): boolean {
  try {
    if (localStorage.getItem(HUB_IDENTITY_STORAGE_KEY)) return true;
    return LEGACY_STORAGE_KEYS.some(
      (key) => sessionStorage.getItem(key) || localStorage.getItem(key),
    );
  } catch {
    return false;
  }
}

export function clearHubIdentity(source?: string): void {
  // Repeat clears on an already-empty cache would broadcast `cleared` on every
  // caller render and flicker every subscriber (footer label, host embeds).
  const hadIdentity = hasStoredHubIdentity();
  localStorage.removeItem(HUB_IDENTITY_STORAGE_KEY);
  for (const key of LEGACY_STORAGE_KEYS) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }
  if (!hadIdentity) return;
  broadcastChange({ type: "cleared", source });
}

export function getHubAccessToken(): string | null {
  return readHubIdentity()?.access_token?.trim() || null;
}

export function snapshotFromSupabaseSession(
  session: {
    access_token: string;
    refresh_token?: string | null;
    expires_at?: number | null;
    user?: { id?: string; email?: string | null } | null;
  },
  supabaseUrl: string,
  supabaseAnonKey: string,
): Omit<HubIdentitySnapshot, "cached_at"> {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token ?? "",
    expires_at: session.expires_at ?? null,
    user_id: session.user?.id ?? null,
    user_email: session.user?.email ?? null,
    supabase_url: supabaseUrl,
    supabase_anon_key: supabaseAnonKey,
  };
}

/** Same-tab CustomEvent + cross-tab BroadcastChannel + storage (other windows). */
export function subscribeHubIdentity(handler: (detail: HubIdentityChangeDetail) => void): () => void {
  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<HubIdentityChangeDetail>).detail;
    handler(detail ?? { type: "updated" });
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === HUB_IDENTITY_STORAGE_KEY) {
      handler({ type: event.newValue ? "updated" : "cleared", source: "storage" });
    }
  };
  const onBroadcast = (event: MessageEvent<BroadcastPayload>) => {
    if (event.data?.type === "updated" || event.data?.type === "cleared") {
      handler({ type: event.data.type, source: event.data.source ?? "broadcast" });
    }
  };

  window.addEventListener(HUB_IDENTITY_EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  getBroadcastChannel()?.addEventListener("message", onBroadcast);

  return () => {
    window.removeEventListener(HUB_IDENTITY_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
    getBroadcastChannel()?.removeEventListener("message", onBroadcast);
  };
}
