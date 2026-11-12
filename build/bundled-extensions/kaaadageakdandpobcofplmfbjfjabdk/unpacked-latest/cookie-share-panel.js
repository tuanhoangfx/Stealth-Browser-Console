/** Cookie Share from the extension — Hub roster RPC + Data Box member upsert. */

import { refreshAuthIfNeeded, userHeaders } from "./auth-session.js";
import { resolveHubLoginEmails } from "./vendor/hub-identity/hub-resolve-login.js";
import {
  cookieShareRosterLookupEmail,
  cookieShareRosterRowMatchesQuery,
  fetchHubCookieShareUserRoster,
} from "./vendor/hub-identity/hub-cookie-share-user-roster.js";

const STORAGE_IDENTITY = "e0001-hub-identity-v1";
const STORAGE_AUTH = "e0001-bridge-auth-v1";

let rosterCache = { at: 0, rows: [], warning: null, missing: false };
const ROSTER_TTL_MS = 60_000;

export function cookieShareRowMatchesQuery(row, query) {
  return cookieShareRosterRowMatchesQuery(row, query);
}

export async function loadCookieShareRoster(force = false) {
  if (!force && rosterCache.rows.length && Date.now() - rosterCache.at < ROSTER_TTL_MS) {
    return rosterCache;
  }
  const stored = await chrome.storage.local.get(STORAGE_IDENTITY);
  const identity = await refreshAuthIfNeeded(stored?.[STORAGE_IDENTITY] ?? null, STORAGE_IDENTITY);
  const result = await fetchHubCookieShareUserRoster({
    supabaseUrl: identity?.supabase_url,
    anonKey: identity?.supabase_anon_key,
    accessToken: identity?.access_token,
  });
  rosterCache = { at: Date.now(), ...result };
  return rosterCache;
}

