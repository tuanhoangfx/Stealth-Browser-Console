const STORAGE_BINDINGS = "e0001-sync-bindings-v1";
const STORAGE_AUTH = "e0001-bridge-auth-v1";
const TOOL_COOKIE_URL = "http://127.0.0.1:5177/cookie";
const TOOL_PROD_URL = "https://databox.infi.io.vn/cookie";

const root = document.getElementById("bindings");
const msg = document.getElementById("msg");
const authStatus = document.getElementById("auth-status");

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function row(data = {}) {
  const el = document.createElement("div");
  el.className = "row";
  el.innerHTML = `
    <label>Note ID (UUID — from Notes sidebar)</label>
    <input name="noteId" placeholder="5b675aab-4a04-442a-a86f-dab37c4e12e4" value="${esc(data.noteId)}" />
    <label>Sync ID (optional if UUID set)</label>
    <input name="syncId" placeholder="TM-xxxxxxxx" value="${esc(data.syncId)}" />
    <label>Sync pass (if note has pass)</label>
    <input name="pass" type="password" placeholder="••••••••" value="${esc(data.pass)}" />
    <label>Cookie domain</label>
    <input name="domain" placeholder=".facebook.com" value="${esc(data.domain)}" />
    <button type="button" class="btn-remove remove">Remove</button>
  `;
  el.querySelector(".remove").addEventListener("click", () => el.remove());
  return el;
}

function setMsg(text, ok) {
  msg.textContent = text || "";
  msg.className = ok === true ? "ok" : ok === false ? "err" : "";
}

function renderAuthStatus(auth) {
  if (!authStatus) return;
  const hasJwt = Boolean(auth?.access_token);
  const hasSb = Boolean(auth?.supabase_url && auth?.supabase_anon_key);
  if (hasJwt && hasSb) {
    authStatus.textContent = "Linked — session + Supabase OK (auto-sync can run).";
    authStatus.className = "auth-status auth-status--ok";
  } else if (hasSb) {
    authStatus.textContent = "Partial — Supabase URL only. Open Tool → Cookie sync → Link extension.";
    authStatus.className = "auth-status auth-status--warn";
  } else {
    authStatus.textContent = "Not linked — open Tool, sign in, then Link extension (recommended).";
    authStatus.className = "auth-status auth-status--off";
  }
}

function loadBindings() {
  chrome.storage.local.get([STORAGE_BINDINGS, STORAGE_AUTH], (data) => {
    if (chrome.runtime.lastError) {
      setMsg(chrome.runtime.lastError.message, false);
      return;
    }
    const list = data[STORAGE_BINDINGS];
    root.replaceChildren();
    if (Array.isArray(list) && list.length) {
      list.forEach((b) => root.appendChild(row(b)));
    } else {
      root.appendChild(row({ domain: ".facebook.com" }));
    }
    renderAuthStatus(data[STORAGE_AUTH]);
  });
}

function collectBindings() {
  return [...root.querySelectorAll(".row")]
    .map((el) => ({
      noteId: el.querySelector('[name="noteId"]').value.trim(),
      syncId: el.querySelector('[name="syncId"]').value.trim(),
      pass: el.querySelector('[name="pass"]').value,
      domain: el.querySelector('[name="domain"]').value.trim(),
    }))
    .filter((b) => b.domain && (b.syncId || b.noteId));
}

function saveBindings() {
  const bindings = collectBindings();
  if (!bindings.length) {
    setMsg("Add at least one row with domain + Note ID or Sync ID.", false);
    return;
  }
  chrome.runtime.sendMessage({ type: "STORE_BINDINGS", bindings }, (res) => {
    if (chrome.runtime.lastError) {
      setMsg(chrome.runtime.lastError.message, false);
      return;
    }
    setMsg(res?.ok ? `Saved ${res.count} binding(s).` : res?.error || "Save failed", res?.ok);
    if (res?.ok) loadBindings();
  });
}

document.getElementById("add").addEventListener("click", () => {
  root.appendChild(row());
  setMsg("", null);
});

document.getElementById("save").addEventListener("click", saveBindings);

function renderOptionsVersion() {
  const el = document.getElementById("options-ver-meta");
  if (!el) return;
  const v = chrome.runtime.getManifest().version;
  const updated = window.E0001_BUILD?.updated ?? "—";
  el.textContent = `v${v} · updated ${updated} · offline fallback`;
}

renderOptionsVersion();

document.getElementById("open-tool-local")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_TOOL_COOKIE", url: "local" }, () => {
    chrome.tabs.create({ url: TOOL_COOKIE_URL });
  });
});

document.getElementById("open-tool-prod")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_TOOL_COOKIE", url: "prod" }, () => {
    chrome.tabs.create({ url: TOOL_PROD_URL });
  });
});

document.getElementById("apply-vault")?.addEventListener("click", () => {
  setMsg("Loading vault cookies…", true);
  chrome.runtime.sendMessage({ type: "REFRESH_SESSION" }, () => {
    chrome.runtime.sendMessage(
      {
        type: "APPLY_VAULT_NOW",
        clearBeforeLoad: true,
        openSite: true,
        refreshTab: true,
        confirmSession: true,
        vaultPassOverride: "",
      },
      (res) => {
      if (res?.ok) {
        const tabs = res.tabsRefreshed ?? 0;
        setMsg(
          tabs > 0
            ? `Applied cookies · refreshed ${tabs} tab(s).`
            : `Applied cookies — open site tab and F5.`,
          true,
        );
      } else {
        setMsg(res?.error || "Load cookies failed", false);
      }
      },
    );
  });
});

document.getElementById("import-cookie-editor")?.addEventListener("click", () => {
  const ta = document.getElementById("cookie-editor-json");
  const jsonText = ta?.value?.trim();
  if (!jsonText) {
    setMsg("Paste Cookie-Editor JSON first.", false);
    return;
  }
  setMsg("Applying cookies…", true);
  chrome.runtime.sendMessage({ type: "IMPORT_COOKIE_EDITOR", jsonText }, (res) => {
    if (res?.ok) {
      setMsg(`Applied ${res.applied}/${res.total} cookies. Open the site and F5.`, true);
    } else {
      setMsg(res?.error || "Import failed", false);
    }
  });
});

document.getElementById("sync-now")?.addEventListener("click", () => {
  setMsg(
    "Use extension popup → Sync on each route. Bulk Sync here is disabled (manual per route only).",
    false,
  );
});

document.querySelectorAll("[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const domain = btn.getAttribute("data-preset");
    const rows = root.querySelectorAll(".row");
    const last = rows[rows.length - 1];
    const domainInput = last?.querySelector('[name="domain"]');
    if (domainInput) domainInput.value = domain;
    else root.appendChild(row({ domain }));
  });
});

loadBindings();
