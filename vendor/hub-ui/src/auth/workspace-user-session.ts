import { KeyRound, Mail, RefreshCcw, User } from "lucide-react";
import { hubSessionLabels, type HubSessionLike } from "@tool-workspace/hub-identity";
import type { HubAuthSessionMode } from "./HubAuthSessionBadge";
import type { HubWorkspaceUserProfileRow } from "./HubWorkspaceUserModal";
import { resolveWorkspaceRoleIcon, workspaceRoleLabel } from "./hub-workspace-role-icon";

export function resolveHubAuthSessionMode(opts: {
  anonymous?: boolean;
  session: HubSessionLike;
}): HubAuthSessionMode {
  if (opts.anonymous) return "anonymous";
  return opts.session ? "signed_in" : "anonymous";
}

export function workspaceUserInitials(
  email: string | null | undefined,
  userId: string | null | undefined,
): string {
  const base = email?.trim() || userId || "U";
  return base.slice(0, 2).toUpperCase();
}

export function workspaceUserFooterLabel(opts: {
  labels?: ReturnType<typeof hubSessionLabels>;
  session?: HubSessionLike;
  anonymous?: boolean;
  anonymousLabel?: string;
  guestLabel?: string;
}): string {
  if (opts.anonymous) return opts.anonymousLabel ?? "Anonymous";
  const labels = opts.labels ?? hubSessionLabels(opts.session ?? null);
  return (
    labels.email ||
    labels.loginId ||
    opts.session?.user?.email?.trim() ||
    (opts.session?.user?.id ? opts.session.user.id.slice(0, 8) : null) ||
    opts.guestLabel ||
    "guest"
  );
}

export type BuildWorkspaceUserProfileRowsOptions = {
  session: HubSessionLike;
  labels?: ReturnType<typeof hubSessionLabels>;
  locale?: string;
  /** Hub-style rows (P0016): User ID + synthetic email handling */
  includeLoginId?: boolean;
  /** P0020: "Not signed in" when email missing */
  emptyEmailLabel?: string;
  /** Resolved workspace role — sidebar / profiles SSOT. */
  roleKey?: string;
};

export function buildWorkspaceUserProfileRows(
  opts: BuildWorkspaceUserProfileRowsOptions,
): HubWorkspaceUserProfileRow[] {
  const labels = opts.labels ?? hubSessionLabels(opts.session);
  const user = opts.session?.user;
  const locale = opts.locale ?? "vi-VN";
  const createdAt = user?.created_at ? new Date(user.created_at).toLocaleString(locale) : "—";
  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString(locale)
    : "—";
  const roleKey = opts.roleKey ?? String(user?.app_metadata?.role ?? user?.user_metadata?.role ?? "user");
  const roleMeta = resolveWorkspaceRoleIcon(roleKey);
  const provider = String(user?.app_metadata?.provider ?? "email");

  const rows: HubWorkspaceUserProfileRow[] = [];
  if (opts.includeLoginId) {
    rows.push({ label: "User ID", value: labels.loginId || "—", icon: User });
  }
  const emailValue = opts.includeLoginId
    ? labels.email || (labels.hasSyntheticAuth ? "Not linked" : labels.authEmail) || "—"
    : labels.email || user?.email?.trim() || opts.emptyEmailLabel || "—";
  rows.push({
    label: "Email",
    value: emailValue,
    icon: Mail,
  });
  rows.push(
    {
      label: "Role",
      value: workspaceRoleLabel(roleKey),
      icon: roleMeta.icon,
      iconClassName: roleMeta.className,
    },
    { label: "Provider", value: provider, icon: KeyRound },
    { label: "Created", value: createdAt, icon: User },
    { label: "Last sign in", value: lastSignIn, icon: RefreshCcw },
  );
  return rows;
}