export async function listCookieShareMembers(noteId) {
  const id = String(noteId ?? "").trim();
  if (!id) return { ok: false, error: "Route note is missing.", members: [] };
  const stored = await chrome.storage.local.get(STORAGE_AUTH);
  const auth = await refreshAuthIfNeeded(stored?.[STORAGE_AUTH] ?? null, STORAGE_AUTH);
  if (!auth?.access_token || !auth?.supabase_url) {
    return { ok: false, error: "Sign in to load route members.", members: [] };
  }
  const res = await fetch(`${String(auth.supabase_url).replace(/\/$/, "")}/rest/v1/rpc/note_cookie_member_list`, {
    method: "POST",
    headers: userHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify({ p_note_id: id }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: data?.message || `HTTP ${res.status}`, members: [] };
  if (!data || data.ok !== true) {
    return { ok: false, error: String(data?.error || "Load members failed."), members: [] };
  }
  return { ok: true, members: Array.isArray(data.members) ? data.members : [] };
}

export async function upsertCookieShareMember(noteId, row) {
  const id = String(noteId ?? "").trim();
  const loginId = String(row?.login_id ?? "").trim().toLowerCase();
  if (!id || !loginId) return { ok: false, error: "Select a Hub Username." };

  const stored = await chrome.storage.local.get(STORAGE_AUTH);
  const auth = await refreshAuthIfNeeded(stored?.[STORAGE_AUTH] ?? null, STORAGE_AUTH);
  if (!auth?.access_token || !auth?.supabase_url) {
    return { ok: false, error: "Sign in to share route members." };
  }

  let lookupEmail = cookieShareRosterLookupEmail(row);
  if (!lookupEmail.includes("@")) {
    const resolved = await resolveHubLoginEmails(loginId);
    if (resolved.lookup === "ok" && resolved.emails[0]) lookupEmail = resolved.emails[0];
  }

  const res = await fetch(`${String(auth.supabase_url).replace(/\/$/, "")}/rest/v1/rpc/note_cookie_member_upsert`, {
    method: "POST",
    headers: userHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      p_note_id: id,
      p_grantee_email: loginId,
      p_can_apply: true,
      p_can_publish: false,
      p_can_manage: false,
      p_expires_at: null,
      p_lookup_email: lookupEmail,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: data?.message || `HTTP ${res.status}` };
  if (!data || data.ok !== true) return { ok: false, error: String(data?.error || "Save member failed.") };
  return { ok: true, member: data.member };
}

export function cookieShareQueryForWeb(binding) {
  const note = String(binding?.noteId ?? "").trim();
  const domain = String(binding?.domain ?? "").trim();
  const params = new URLSearchParams();
  params.set("share", "1");
  if (note) params.set("note", note);
  if (domain) params.set("domain", domain);
  return params.toString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function memberLoginIds(members) {
  const out = new Set();
  for (const member of members ?? []) {
    const email = String(member?.grantee_email ?? "").trim().toLowerCase();
    if (email && !email.includes("@")) out.add(email);
  }
  return out;
}

export function bindCookieSharePanel({ showToast, openOnWeb, currentLoginId }) {
  const panel = document.getElementById("cookie-share-panel");
  const titleEl = document.getElementById("cookie-share-title");
  const routeEl = document.getElementById("cookie-share-route");
  const searchEl = document.getElementById("cookie-share-search");
  const listEl = document.getElementById("cookie-share-list");
  const statusEl = document.getElementById("cookie-share-status");
  const closeBtn = document.getElementById("cookie-share-close");
  const webBtn = document.getElementById("cookie-share-web");
  if (!panel || !listEl) return { open() {}, close() {} };

  let binding = null;
  let rows = [];
  let granted = new Set();
  let busyLoginId = "";

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function close() {
    panel.hidden = true;
    binding = null;
  }

  function renderList() {
    const query = searchEl?.value || "";
    const selfId = String(currentLoginId?.() ?? "").trim().toLowerCase();
    const visible = rows.filter((row) => {
      const loginId = String(row.login_id ?? "").trim().toLowerCase();
      if (!loginId || loginId === selfId) return false;
      return cookieShareRosterRowMatchesQuery(row, query);
    });
    if (!visible.length) {
      listEl.innerHTML = `<div class="cookie-share-panel__empty">No matches</div>`;
      return;
    }
    listEl.innerHTML = visible
      .slice(0, 80)
      .map((row) => {
        const loginId = String(row.login_id ?? "").trim().toLowerCase();
        const shared = granted.has(loginId);
        const detail = [row.contact_email, row.full_name]
          .map((value) => String(value ?? "").trim())
          .filter((value) => value && value.toLowerCase() !== loginId)
          .join(" · ");
        return `
          <button type="button" class="cookie-share-option${shared ? " is-shared" : ""}" data-login="${escapeHtml(loginId)}" ${shared ? "disabled" : ""}>
            <span class="cookie-share-option__id">${escapeHtml(loginId)}</span>
            ${detail ? `<span class="cookie-share-option__detail">${escapeHtml(detail)}</span>` : ""}
            <span class="cookie-share-option__mark">${shared ? "Shared" : busyLoginId === loginId ? "Sharing…" : "Share Load"}</span>
          </button>
        `;
      })
      .join("");
  }

  async function refresh() {
    if (!binding?.noteId) return;
    setStatus("Loading usernames…");
    const [roster, members] = await Promise.all([loadCookieShareRoster(), listCookieShareMembers(binding.noteId)]);
    rows = roster.rows ?? [];
    granted = memberLoginIds(members.members);
    if (roster.missing) {
      setStatus("Username list needs Hub RPC. Open Data Box to share.");
    } else if (roster.warning) {
      setStatus(roster.warning);
    } else if (!members.ok) {
      setStatus(members.error || "Could not load current shares.");
    } else {
      setStatus(visibleHint(rows.length, granted.size));
    }
    renderList();
  }

  function visibleHint(total, sharedCount) {
    if (!total) return "No Hub users found.";
    return sharedCount ? `${sharedCount} already shared · Load access only` : "Load access only";
  }

  listEl.addEventListener("click", async (event) => {
    const btn = event.target.closest(".cookie-share-option");
    const loginId = btn?.dataset?.login;
    if (!btn || !loginId || !binding?.noteId || busyLoginId) return;
    const row = rows.find((item) => String(item.login_id ?? "").trim().toLowerCase() === loginId);
    if (!row) return;
    busyLoginId = loginId;
    renderList();
    const result = await upsertCookieShareMember(binding.noteId, row);
    busyLoginId = "";
    if (!result.ok) {
      showToast?.(result.error || "Share failed.", "error");
      renderList();
      return;
    }
    granted.add(loginId);
    showToast?.(`Shared Load with ${loginId}`, "success");
    renderList();
  });

  searchEl?.addEventListener("input", () => renderList());
  closeBtn?.addEventListener("click", () => close());
  webBtn?.addEventListener("click", () => {
    if (binding) openOnWeb?.(binding);
  });
  panel.addEventListener("click", (event) => {
    if (event.target === panel) close();
  });

  async function open(nextBinding) {
    binding = nextBinding;
    const noteLabel = nextBinding?.noteTitle?.trim() || nextBinding?.noteId?.slice(0, 8) || "Route";
    if (titleEl) titleEl.textContent = "Share route";
    if (routeEl) routeEl.textContent = `${noteLabel} · ${String(nextBinding?.domain ?? "").replace(/^\./, "")}`;
    if (searchEl) searchEl.value = "";
    panel.hidden = false;
    window.setTimeout(() => searchEl?.focus(), 0);
    await refresh();
  }

  return { open, close };
}
