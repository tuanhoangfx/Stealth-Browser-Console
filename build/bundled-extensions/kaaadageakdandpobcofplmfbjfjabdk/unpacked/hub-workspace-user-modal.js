/**
 * Vanilla HubFullUserAccountModal — parity packages/hub-ui HubFullUserAccountModal.tsx
 * Layout 3: header (initials · name · login) · TOC · Account ADM · Note/Log · Save/Sign Out/Close
 */

import {
  normalizeWorkspaceRoleKey,
  ROLE_ICON_META,
  WORKSPACE_ROLE_LABEL,
} from "./hub-vanilla/hub-workspace-role-vanilla.mjs";

const HUB_USER_ACCOUNT_TOC = [
  { id: "hub-user-credentials", label: "Credentials" },
  { id: "hub-user-identity", label: "Identity" },
  { id: "hub-user-note", label: "Note" },
  { id: "hub-user-log", label: "Log" },
];

const SCROLL_ROOT = ".hub-workspace-user-modal .hub-account-detail-modal__main-scroll";

const ROLE_LABEL = WORKSPACE_ROLE_LABEL;

const DEFAULT_NOTE = "Workspace data syncs per signed-in user on the Home Server data API.";

const EMPTY_PLACEHOLDERS = {
  username: "—",
  email: "you@company.com",
  password: "New password (min 6 characters)",
  "display-name": "Display name",
  phone: "Phone number",
  zalo: "Uses Phone when empty",
  tele: "Telegram ID or @handle",
  meta: "Messenger ID or handle",
};

/**
 * English relative time — parity packages/hub-ui/src/lib/format-hub-relative-time.ts
 * @param {number|string|null|undefined} value
 */
export function formatHubRelativeTime(value, now = Date.now()) {
  if (!value) return "—";
  const ts = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ts)) return "—";
  const diff = now - ts;
  if (diff < 45_000) return "Just now";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(new Date(ts));
}

/** parity hub-ui hubCopyBadgeDisplayLabel */
export function hubCopyBadgeDisplayLabel(value, label) {
  if (label) return label;
  const v = String(value || "");
  return v.length > 10 ? `${v.slice(0, 8)}…` : v || "—";
}

function looksLikeEmail(value) {
  return String(value || "").includes("@");
}

function emailLocalPart(email) {
  const e = String(email || "").trim();
  if (!e.includes("@")) return e;
  return e.split("@")[0] || e;
}

function workspaceUserInitials(displayName, loginId) {
  const name = String(displayName || "").trim();
  const words = name.split(/\s+/).filter((part) => /[A-Za-zÀ-ỹ]/.test(part));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (name.length >= 2 && !looksLikeEmail(name)) return name.slice(0, 2).toUpperCase();
  const login = String(loginId || emailLocalPart(name) || "U");
  return login.slice(0, 2).toUpperCase() || "U";
}

function setClickText(id, value, emptyText) {
  const el = document.getElementById(id);
  if (!el) return;
  const shown = String(value || "").trim();
  const empty = !shown;
  el.textContent = empty ? emptyText || "—" : shown;
  el.classList.toggle("hub-adm-click-edit__text--empty", empty);
}

/**
 * @param {object} data
 */
