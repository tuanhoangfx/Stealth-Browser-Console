/**
 * Vanilla HubAuthLogoutChip — parity with packages/hub-ui HubAuthLogoutChip.tsx
 * Role icon parity HubSidebarUserFooter (profiles.role crown/shield/userRound).
 */

import { normalizeWorkspaceRoleKey, ROLE_ICON_META } from "./hub-vanilla/hub-workspace-role-vanilla.mjs";

/**
 * @param {object} opts
 * @param {HTMLElement | null} [opts.chipEl]
 * @param {HTMLElement | null} [opts.emailEl]
 * @param {HTMLButtonElement | null} [opts.identityBtn]
 * @param {HTMLButtonElement | null} [opts.logoutBtn]
 * @param {HTMLElement | null} [opts.roleIconEl]
 * @param {string} [opts.email]
 * @param {string} [opts.roleKey]
 * @param {boolean} [opts.linked]
 * @param {boolean} [opts.canLogout]
 * @param {boolean} [opts.signingOut]
 * @param {(name: string, className?: string) => string} [opts.renderIconHtml]
 */
export function updateHubAuthLogoutChip(opts) {
  const {
    chipEl,
    emailEl,
    identityBtn,
    logoutBtn,
    roleIconEl,
    email = "",
    roleKey = "user",
    linked = false,
    canLogout = false,
    signingOut = false,
    renderIconHtml,
  } = opts;

  const label = String(email || "").trim() || "User";
  const normalizedRole = normalizeWorkspaceRoleKey(roleKey);
  const roleMeta = ROLE_ICON_META[normalizedRole] || ROLE_ICON_META.user;

  if (emailEl) emailEl.textContent = label;
  if (chipEl) chipEl.classList.toggle("hub-auth-logout-chip--linked", linked);

  if (roleIconEl && typeof renderIconHtml === "function") {
    roleIconEl.className = `hub-auth-logout-chip__user-icon ${roleMeta.className}`;
    roleIconEl.innerHTML = renderIconHtml(roleMeta.icon, `ui-icon ${roleMeta.className}`);
  }

  if (identityBtn) {
    identityBtn.disabled = signingOut;
    identityBtn.title = linked
      ? `${label} — User details`
      : "User details — sign in or refresh session from Cookie Bridge tab";
    identityBtn.setAttribute("aria-label", linked ? `Open user details for ${label}` : "Open user details");
  }

  if (logoutBtn) {
    logoutBtn.disabled = !canLogout || signingOut;
    logoutBtn.title = signingOut
      ? "Signing out…"
      : canLogout
        ? "Log out (clear extension session)"
        : "No session to log out";
    logoutBtn.setAttribute("aria-label", signingOut ? "Signing out" : "Log out");
  }
}

/** Wire click handlers once at popup boot. */
export function bindHubAuthLogoutChip({ identityBtn, logoutBtn, onOpenUser, onLogout }) {
  identityBtn?.addEventListener("click", () => onOpenUser?.());
  logoutBtn?.addEventListener("click", () => onLogout?.());
}
