import { useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import type { HubIdentitySnapshot } from "./hub-identity-cache";

export const HUB_IDENTITY_RELAY_MESSAGE_TYPE = "P0004_HUB_IDENTITY_SESSION" as const;
export const HUB_IDENTITY_RELAY_REQUEST_TYPE = "P0004_HUB_IDENTITY_SESSION_REQUEST" as const;

export type HubIdentityRelayRequestMessage = {
  type: typeof HUB_IDENTITY_RELAY_REQUEST_TYPE;
};

export type HubIdentityRelayMessage = {
  type: typeof HUB_IDENTITY_RELAY_MESSAGE_TYPE;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number | null;
  user_id?: string | null;
  user_email?: string | null;
  supabase_url?: string;
  supabase_anon_key?: string;
};

export type HubIdentityRelaySnapshot = Omit<HubIdentitySnapshot, "cached_at">;

export function buildHubIdentityRelayMessage(
  session: Session,
  supabaseUrl: string,
  supabaseAnonKey: string,
): HubIdentityRelayMessage {
  return {
    type: HUB_IDENTITY_RELAY_MESSAGE_TYPE,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    user_id: session.user?.id ?? null,
    user_email: session.user?.email ?? null,
    supabase_url: supabaseUrl,
    supabase_anon_key: supabaseAnonKey,
  };
}

export function parseHubIdentityRelayMessage(data: unknown): HubIdentityRelaySnapshot | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as HubIdentityRelayMessage;
  if (msg.type !== HUB_IDENTITY_RELAY_MESSAGE_TYPE) return null;
  if (!msg.access_token?.trim() || !msg.supabase_url?.trim() || !msg.supabase_anon_key?.trim()) {
    return null;
  }
  return {
    access_token: msg.access_token,
    refresh_token: msg.refresh_token ?? "",
    expires_at: msg.expires_at ?? null,
    user_id: msg.user_id ?? null,
    user_email: msg.user_email ?? null,
    supabase_url: msg.supabase_url,
    supabase_anon_key: msg.supabase_anon_key,
  };
}

export function readReturnToFromLocation(search = window.location.search): string | null {
  const value = new URLSearchParams(search).get("returnTo");
  return value?.trim() || null;
}

/** Tool Hub (P0004) → opener workspace after `?returnTo=` popup sign-in. */
/** Local dev + deployed workspace tool origins (child windows opened from Tool Hub). */
export function isWorkspaceToolOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    if (hostname === "127.0.0.1" || hostname === "localhost") return true;
    if (hostname === "infi.io.vn" || hostname.endsWith(".infi.io.vn")) return true;
    return hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export function requestHubIdentityFromOpener(): boolean {
  if (typeof window === "undefined" || !window.opener || window.opener === window) return false;
  try {
    window.opener.postMessage(
      { type: HUB_IDENTITY_RELAY_REQUEST_TYPE } satisfies HubIdentityRelayRequestMessage,
      "*",
    );
    return true;
  } catch {
    return false;
  }
}

export function createHubIdentityRelayRespondHandler(
  getSession: () => Session | null,
  supabaseUrl: string,
  supabaseAnonKey: string,
  isAllowedRequestOrigin: (origin: string) => boolean = isWorkspaceToolOrigin,
): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object" || (data as HubIdentityRelayRequestMessage).type !== HUB_IDENTITY_RELAY_REQUEST_TYPE) {
      return;
    }
    if (!isAllowedRequestOrigin(event.origin)) return;
    const source = event.source;
    if (!source || typeof (source as Window).postMessage !== "function") return;

    const session = getSession();
    if (!session?.access_token?.trim() || !supabaseUrl.trim() || !supabaseAnonKey.trim()) return;

    const payload = buildHubIdentityRelayMessage(session, supabaseUrl, supabaseAnonKey);
    try {
      (source as Window).postMessage(payload, event.origin);
    } catch {
      // ignore cross-origin post failures
    }
  };
}

