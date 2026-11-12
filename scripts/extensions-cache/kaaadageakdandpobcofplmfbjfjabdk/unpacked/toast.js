/** Compact toast — bottom of popup, max 1 visible (does not cover table). */

let hostEl = null;
let activeToast = null;
let activeTimer = null;

function ensureHost() {
  if (hostEl?.isConnected) return hostEl;
  hostEl = document.getElementById("toast-host");
  if (hostEl) return hostEl;
  hostEl = document.createElement("div");
  hostEl.id = "toast-host";
  hostEl.className = "toast-host";
  hostEl.setAttribute("aria-live", "polite");
  document.body.appendChild(hostEl);
  return hostEl;
}

/**
 * @param {string} message
 * @param {'success'|'error'|'info'|'warn'} [type]
 * @param {number} [durationMs]
 */
export function showToast(message, type = "info", durationMs = 4200) {
  const text = String(message ?? "").trim();
  if (!text) return;

  if (activeTimer) window.clearTimeout(activeTimer);
  if (activeToast) activeToast.remove();

  const host = ensureHost();
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = text;
  host.appendChild(el);
  activeToast = el;

  requestAnimationFrame(() => el.classList.add("toast--in"));

  const remove = () => {
    el.classList.remove("toast--in");
    el.classList.add("toast--out");
    setTimeout(() => {
      el.remove();
      if (activeToast === el) activeToast = null;
    }, 180);
    activeTimer = null;
  };

  activeTimer = window.setTimeout(remove, durationMs);
  el.addEventListener("click", () => {
    if (activeTimer) window.clearTimeout(activeTimer);
    remove();
  });
}
