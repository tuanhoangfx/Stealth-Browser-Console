/** Relays Tool Manager session + bindings into extension storage (same-origin postMessage). */
const ORIGINS = new Set([
  "http://127.0.0.1:5176",
  "http://127.0.0.1:5177",
  "https://infi.io.vn",
  "https://databox.infi.io.vn",
  "https://tool-manager-zeta.vercel.app",
  "https://tool-hub.vercel.app",
]);

function isAllowedOrigin(origin) {
  if (ORIGINS.has(origin)) return true;
  if (origin.endsWith(".vercel.app")) return true;
  if (origin.endsWith(".infi.io.vn")) return true;
  return false;
}

function relayIdentityAuth(detail) {
  if (!detail?.access_token && !detail?.supabase_url) return;
  chrome.runtime.sendMessage({
    type: "STORE_IDENTITY",
    relayOnly: true,
    access_token: detail.access_token,
    refresh_token: detail.refresh_token,
    expires_at: detail.expires_at,
    supabase_url: detail.supabase_url,
    supabase_anon_key: detail.supabase_anon_key,
    user_id: detail.user_id ?? null,
    user_email: detail.user_email ?? null,
  });
}

function relayAuth(detail) {
  if (!detail?.access_token && !detail?.supabase_url) return;
  chrome.runtime.sendMessage({
    type: "STORE_AUTH",
    relayOnly: true,
    access_token: detail.access_token,
    refresh_token: detail.refresh_token,
    expires_at: detail.expires_at,
    supabase_url: detail.supabase_url,
    supabase_anon_key: detail.supabase_anon_key,
    user_id: detail.user_id ?? null,
    user_email: detail.user_email ?? null,
  });
}

function relayBindings(bindings) {
  chrome.runtime.sendMessage({ type: "PULL_CLOUD_ROUTES", reason: "tool-bindings-relay", hintedRoutes: bindings?.length ?? 0 }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn("[E0001] PULL_CLOUD_ROUTES", chrome.runtime.lastError.message);
    } else if (res && !res.ok) {
      console.warn("[E0001] PULL_CLOUD_ROUTES", res.error);
    }
  });
}

function relayPrefs(prefs) {
  if (!prefs) return;
  chrome.runtime.sendMessage({
    type: "STORE_PREFS",
    realtimeVaultApply: prefs.realtimeVaultApply,
    bridgeRole: prefs.bridgeRole === "reader" ? "reader" : "writer",
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!isAllowedOrigin(event.origin)) return;
  const t = event.data?.type;
  if (t === "E0001_HUB_IDENTITY_AUTH") relayIdentityAuth(event.data);
  if (t === "E0001_COOKIE_BRIDGE_AUTH") relayAuth(event.data);
  if (t === "E0001_COOKIE_BRIDGE_BINDINGS") relayBindings(event.data.bindings);
  if (t === "E0001_COOKIE_BRIDGE_PREFS") relayPrefs(event.data);
  // Manual-only: no web → SYNC_NOW relay (use extension Sync button per route).
  if (t === "E0001_COOKIE_BRIDGE_SELECT") {
    chrome.runtime.sendMessage({
      type: "SET_SELECTED_BINDING",
      noteId: event.data?.noteId,
    });
  }
});

document.addEventListener("e0001-bridge-auth", (event) => {
  relayAuth(event.detail);
});

document.addEventListener("e0001-hub-identity-auth", (event) => {
  relayIdentityAuth(event.detail);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "REQUEST_TOOL_BINDINGS_RELAY") return false;
  window.postMessage({ type: "P0020_REQUEST_BINDINGS_FROM_EXTENSION" }, window.location.origin);
  sendResponse({ ok: true });
  return true;
});
