import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HubSessionLike } from "@tool-workspace/hub-identity";
import {
  fetchWorkspaceProfileRole,
  readCachedWorkspaceProfileRole,
  subscribeWorkspaceProfileRole,
  subscribeWorkspaceProfileRoleCache,
} from "../lib/workspace-profile-role";
import { normalizeWorkspaceRoleKey, resolveWorkspaceRoleKey } from "./hub-workspace-role-icon";

export type UseWorkspaceRoleKeyOptions = {
  anonymous?: boolean;
  /** Controlled role key — skips session + async resolve. */
  roleKey?: string;
  /** Fetch profiles.role (legacy callback — prefer profileRoleClient). */
  onResolveRoleKey?: (userId: string) => Promise<string | null | undefined>;
  /** Supabase client — fetch + realtime `profiles.role` (Hub Users SSOT). */
  profileRoleClient?: SupabaseClient | null;
  /** Hub identity user id — overrides session.user.id (P0020 dual-auth). */
  profileRoleUserId?: string | null;
  /** Fallback directory match when local auth id ≠ Hub profiles.id. */
  profileRoleEmail?: string | null;
  /** Apply Hub JWT before profiles query (e.g. applyHubIdentitySession). */
  onPrepareProfileRoleClient?: (client: SupabaseClient) => Promise<void>;
};

export type WorkspaceRoleState = {
  roleKey: string;
  /** Hide role icon until profiles.role resolves — avoids JWT "user" flash. */
  roleIconPending: boolean;
};

const ROLE_RANK = { admin: 3, manager: 2, user: 1, anonymous: 0 } as const;

function strongerRoleKey(a: string, b: string): string {
  const ak = normalizeWorkspaceRoleKey(a);
  const bk = normalizeWorkspaceRoleKey(b);
  return ROLE_RANK[ak] >= ROLE_RANK[bk] ? ak : bk;
}

function readCachedRoleForIds(...userIds: (string | null | undefined)[]): string | null {
  for (const id of userIds) {
    const trimmed = id?.trim();
    if (!trimmed) continue;
    const cached = readCachedWorkspaceProfileRole(trimmed);
    if (cached) return cached;
  }
  return null;
}

/** Sidebar footer role icon — profiles.role SSOT with optional realtime sync. */
export function useWorkspaceRoleKey(
  session: HubSessionLike,
  opts: UseWorkspaceRoleKeyOptions = {},
): WorkspaceRoleState {
  const {
    anonymous = false,
    roleKey: roleKeyProp,
    onResolveRoleKey,
    profileRoleClient,
    profileRoleUserId,
    profileRoleEmail,
    onPrepareProfileRoleClient,
  } = opts;
  const sessionUserId = session?.user?.id;
  const roleUserId = profileRoleUserId?.trim() || sessionUserId;
  const roleEmail = profileRoleEmail?.trim() || session?.user?.email || null;
  const usesProfileSsot = Boolean(profileRoleClient && roleUserId);
  const sessionRoleKey = anonymous ? "anonymous" : resolveWorkspaceRoleKey(session);
  const initialCached = roleUserId ? readCachedRoleForIds(roleUserId, sessionUserId) : null;

  const [resolvedRoleKey, setResolvedRoleKey] = useState<string | null>(initialCached);
  const [roleIconPending, setRoleIconPending] = useState(() => usesProfileSsot && !initialCached);
  const prepareClientRef = useRef(onPrepareProfileRoleClient);
  prepareClientRef.current = onPrepareProfileRoleClient;

  useEffect(() => {
    if (roleKeyProp) {
      setResolvedRoleKey(null);
      setRoleIconPending(false);
      return;
    }
    if (anonymous || !roleUserId) {
      setResolvedRoleKey(null);
      setRoleIconPending(false);
      return;
    }

    let cancelled = false;
    const cached = readCachedRoleForIds(roleUserId, sessionUserId);
    setResolvedRoleKey(cached);
    setRoleIconPending(Boolean(profileRoleClient && !cached));

    const applyRole = (role: string | null | undefined) => {
      if (!cancelled && role) {
        const next = normalizeWorkspaceRoleKey(role);
        setResolvedRoleKey((prev) => (prev ? strongerRoleKey(prev, next) : next));
        setRoleIconPending(false);
      }
    };

    const cacheUserIds = [...new Set([roleUserId, sessionUserId].filter(Boolean))] as string[];
    const unsubCache = cacheUserIds.map((id) => subscribeWorkspaceProfileRoleCache(id, applyRole));

    if (profileRoleClient) {
      const load = () => {
        void fetchWorkspaceProfileRole(profileRoleClient, roleUserId, {
          email: roleEmail,
          prepareClient: prepareClientRef.current,
        }).then((role) => {
          applyRole(role);
          if (!cancelled) setRoleIconPending(false);
        });
      };
      load();
      const unsubscribeRole = subscribeWorkspaceProfileRole(profileRoleClient, roleUserId, applyRole);
      const {
        data: { subscription },
      } = profileRoleClient.auth.onAuthStateChange(() => {
        load();
      });
      return () => {
        cancelled = true;
        unsubCache.forEach((u) => u());
        unsubscribeRole();
        subscription.unsubscribe();
      };
    }

    if (!onResolveRoleKey) {
      return () => {
        cancelled = true;
        unsubCache.forEach((u) => u());
      };
    }

    void onResolveRoleKey(roleUserId).then(applyRole);
    return () => {
      cancelled = true;
      unsubCache.forEach((u) => u());
    };
  }, [anonymous, onResolveRoleKey, profileRoleClient, roleEmail, roleKeyProp, roleUserId, sessionUserId]);

  if (roleKeyProp) {
    return { roleKey: normalizeWorkspaceRoleKey(roleKeyProp), roleIconPending: false };
  }
  if (anonymous) {
    return { roleKey: "anonymous", roleIconPending: false };
  }
  if (usesProfileSsot) {
    if (resolvedRoleKey) {
      return { roleKey: resolvedRoleKey, roleIconPending: false };
    }
    if (roleIconPending) {
      return { roleKey: sessionRoleKey, roleIconPending: true };
    }
  }
  return { roleKey: resolvedRoleKey ?? sessionRoleKey, roleIconPending: false };
}
