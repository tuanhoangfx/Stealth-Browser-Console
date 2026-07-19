import {
  cacheHubIdentity,
  readHubIdentity,
  subscribeHubIdentity,
  type HubIdentitySnapshot,
} from "./hub-identity-cache";
import { HUB_DEV_ORIGIN, HUB_PRODUCTION_ORIGIN } from "./hub-identity-urls";

export const HUB_IDENTITY_BRIDGE_MESSAGE_TYPE = "x1z10:hub-identity-bridge-v1" as const;
export const HUB_IDENTITY_BRIDGE_PATH = "/hub-identity-bridge.html";

type BridgeMessage = {
  type: typeof HUB_IDENTITY_BRIDGE_MESSAGE_TYPE;
  action: "get" | "set" | "get-result" | "set-result";
  snapshot?: Omit<HubIdentitySnapshot, "cached_at"> | null;
  ok?: boolean;
};

function resolveDefaultHubOrigin(): string {
  if (typeof window === "undefined") return HUB_DEV_ORIGIN;
  const host = window.location.hostname.toLowerCase();
  if (host === "127.0.0.1" || host === "localhost") return HUB_DEV_ORIGIN;
  return HUB_PRODUCTION_ORIGIN;
}

function isBridgeMessage(data: unknown): data is BridgeMessage {
  return Boolean(
    data &&
      typeof data === "object" &&
      (data as BridgeMessage).type === HUB_IDENTITY_BRIDGE_MESSAGE_TYPE,
  );
}

/**
 * Cross-origin Hub identity SSOT via a static Hub iframe (`/hub-identity-bridge.html`).
 * localStorage / BroadcastChannel do not cross ports or subdomains — without this,
 * a refresh-token rotation on tool A invalidates tool B's cached refresh_token and
 * forces a repeated Login. Tools pull on focus and push after local cache writes.
 */
export function startHubIdentityCrossOriginBridge(opts?: {
  hubOrigin?: string;
}): { stop: () => void } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { stop: () => {} };
  }

  const hubOrigin = (opts?.hubOrigin ?? resolveDefaultHubOrigin()).replace(/\/$/, "");
  // Hub itself owns the storage — no iframe needed.
  if (window.location.origin === hubOrigin) {
    return { stop: () => {} };
  }

  let iframe: HTMLIFrameElement | null = document.querySelector(
    `iframe[data-hub-identity-bridge="1"]`,
  );
  let ready = false;
  const pending: Array<(ok: boolean) => void> = [];

  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.dataset.hubIdentityBridge = "1";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.cssText =
      "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:0;top:0;";
    iframe.src = `${hubOrigin}${HUB_IDENTITY_BRIDGE_PATH}`;
    document.documentElement.appendChild(iframe);
  }

  const flushPending = (ok: boolean) => {
    ready = ok;
    while (pending.length) pending.shift()?.(ok);
  };

  const onIframeLoad = () => flushPending(true);
  iframe.addEventListener("load", onIframeLoad);
  if (iframe.contentDocument?.readyState === "complete") flushPending(true);

  const whenReady = (): Promise<boolean> => {
    if (ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(false), 2500);
      pending.push((ok) => {
        window.clearTimeout(timer);
        resolve(ok);
      });
    });
  };

  const pushLocalToHub = async () => {
    const snap = readHubIdentity();
    if (!snap?.access_token || !iframe?.contentWindow) return;
    const ok = await whenReady();
    if (!ok) return;
    const payload: BridgeMessage = {
      type: HUB_IDENTITY_BRIDGE_MESSAGE_TYPE,
      action: "set",
      snapshot: {
        access_token: snap.access_token,
        refresh_token: snap.refresh_token,
        expires_at: snap.expires_at ?? null,
        user_id: snap.user_id,
        user_email: snap.user_email,
        supabase_url: snap.supabase_url,
        supabase_anon_key: snap.supabase_anon_key,
      },
    };
    try {
      iframe.contentWindow.postMessage(payload, hubOrigin);
    } catch {
      /* ignore */
    }
  };

  const pullFromHub = async () => {
    if (!iframe?.contentWindow) return;
    const ok = await whenReady();
    if (!ok) return;
    try {
      iframe.contentWindow.postMessage(
        { type: HUB_IDENTITY_BRIDGE_MESSAGE_TYPE, action: "get" } satisfies BridgeMessage,
        hubOrigin,
      );
    } catch {
      /* ignore */
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== hubOrigin) return;
    if (!isBridgeMessage(event.data)) return;
    if (event.data.action !== "get-result") return;
    const remote = event.data.snapshot;
    if (!remote?.access_token?.trim()) return;
    const local = readHubIdentity();
    const remoteExp = remote.expires_at ?? 0;
    const localExp = local?.expires_at ?? 0;
    // Adopt when Hub has a newer (or equal but different) token — covers refresh rotation.
    if (local?.access_token === remote.access_token && local?.refresh_token === remote.refresh_token) {
      return;
    }
    if (local && localExp > remoteExp && local.refresh_token && local.access_token) {
      // Local is newer — push up instead.
      void pushLocalToHub();
      return;
    }
    cacheHubIdentity(remote, "cross-origin");
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") void pullFromHub();
  };

  window.addEventListener("message", onMessage);
  window.addEventListener("focus", pullFromHub);
  document.addEventListener("visibilitychange", onVisibility);

  const unsubLocal = subscribeHubIdentity((detail) => {
    if (detail.source === "cross-origin") return;
    if (detail.type === "updated") void pushLocalToHub();
  });

  // Initial sync
  void pullFromHub();
  void pushLocalToHub();

  return {
    stop: () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", pullFromHub);
      document.removeEventListener("visibilitychange", onVisibility);
      iframe?.removeEventListener("load", onIframeLoad);
      unsubLocal();
    },
  };
}
