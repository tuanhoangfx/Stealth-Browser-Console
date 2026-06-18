import type { LucideIcon } from "lucide-react";
import { Crown, ShieldCheck, UserRound } from "lucide-react";
import type { HubSessionLike } from "@tool-workspace/hub-identity";

export type HubWorkspaceRoleKey = "admin" | "manager" | "user" | "anonymous";

export type HubWorkspaceRoleIconMeta = {
  icon: LucideIcon;
  className: string;
};

/** Canonical workspace role icons — sidebar footer, Users table, modals, filters. */
export const HUB_WORKSPACE_ROLE_ICON: Record<HubWorkspaceRoleKey, HubWorkspaceRoleIconMeta> = {
  admin: { icon: Crown, className: "text-indigo-300" },
  manager: { icon: ShieldCheck, className: "text-purple-300" },
  user: { icon: UserRound, className: "text-emerald-300" },
  anonymous: { icon: UserRound, className: "text-violet-400" },
};

const ROLE_ICON_ALIASES: Record<string, HubWorkspaceRoleKey> = {
  admin: "admin",
  manager: "manager",
  user: "user",
  employee: "user",
  authenticated: "user",
  anonymous: "anonymous",
};

export function normalizeWorkspaceRoleKey(
  raw: string | null | undefined,
  fallback: HubWorkspaceRoleKey = "user",
): HubWorkspaceRoleKey {
  const key = String(raw ?? "").trim().toLowerCase();
  return ROLE_ICON_ALIASES[key] ?? fallback;
}

export function workspaceRoleLabel(roleKey: string): string {
  const key = normalizeWorkspaceRoleKey(roleKey);
  if (key === "admin") return "Admin";
  if (key === "manager") return "Manager";
  if (key === "anonymous") return "Anonymous";
  return "User";
}

export function resolveWorkspaceRoleKey(session: HubSessionLike, fallback: HubWorkspaceRoleKey = "user"): string {
  const user = session?.user;
  const raw = String(user?.app_metadata?.role ?? user?.user_metadata?.role ?? fallback);
  return normalizeWorkspaceRoleKey(raw, fallback);
}

export function resolveWorkspaceRoleIcon(roleKey: string): HubWorkspaceRoleIconMeta {
  const key = normalizeWorkspaceRoleKey(roleKey);
  return HUB_WORKSPACE_ROLE_ICON[key];
}
