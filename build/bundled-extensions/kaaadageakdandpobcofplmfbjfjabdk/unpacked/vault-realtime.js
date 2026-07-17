/** Supabase Realtime on route/vault tables — refresh route config and apply vault when another browser syncs. */

import {
  getBrowserId,
  mergeNoteSyncedAtForNote,
  mergeVaultRowIntoBindingStatus,
  normalizeRouteDomain,
} from "./vault-api.js";

let socket = null;
let vaultSockets = [];
let reconnectTimer = null;
let heartbeatTimer = null;

const VAULT_NOTE_PAGE_SIZE = 50;

function userIdFromJwt(token) {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function wsUrl(auth) {
  const base = auth.supabase_url.replace(/^https:/, "wss:").replace(/\/$/, "");
  return `${base}/realtime/v1/websocket?apikey=${encodeURIComponent(auth.supabase_anon_key)}&vsn=1.0.0`;
}

function send(sock, topic, event, payload, ref) {
  sock.send(JSON.stringify([ref, ref, topic, event, payload]));
}

export function stopVaultRealtime() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (socket) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
    socket = null;
  }
  for (const s of vaultSockets) {
    try {
      s.close();
    } catch {
      /* ignore */
    }
  }
  vaultSockets = [];
}

export function startVaultRealtime(auth, bindings, prefs, getBindings, onRoutesChanged) {
  stopVaultRealtime();
  if (prefs?.routeDbRealtime === false || !auth?.access_token || !auth?.supabase_url) return;

  const noteIds = bindings.map((b) => b.noteId?.trim()).filter(Boolean);

  const userId = userIdFromJwt(auth.access_token);
  if (!userId) return;

  let ref = 0;
  const nextRef = () => {
    ref += 1;
    return String(ref);
  };

  const uniqueNoteIds = Array.from(new Set(noteIds)).filter(Boolean);
  const pages = [];
  for (let i = 0; i < uniqueNoteIds.length; i += VAULT_NOTE_PAGE_SIZE) {
    pages.push(uniqueNoteIds.slice(i, i + VAULT_NOTE_PAGE_SIZE));
  }

  const buildVaultChanges = (noteIdPage) => {
    const list = (noteIdPage ?? []).map((noteId) => ({
      event: "*",
      schema: "public",
      table: "note_cookie_vault",
      filter: `note_id=eq.${noteId}`,
    }));
    if (!list.length) {
      list.push({
        event: "*",
        schema: "public",
        table: "note_cookie_vault",
        filter: `user_id=eq.${userId}`,
      });
    }
    return list;
  };

  const connect = () => {
    const sock = new WebSocket(wsUrl(auth));
    socket = sock;

    sock.addEventListener("open", () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) {
          send(sock, "phoenix", "heartbeat", {}, nextRef());
        }
      }, 25_000);

      const routeJoinRef = nextRef();
      send(
        sock,
        `realtime:public:cookie_bridge_routes`,
        "phx_join",
        {
          config: {
            broadcast: { self: false },
            presence: { key: "" },
            postgres_changes: [
              {
                event: "*",
                schema: "public",
                table: "cookie_bridge_routes",
                filter: `user_id=eq.${userId}`,
              },
            ],
          },
          access_token: auth.access_token,
        },
        routeJoinRef,
      );

      send(
        sock,
        "realtime:public:notes",
        "phx_join",
        {
          config: {
            broadcast: { self: false },
            presence: { key: "" },
            postgres_changes: [
              {
                event: "UPDATE",
                schema: "public",
                table: "notes",
                filter: `user_id=eq.${userId}`,
              },
            ],
          },
          access_token: auth.access_token,
        },
        nextRef(),
      );

      send(
        sock,
        "realtime:public:cookie_route_user_activity",
        "phx_join",
        {
          config: {
            broadcast: { self: false },
            presence: { key: "" },
            postgres_changes: [
              {
                event: "*",
                schema: "public",
                table: "cookie_route_user_activity",
                filter: `user_id=eq.${userId}`,
              },
            ],
          },
          access_token: auth.access_token,
        },
        nextRef(),
      );

      for (const [topic, filter] of [
        ["realtime:public:note_cookie_members:owner", `owner_user_id=eq.${userId}`],
        ["realtime:public:note_cookie_members:grantee", `grantee_user_id=eq.${userId}`],
      ]) {
        send(
          sock,
          topic,
          "phx_join",
          {
            config: {
              broadcast: { self: false },
              presence: { key: "" },
              postgres_changes: [
                {
                  event: "*",
                  schema: "public",
                  table: "note_cookie_members",
                  filter,
                },
              ],
            },
            access_token: auth.access_token,
          },
          nextRef(),
        );
      }

      // Page 1 uses the main socket (metadata always; cookie apply gated in handler).
      const firstPage = pages[0] ?? [];
      const vaultJoinRef = nextRef();
      send(sock, `realtime:public:note_cookie_vault`, "phx_join", {
        config: {
          broadcast: { self: false },
          presence: { key: "" },
          postgres_changes: buildVaultChanges(firstPage),
        },
        access_token: auth.access_token,
      }, vaultJoinRef);

      // Extra pages use dedicated sockets to avoid oversized single-join payloads.
      vaultSockets = [];
      for (const page of pages.slice(1)) {
        const vs = new WebSocket(wsUrl(auth));
        vaultSockets.push(vs);
        let vref = 0;
        const nextVRef = () => String(++vref);
        let vHeartbeat = null;
        vs.addEventListener("open", () => {
          vHeartbeat = setInterval(() => {
            if (vs.readyState === WebSocket.OPEN) send(vs, "phoenix", "heartbeat", {}, nextVRef());
          }, 25_000);
          send(vs, `realtime:public:note_cookie_vault`, "phx_join", {
            config: {
              broadcast: { self: false },
              presence: { key: "" },
              postgres_changes: buildVaultChanges(page),
            },
            access_token: auth.access_token,
          }, nextVRef());
        });
        const cleanup = () => {
          if (vHeartbeat) clearInterval(vHeartbeat);
          vHeartbeat = null;
        };
        vs.addEventListener("close", cleanup);
        vs.addEventListener("error", () => {
          cleanup();
          try {
            vs.close();
          } catch {
            /* ignore */
          }
        });
        // Note: message handler is shared below (we listen on main socket only).
      }
    });

    const handleVaultMessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const [, , topic, event, payload] = msg;
        if (event !== "postgres_changes") return;
        if (topic === "realtime:public:cookie_bridge_routes" || topic.startsWith("realtime:public:note_cookie_members")) {
          await onRoutesChanged?.();
          return;
        }
        if (topic === "realtime:public:notes") {
          const row = payload?.data?.record ?? payload?.record ?? payload?.data?.new;
          const syncedAt = row?.synced_at ?? row?.syncedAt;
          if (!row?.id || !syncedAt) return;
          const current = await getBindings();
          const metaChanged = await mergeNoteSyncedAtForNote(row.id, syncedAt, current);
          if (metaChanged) {
            await chrome.storage.local.set({ "e0001-ui-tick-v1": Date.now() });
          }
          return;
        }
        if (topic === "realtime:public:cookie_route_user_activity") {
          await chrome.storage.local.set({ "e0001-ui-tick-v1": Date.now() });
          return;
        }
        if (topic !== "realtime:public:note_cookie_vault") return;
        const row = payload?.data?.record ?? payload?.record ?? payload?.data?.new;
        if (!row?.note_id || !row?.domain) return;

        const browserId = await getBrowserId();
        if (row.source_browser === browserId) return;

        const current = await getBindings();
        const rowDomain = normalizeRouteDomain(row.domain);
        const hit = current.find(
          (b) => b.noteId === row.note_id && normalizeRouteDomain(b.domain) === rowDomain,
        );
        if (!hit) return;
        const metaChanged = await mergeVaultRowIntoBindingStatus(hit, row);
        if (metaChanged) {
          await chrome.storage.local.set({ "e0001-ui-tick-v1": Date.now() });
        }
        // Manual-only: never auto-apply vault into this browser (use Extension Load per route).
      } catch (err) {
        console.error("[E0001] vault realtime message", err);
      }
    };

    sock.addEventListener("message", handleVaultMessage);
    // Also listen on extra vault sockets.
    for (const vs of vaultSockets) {
      vs.addEventListener("message", handleVaultMessage);
    }

    sock.addEventListener("close", () => {
      socket = null;
      reconnectTimer = setTimeout(async () => {
        const latest = await getBindings();
        if (!latest.length) return;
        connect();
      }, 5000);
    });

    sock.addEventListener("error", () => {
      try {
        sock.close();
      } catch {
        /* ignore */
      }
    });
  };

  connect();
}