export function populateHubWorkspaceUserModal(data) {
  const titleEl = document.getElementById("hub-workspace-user-modal-title");
  const loginEl = document.getElementById("hub-workspace-user-username");
  const avatarEl = document.getElementById("hub-workspace-user-avatar");
  const email = String(data?.userEmail || "").trim();
  const loginId =
    String(data?.userLoginId || "").trim() || (looksLikeEmail(email) ? emailLocalPart(email) : "");
  const fullName = String(data?.userFullName || "").trim();
  const displayLabel = String(data?.userDisplayLabel || "").trim();
  const displayName =
    fullName ||
    (displayLabel && !looksLikeEmail(displayLabel) && displayLabel !== loginId ? displayLabel : "") ||
    loginId ||
    email ||
    "User";
  const roleKey = normalizeWorkspaceRoleKey(data?.userRole);
  const roleMeta = ROLE_ICON_META[roleKey] || ROLE_ICON_META.user;
  const renderIcon = data?.renderIconHtml;
  const userId = String(data?.userId || "").trim();

  if (titleEl) titleEl.textContent = displayName;
  if (loginEl) loginEl.textContent = loginId || "—";
  if (avatarEl) {
    avatarEl.className = "user-access-modal__avatar hub-workspace-user-avatar";
    avatarEl.textContent = workspaceUserInitials(displayName, loginId);
  }

  setClickText("user-field-username", loginId, EMPTY_PLACEHOLDERS.username);
  setClickText("user-field-email", email, EMPTY_PLACEHOLDERS.email);
  setClickText("user-field-password", "", EMPTY_PLACEHOLDERS.password);
  setClickText("user-field-display-name", fullName || (looksLikeEmail(displayLabel) ? "" : displayLabel), EMPTY_PLACEHOLDERS["display-name"]);
  setClickText("user-field-phone", data?.userPhone, EMPTY_PLACEHOLDERS.phone);
  setClickText("user-field-zalo", data?.userZalo, EMPTY_PLACEHOLDERS.zalo);
  setClickText("user-field-tele", data?.userTelegram, EMPTY_PLACEHOLDERS.tele);
  setClickText("user-field-meta", data?.userMeta, EMPTY_PLACEHOLDERS.meta);

  const createdEl = document.getElementById("user-field-created");
  const lastEl = document.getElementById("user-field-last-sign-in");
  if (createdEl) createdEl.textContent = formatHubRelativeTime(data?.userCreatedAt);
  if (lastEl) lastEl.textContent = formatHubRelativeTime(data?.userLastSignInAt);

  const vaultBtn = document.getElementById("user-field-user-id");
  const vaultLabel = document.getElementById("user-field-user-id-label");
  if (vaultBtn) vaultBtn.dataset.hubCopyValue = userId;
  if (vaultLabel) vaultLabel.textContent = userId ? hubCopyBadgeDisplayLabel(userId) : "—";

  const roleEl = document.getElementById("user-field-role");
  if (roleEl) roleEl.textContent = ROLE_LABEL[roleKey] || "User";
  const roleIcon = document.getElementById("user-field-role-icon");
  if (roleIcon) {
    roleIcon.setAttribute("data-icon", roleMeta.icon);
    if (typeof renderIcon === "function") {
      roleIcon.innerHTML = renderIcon(roleMeta.icon, `ui-icon ${roleMeta.className}`);
    }
  }

  const noteEl = document.getElementById("user-field-note");
  if (noteEl) noteEl.textContent = String(data?.workspaceNote || DEFAULT_NOTE).trim() || DEFAULT_NOTE;

  const noteRail = document.getElementById("user-field-note-rail");
  if (noteRail && data?.userNotes != null) noteRail.value = String(data.userNotes);

  paintModalChromeIcons(renderIcon);
}

function paintModalChromeIcons(renderIcon) {
  if (typeof renderIcon !== "function") return;
  const modal = document.getElementById("user-modal");
  if (!modal) return;
  const selectors = [
    ".hub-users-th-icon[data-icon]",
    ".hub-toc-nav__icon[data-icon]",
    ".hub-tool-detail-panel__head-icon[data-icon]",
    ".hub-tool-detail-rail__head-icon[data-icon]",
    ".hub-search-field__glyph[data-icon]",
    ".hub-copy-badge__icon[data-icon]",
    ".hub-tool-detail-modal__footer [data-icon]",
  ];
  for (const el of modal.querySelectorAll(selectors.join(","))) {
    const name = el.getAttribute("data-icon");
    if (name) el.innerHTML = renderIcon(name, "ui-icon");
  }
}

function bindTocNav(modalEl) {
  const scrollRoot = modalEl?.querySelector(".hub-account-detail-modal__main-scroll");
  const items = modalEl?.querySelectorAll(".hub-toc-nav__item[data-section]") ?? [];
  for (const item of items) {
    item.addEventListener("click", () => {
      const id = item.getAttribute("data-section");
      const target = id ? modalEl.querySelector(`#${id}`) : null;
      if (target && scrollRoot) {
        const top = target.offsetTop - scrollRoot.offsetTop;
        scrollRoot.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } else if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      for (const el of items) el.classList.toggle("is-active", el === item);
    });
  }
}