export type UseHubIdentityRelayRequestOptions = {
  enabled?: boolean;
  hasSession: boolean;
};

/** Workspace tool — ask Tool Hub opener for Hub session on cold boot (popup / new tab). */
export function useHubIdentityRelayRequest({
  enabled = true,
  hasSession,
}: UseHubIdentityRelayRequestOptions): void {
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasSession || requestedRef.current) return;
    if (!window.opener || window.opener === window) return;

    requestedRef.current = true;
    requestHubIdentityFromOpener();
    const retry = window.setTimeout(() => {
      requestHubIdentityFromOpener();
    }, 500);
    return () => window.clearTimeout(retry);
  }, [enabled, hasSession]);
}

export type UseHubIdentityRelayRespondOptions = {
  session: Session | null;
  enabled?: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  isAllowedRequestOrigin?: (origin: string) => boolean;
};

/** Tool Hub (P0004) — respond to child tool session requests. */
export function useHubIdentityRelayRespond({
  session,
  enabled = true,
  supabaseUrl,
  supabaseAnonKey,
  isAllowedRequestOrigin = isWorkspaceToolOrigin,
}: UseHubIdentityRelayRespondOptions): void {
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (!enabled) return;
    const handler = createHubIdentityRelayRespondHandler(
      () => sessionRef.current,
      supabaseUrl,
      supabaseAnonKey,
      isAllowedRequestOrigin,
    );
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [enabled, supabaseUrl, supabaseAnonKey, isAllowedRequestOrigin]);
}

export function relayHubIdentityToOpener(
  session: Session,
  supabaseUrl: string,
  supabaseAnonKey: string,
  returnTo?: string | null,
): boolean {
  const targetUrl = returnTo ?? readReturnToFromLocation();
  if (!targetUrl) return false;

  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return false;
  }

  if (!window.opener || window.opener === window) return false;

  const payload = buildHubIdentityRelayMessage(session, supabaseUrl, supabaseAnonKey);
  try {
    window.opener.postMessage(payload, target.origin);
    const params = new URLSearchParams(window.location.search);
    params.delete("returnTo");
    const qs = params.toString();
    const path = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", path);
    return true;
  } catch {
    return false;
  }
}

export function createHubIdentityRelayMessageHandler(
  isToolHubOrigin: (origin: string) => boolean,
  onReceived: (snapshot: HubIdentityRelaySnapshot) => void,
): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (!isToolHubOrigin(event.origin)) return;
    const snapshot = parseHubIdentityRelayMessage(event.data);
    if (!snapshot) return;
    onReceived(snapshot);
  };
}

export type UseHubReturnToRelayOptions = {
  session: Session | null;
  enabled?: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

/** P0004 — relay Hub session to workspace opener after popup `?returnTo=` sign-in. */
export function useHubReturnToRelay({
  session,
  enabled = true,
  supabaseUrl,
  supabaseAnonKey,
}: UseHubReturnToRelayOptions): void {
  const sentRef = useRef(false);

  useEffect(() => {
    if (!enabled || !session || sentRef.current) return;
    if (relayHubIdentityToOpener(session, supabaseUrl, supabaseAnonKey)) {
      sentRef.current = true;
    }
  }, [enabled, session, supabaseUrl, supabaseAnonKey]);
}

export type UseHubIdentityRelayReceiveOptions = {
  isToolHubOrigin: (origin: string) => boolean;
  onReceived: (snapshot: HubIdentityRelaySnapshot) => void;
};

/** Workspace tool — listen for `P0004_HUB_IDENTITY_SESSION` postMessage. */
export function useHubIdentityRelayReceive({
  isToolHubOrigin,
  onReceived,
}: UseHubIdentityRelayReceiveOptions): void {
  const onReceivedRef = useRef(onReceived);
  onReceivedRef.current = onReceived;

  useEffect(() => {
    const handler = createHubIdentityRelayMessageHandler(isToolHubOrigin, (snapshot) => {
      onReceivedRef.current(snapshot);
    });
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isToolHubOrigin]);
}
