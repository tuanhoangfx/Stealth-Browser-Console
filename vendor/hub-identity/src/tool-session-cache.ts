import type { Session } from "@supabase/supabase-js";

export type ToolSessionSnapshot = {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  user_id: string | null;
  user_email: string | null;
  cached_at: number;
};

export type ToolSessionCacheConfig = {
  storageKey: string;
  eventName: string;
  /** Prior sessionStorage keys to migrate once (e.g. p0016:chatcenter-session-v1). */
  legacySessionStorageKeys?: string[];
};

export type ToolSessionCache = {
  storageKey: string;
  eventName: string;
  cache: (session: Session) => void;
  read: () => ToolSessionSnapshot | null;
  clear: () => void;
  sessionFromSnapshot: (snap: ToolSessionSnapshot | null) => Session | null;
  getAccessToken: () => string | null;
};

function snapshotFromSession(session: Session): ToolSessionSnapshot {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token ?? "",
    expires_at: session.expires_at ?? null,
    user_id: session.user?.id ?? null,
    user_email: session.user?.email ?? null,
    cached_at: Date.now(),
  };
}

function sessionFromSnapshot(snap: ToolSessionSnapshot | null): Session | null {
  if (!snap?.access_token?.trim()) return null;
  return {
    access_token: snap.access_token,
    refresh_token: snap.refresh_token ?? "",
    expires_at: snap.expires_at ?? undefined,
    token_type: "bearer",
    user: {
      id: snap.user_id ?? "",
      email: snap.user_email ?? undefined,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "",
    },
  } as Session;
}

/** Workspace data-plane JWT cache — localStorage SSOT with legacy sessionStorage migration. */
export function createToolSessionCache(config: ToolSessionCacheConfig): ToolSessionCache {
  const legacyKeys = config.legacySessionStorageKeys ?? [config.storageKey];

  function migrateLegacy(): ToolSessionSnapshot | null {
    for (const key of legacyKeys) {
      try {
        const fromSession = sessionStorage.getItem(key);
        if (!fromSession) continue;
        const snap = JSON.parse(fromSession) as ToolSessionSnapshot;
        if (!snap?.access_token) continue;
        const migrated = { ...snap, cached_at: snap.cached_at ?? Date.now() };
        localStorage.setItem(config.storageKey, JSON.stringify(migrated));
        sessionStorage.removeItem(key);
        return migrated;
      } catch {
        /* skip corrupt legacy row */
      }
    }
    return null;
  }

  function read(): ToolSessionSnapshot | null {
    try {
      const raw = localStorage.getItem(config.storageKey);
      if (raw) return JSON.parse(raw) as ToolSessionSnapshot;
      return migrateLegacy();
    } catch {
      return null;
    }
  }

  function cache(session: Session): void {
    const snapshot = snapshotFromSession(session);
    const prev = read();
    if (
      prev?.access_token === snapshot.access_token &&
      prev?.refresh_token === snapshot.refresh_token &&
      prev?.user_id === snapshot.user_id
    ) {
      return;
    }
    localStorage.setItem(config.storageKey, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(config.eventName));
  }

  function clear(): void {
    localStorage.removeItem(config.storageKey);
    for (const key of legacyKeys) {
      sessionStorage.removeItem(key);
    }
    window.dispatchEvent(new CustomEvent(config.eventName));
  }

  return {
    storageKey: config.storageKey,
    eventName: config.eventName,
    cache,
    read,
    clear,
    sessionFromSnapshot,
    getAccessToken: () => read()?.access_token?.trim() || null,
  };
}