function startClickEdit(btn) {
  const field = btn.getAttribute("data-adm-field");
  const text = btn.querySelector(".hub-adm-click-edit__text");
  if (!field || !text || btn.querySelector("input")) return;
  const empty = text.classList.contains("hub-adm-click-edit__text--empty");
  const current = empty ? "" : text.textContent || "";
  const input = document.createElement("input");
  input.className = "field auth-gate-field hub-adm-click-edit__input";
  input.value = current;
  input.placeholder = EMPTY_PLACEHOLDERS[field] || "—";
  if (field === "password") input.type = "password";
  if (field === "email") input.inputMode = "email";
  if (field === "phone") input.inputMode = "tel";
  const valueWrap = btn.parentElement;
  if (!valueWrap) return;
  valueWrap.classList.add("hub-adm-inline-field__value--editing");
  const aria = btn.getAttribute("aria-label") || `Edit ${field}`;
  const textId = text.id;
  btn.replaceWith(input);
  input.focus();
  const finish = () => {
    const next = input.value;
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "hub-adm-click-edit";
    nextBtn.setAttribute("aria-label", aria);
    nextBtn.setAttribute("data-adm-field", field);
    const span = document.createElement("span");
    span.id = textId;
    span.className = "hub-adm-click-edit__text hub-adm-detail-value-text";
    const shown = next.trim();
    span.textContent = shown || EMPTY_PLACEHOLDERS[field] || "—";
    span.classList.toggle("hub-adm-click-edit__text--empty", !shown);
    nextBtn.appendChild(span);
    input.replaceWith(nextBtn);
    valueWrap.classList.remove("hub-adm-inline-field__value--editing");
    document.getElementById("user-modal-save")?.removeAttribute("disabled");
    document.getElementById("user-modal-save")?.classList.remove("hub-tool-detail-modal__confirm--disabled");
  };
  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      input.blur();
    }
  });
}

function bindClickEdit(modalEl) {
  if (!modalEl || modalEl.dataset.clickEditBound === "1") return;
  modalEl.dataset.clickEditBound = "1";
  modalEl.addEventListener("click", (event) => {
    const btn = event.target.closest?.(".hub-adm-click-edit[data-adm-field]");
    if (!btn || !modalEl.contains(btn)) return;
    startClickEdit(btn);
  });
}

function bindVaultCopy(modalEl) {
  const btn = modalEl?.querySelector("#user-field-user-id");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", async () => {
    const value = btn.dataset.hubCopyValue || "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
  });
}

export function bindHubWorkspaceUserModal({ modalEl, onClose, onSignOut, onRefresh }) {
  if (!modalEl) return;
  bindTocNav(modalEl);
  bindClickEdit(modalEl);
  bindVaultCopy(modalEl);
  modalEl.querySelector(".hub-modal-close")?.addEventListener("click", () => onClose?.());
  modalEl.querySelector("#user-modal-footer-close")?.addEventListener("click", () => onClose?.());
  modalEl.querySelector("#user-modal-refresh")?.addEventListener("click", () => onRefresh?.());
  modalEl.querySelector("#user-modal-logout")?.addEventListener("click", () => onSignOut?.());
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) onClose?.();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalEl.hidden) onClose?.();
  });
}

export function openHubWorkspaceUserModal(modalEl) {
  if (!modalEl) return;
  modalEl.hidden = false;
  document.body.classList.add("hub-modal-open");
}

export function closeHubWorkspaceUserModal(modalEl) {
  if (!modalEl) return;
  modalEl.hidden = true;
  document.body.classList.remove("hub-modal-open");
}

export function hubWorkspaceUserModalTocHtml() {
  return HUB_USER_ACCOUNT_TOC.map(
    ({ id, label }) =>
      `<button type="button" class="hub-toc-nav__item${id === "hub-user-credentials" ? " is-active" : ""}" data-section="${id}"><span class="hub-toc-nav__label">${label}</span></button>`,
  ).join("");
}

export function renderHubUserModalLog(entries, { escapeHtml }) {
  const emptyEl = document.getElementById("user-modal-log-empty");
  const listEl = document.getElementById("user-modal-log-list");
  if (!listEl) return;
  const rows = Array.isArray(entries) ? entries : [];
  const has = rows.length > 0;
  if (emptyEl) emptyEl.hidden = has;
  listEl.hidden = !has;
  listEl.innerHTML = rows
    .map((row, index) => {
      const at = row?.at;
      const iso = typeof at === "number" ? new Date(at).toISOString() : String(at || "");
      const rel = formatHubRelativeTime(at);
      const message = escapeHtml(String(row?.message || ""));
      const dot = /fail|error|out/i.test(String(row?.message || "")) ? 2 : index === 0 ? 1 : 0;
      return `<li class="twofa-adm-log-row twofa-adm-log-row--detail" title="${escapeHtml(rel)} · ${message}">
        <div class="twofa-adm-log-row__head">
          <span class="twofa-adm-log-row__meta">
            <span class="twofa-adm-log-dot twofa-adm-log-dot--${dot}" aria-hidden="true"></span>
            <time class="twofa-adm-log-row__time" datetime="${escapeHtml(iso)}">${escapeHtml(rel)}</time>
          </span>
          <span class="twofa-adm-log-row__action"><span class="twofa-adm-log-row__msg">${message}</span></span>
        </div>
      </li>`;
    })
    .join("");
}

export { HUB_USER_ACCOUNT_TOC, SCROLL_ROOT, DEFAULT_NOTE, ROLE_ICON_META };
