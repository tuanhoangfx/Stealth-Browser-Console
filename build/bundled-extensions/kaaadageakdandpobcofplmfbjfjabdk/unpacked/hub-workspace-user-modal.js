/**
 * Vanilla HubWorkspaceUserModal — parity packages/hub-ui HubWorkspaceUserModal.tsx (Data Box).
 * Fields: Email · Role · Provider · Created · Last sign in | User ID · Note
 * Footer: Sign Out only (centered).
 */

import {
  normalizeWorkspaceRoleKey,
  ROLE_ICON_META,
  WORKSPACE_ROLE_LABEL,
} from "./hub-vanilla/hub-workspace-role-vanilla.mjs";

const HUB_USER_ACCOUNT_TOC = [
  { id: "hub-user-account", label: "Account" },
  { id: "hub-user-session", label: "Session" },
];

const SCROLL_ROOT = ".hub-workspace-user-modal .hub-tool-detail-modal__scroll";

/** parity hub-ui HubWorkspaceUserModal FIELD_ICON_CLASS + hub-workspace-role-icon */
const ROLE_LABEL = WORKSPACE_ROLE_LABEL;

const FIELD_ICONS = {
  email: { icon: "mail", className: "hub-user-icon--sky" },
  provider: { icon: "key", className: "hub-user-icon--amber" },
  created: { icon: "user", className: "hub-user-icon--slate" },
  lastSignIn: { icon: "sync", className: "hub-user-icon--emerald" },
  userId: { icon: "key", className: "hub-user-icon--violet" },
  note: { icon: "stickyNote", className: "hub-user-icon--slate" },
};

const DEFAULT_NOTE = "Workspace data syncs per signed-in user on Data Box Supabase.";

/**
 * @param {object} data
 * @param {string} [data.userEmail]
 * @param {string} [data.userId]
 * @param {string} [data.userRole]
 * @param {string} [data.userProvider]
 * @param {string} [data.userCreatedAt]
 * @param {string} [data.userLastSignInAt]
 * @param {string} [data.workspaceNote]
 * @param {(name: string, className?: string) => string} [data.renderIconHtml]
 */
export function populateHubWorkspaceUserModal(data) {
  const titleEl = document.getElementById("hub-workspace-user-modal-title");
  const avatarEl = document.getElementById("hub-workspace-user-avatar");
  const email = String(data?.userEmail || "").trim();
  const displayTitle = email || "User";
  const roleKey = normalizeWorkspaceRoleKey(data?.userRole);
  const roleMeta = ROLE_ICON_META[roleKey] || ROLE_ICON_META.user;
  const locale = "vi-VN";
  const renderIcon = data?.renderIconHtml;

  if (titleEl) titleEl.textContent = displayTitle;
  if (avatarEl) {
    avatarEl.className = `user-access-modal__avatar hub-workspace-user-avatar ${roleMeta.className}`;
    if (typeof renderIcon === "function") {
      avatarEl.innerHTML = renderIcon(roleMeta.icon, `ui-icon ${roleMeta.className}`);
    } else {
      avatarEl.textContent = workspaceUserInitials(email, data?.userId);
    }
  }

  setField("user-field-email", email || "—");
  setField("user-field-role", ROLE_LABEL[roleKey] || "User");
  setField("user-field-provider", String(data?.userProvider || "email").trim() || "email");
  setField("user-field-created", formatLocaleDate(data?.userCreatedAt, locale));
  setField("user-field-last-sign-in", formatLocaleDate(data?.userLastSignInAt, locale));
  setField("user-field-user-id", data?.userId || "No active session", Boolean(data?.userId));

  const noteEl = document.getElementById("user-field-note");
  if (noteEl) {
    noteEl.textContent = String(data?.workspaceNote || DEFAULT_NOTE).trim() || DEFAULT_NOTE;
  }

  paintFieldIcons(roleKey, renderIcon);
  paintModalChromeIcons(renderIcon);
}

