import { User } from "lucide-react";
import { HubSidebarFooterButton } from "../shell/HubSidebarFooterButton";
import { resolveWorkspaceRoleIcon } from "./hub-workspace-role-icon";

export type HubSidebarUserFooterProps = {
  footerUserLabel: string;
  onOpenUser: () => void;
  /** Workspace role key — icon only, shown before email (admin / manager / user). */
  roleKey?: string;
  /** Wait for profiles.role — icon slot reserved, no JWT fallback flash. */
  roleIconPending?: boolean;
  label?: string;
  title?: string;
};

/** Sidebar User row — signed-in: role icon + user ID/email only (no "User" label). */
export function HubSidebarUserFooter({
  footerUserLabel,
  onOpenUser,
  roleKey = "user",
  roleIconPending = false,
  title = "Account & sign out",
  label = "User",
}: HubSidebarUserFooterProps) {
  const roleMeta = resolveWorkspaceRoleIcon(roleKey);
  const RoleIcon = roleMeta.icon;
  const signedIn = roleKey !== "anonymous";

  if (signedIn) {
    return (
      <HubSidebarFooterButton
        icon={RoleIcon}
        iconClass={roleIconPending ? "opacity-0" : roleMeta.className}
        iconFadeIn={!roleIconPending}
        label={footerUserLabel}
        title={title}
        onClick={onOpenUser}
      />
    );
  }

  return (
    <HubSidebarFooterButton
      icon={User}
      iconClass="text-violet-400"
      label={label}
      title={title}
      onClick={onOpenUser}
      trailing={
        footerUserLabel && footerUserLabel !== label ? (
          <span className="max-w-[140px] truncate text-xs font-medium text-[var(--text)]/80">{footerUserLabel}</span>
        ) : null
      }
    />
  );
}
