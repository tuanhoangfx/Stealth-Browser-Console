const searchEl = document.getElementById("search");
const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");

/** @type {{ profileId: string; apiHost: string; apiPort: number; apiToken?: string } | null} */
let config = null;
/** @type {Array<{ id: string; name: string; platform: string }>} */
let catalog = [];
let running = false;

function apiBase() {
  if (!config) return "";
  return `http://${config.apiHost}:${config.apiPort}`;
}

function apiHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (config?.apiToken) headers["X-Api-Token"] = config.apiToken;
  return headers;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#f87171" : "#94a3b8";
}

async function loadConfig() {
  const res = await fetch(chrome.runtime.getURL("config.json"));
  if (!res.ok) throw new Error("Missing config.json");
  config = await res.json();
}

async function loadCatalog() {
  const res = await fetch(`${apiBase()}/api/workflow-quick-run/catalog`, { headers: apiHeaders() });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  catalog = Array.isArray(data.workflows) ? data.workflows : [];
}

function filteredCatalog(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return catalog;
  return catalog.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      String(item.platform || "").toLowerCase().includes(q),
  );
}

function renderList() {
  const items = filteredCatalog(searchEl.value);
  listEl.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "wqr-empty";
    empty.textContent = catalog.length ? "No workflows match." : "Catalog empty.";
    listEl.appendChild(empty);
    return;
  }
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wqr-item";
    btn.disabled = running;
    btn.innerHTML = `<div class="wqr-item__name">${escapeHtml(item.name)}</div><div class="wqr-item__meta">${escapeHtml(item.platform)} · ${escapeHtml(item.id)}</div>`;
    btn.addEventListener("click", () => void runWorkflow(item.id));
    const li = document.createElement("li");
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function runWorkflow(workflowId) {
  if (!config?.profileId || running) return;
  running = true;
  renderList();
  setStatus(`Running ${workflowId}…`);
  try {
    const res = await fetch(`${apiBase()}/api/workflow-quick-run/run`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ profile_id: config.profileId, workflow_id: workflowId }),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    setStatus(data.ok ? `Started ${workflowId}` : `Failed: ${data.error || "unknown"}`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
  } finally {
    running = false;
    renderList();
  }
}

async function boot() {
  try {
    await loadConfig();
    setStatus(`Profile ${config.profileId} · loading catalog…`);
    await loadCatalog();
    setStatus(`${catalog.length} workflows · profile ${config.profileId}`);
    renderList();
    searchEl.focus();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
    listEl.innerHTML = "";
  }
}

searchEl.addEventListener("input", () => renderList());
void boot();