function paintRowIcon(tdId, iconName, colorClass, renderIcon) {
  if (typeof renderIcon !== "function") return;
  const td = document.getElementById(tdId);
  const span = td?.closest("tr")?.querySelector("th span[data-icon]");
  if (!span) return;
  span.innerHTML = renderIcon(iconName, `ui-icon ${colorClass}`);
}

function paintFieldIcons(roleKey, renderIcon) {
  const roleMeta = ROLE_ICON_META[roleKey] || ROLE_ICON_META.user;
  paintRowIcon("user-field-email", FIELD_ICONS.email.icon, FIELD_ICONS.email.className, renderIcon);
  paintRowIcon("user-field-role", roleMeta.icon, roleMeta.className, renderIcon);
  paintRowIcon("user-field-provider", FIELD_ICONS.provider.icon, FIELD_ICONS.provider.className, renderIcon);
  paintRowIcon("user-field-created", FIELD_ICONS.created.icon, FIELD_ICONS.created.className, renderIcon);
  paintRowIcon(
    "user-field-last-sign-in",
    FIELD_ICONS.lastSignIn.icon,
    FIELD_ICONS.lastSignIn.className,
    renderIcon,
  );
  paintRowIcon("user-field-user-id", FIELD_ICONS.userId.icon, FIELD_ICONS.userId.className, renderIcon);
  paintRowIcon("user-field-note", FIELD_ICONS.note.icon, FIELD_ICONS.note.className, renderIcon);
}

function paintModalChromeIcons(renderIcon) {
  if (typeof renderIcon !== "function") return;
  const modal = document.getElementById("user-modal");
  if (!modal) return;
  for (const el of modal.querySelectorAll(".hub-tool-detail-section__title-icon[data-icon]")) {
    const name = el.getAttribute("data-icon");
    if (name) el.innerHTML = renderIcon(name, "ui-icon hub-user-icon--slate");
  }
  for (const el of modal.querySelectorAll(".hub-toc-nav__icon[data-icon]")) {
    const name = el.getAttribute("data-icon");
    if (name) el.innerHTML = renderIcon(name, "ui-icon hub-user-icon--slate");
  }
}

function formatLocaleDate(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale);
}

function setField(id, value, mono = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.classList.toggle("user-field-mono", mono);
}

function workspaceUserInitials(email, userId) {
  const e = String(email || "").trim();
  if (e.includes("@")) {
    const local = e.split("@")[0] || "";
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase() || "U";
  }
  const id = String(userId || "").trim();
  return id ? id.slice(0, 2).toUpperCase() : "U";
}

function bindTocNav(modalEl) {
  const scrollRoot = modalEl?.querySelector(".hub-tool-detail-modal__scroll");
  const items = modalEl?.querySelectorAll(".hub-toc-nav__item[data-section]") ?? [];
  for (const item of items) {
    item.addEventListener("click", () => {
      const id = item.getAttribute("data-section");
      const target = id ? modalEl.querySelector(`#${id}`) : null;
      if (target && scrollRoot && getComputedStyle(scrollRoot).overflowY !== "visible") {
        const top = target.offsetTop - scrollRoot.offsetTop;
        scrollRoot.scrollTo({ top, behavior: "smooth" });
      } else if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      for (const el of items) el.classList.toggle("is-active", el === item);
    });
  }
}

export function bindHubWorkspaceUserModal({ modalEl, onClose, onSignOut, onRefresh }) {
  if (!modalEl) return;
  bindTocNav(modalEl);
  modalEl.querySelector(".hub-modal-close")?.addEventListener("click", () => onClose?.());
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
      `<button type="button" class="hub-toc-nav__item${id === "hub-user-account" ? " is-active" : ""}" data-section="${id}"><span class="hub-toc-nav__label">${label}</span></button>`,
  ).join("");
}

export { HUB_USER_ACCOUNT_TOC, SCROLL_ROOT, DEFAULT_NOTE, ROLE_ICON_META };
