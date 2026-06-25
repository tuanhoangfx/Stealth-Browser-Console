import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { compactIconSize } from "../ui-scale";
import { normalizeWorkspaceRoleKey, resolveWorkspaceRoleIcon, workspaceRoleLabel } from "../auth/hub-workspace-role-icon";

export type HubDirectoryToolAccessBadgeKind =
  | { type: "role"; role: string }
  | { type: "none" }
  | { type: "no-login" }
  | { type: "granted" };

export type HubDirectoryToolAccessBadgeProps = {
  kind: HubDirectoryToolAccessBadgeKind;
  title: string;
  /** Directory / modal tables — icon only (Users tool columns parity). */
  iconOnly?: boolean;
};

/** Tool access badge — icon-only in directory tables; full label optional. */
export function HubDirectoryToolAccessBadge({
  kind,
  title,
  iconOnly = true,
}: HubDirectoryToolAccessBadgeProps) {
  if (kind.type === "role") {
    const roleKey = normalizeWorkspaceRoleKey(kind.role);
    const meta = resolveWorkspaceRoleIcon(kind.role);
    const Icon = meta.icon;
    return (
      <span
        className={`hub-users-role-badge hub-users-role-badge--${roleKey}${
          iconOnly ? " hub-users-role-badge--icon-only" : ""
        }`}
        title={title}
      >
        <Icon size={compactIconSize(12)} className={`hub-users-role-badge-icon ${meta.className}`} aria-hidden />
        {!iconOnly ? <span className="hub-users-role-badge-label">{workspaceRoleLabel(kind.role)}</span> : null}
      </span>
    );
  }

  if (kind.type === "granted") {
    return (
      <span className="hub-directory-tool-access-badge hub-directory-tool-access-badge--granted" title={title}>
        <ShieldCheck size={compactIconSize(12)} aria-hidden />
        {!iconOnly ? <span className="hub-directory-tool-access-badge__label">Access</span> : null}
      </span>
    );
  }

  if (kind.type === "no-login") {
    return (
      <span className="hub-directory-tool-access-badge hub-directory-tool-access-badge--no-login" title={title}>
        <KeyRound size={compactIconSize(12)} aria-hidden />
        {!iconOnly ? <span className="hub-directory-tool-access-badge__label">No login</span> : null}
      </span>
    );
  }

  return (
    <span className="hub-directory-tool-access-badge hub-directory-tool-access-badge--none" title={title}>
      <ShieldOff size={compactIconSize(12)} aria-hidden />
      {!iconOnly ? <span className="hub-directory-tool-access-badge__label">No access</span> : null}
    </span>
  );
}
