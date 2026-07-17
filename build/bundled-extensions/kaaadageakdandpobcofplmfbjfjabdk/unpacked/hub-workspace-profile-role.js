/**
 * Hub workspace profile role — parity packages/hub-ui/src/lib/workspace-profile-role.ts
 * Extension: fetch profiles.role + auth user from hub-api (identity plane).
 */

import {
  normalizeWorkspaceRoleKey,
  ROLE_ICON_META,
  workspaceRoleLabel,
} from "./hub-vanilla/hub-workspace-role-vanilla.mjs";

export { normalizeWorkspaceRoleKey };

function identityHeaders(identityAuth, extra = {}) {
  return {
    apikey: identityAuth.supabase_anon_key,
    Authorization: `Bearer ${identityAuth.access_token}`,
    Accept: "application/json",
    ...extra,
  };
}

/** GET /auth/v1/user — created_at, last_sign_in_at (Hub identity session). */
export async function fetchAuthUserRecord(identityAuth) {
  if (!identityAuth?.access_token || !identityAuth?.supabase_url) return null;
  try {
    const url = `${String(identityAuth.supabase_url).replace(/\/$/, "")}/auth/v1/user`;
    const res = await fetch(url, { headers: identityHeaders(identityAuth) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** profiles.role SSOT — same table Data Box sidebar uses (hub-api). */
export async function fetchWorkspaceProfileRole(identityAuth, { userId, email } = {}) {
  if (!identityAuth?.access_token || !identityAuth?.supabase_url || !userId) return null;
  const base = String(identityAuth.supabase_url).replace(/\/$/, "");

  try {
    const rosterRes = await fetch(`${base}/rest/v1/rpc/workspace_user_directory`, {
      method: "POST",
      headers: identityHeaders(identityAuth, { "Content-Type": "application/json" }),
      body: "{}",
    });
    if (rosterRes.ok) {
      const rows = await rosterRes.json();
      if (Array.isArray(rows)) {
        const match = rows.find(
          (row) =>
            row?.id === userId ||
            (email && String(row?.email || "").toLowerCase() === String(email).toLowerCase()),
        );
        if (match?.role) return normalizeWorkspaceRoleKey(match.role);
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const url = `${base}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(userId)}&limit=1`;
    const res = await fetch(url, { headers: identityHeaders(identityAuth) });
    if (!res.ok) return null;
    const rows = await res.json();
    const role = rows?.[0]?.role;
    return role ? normalizeWorkspaceRoleKey(role) : null;
  } catch {
    return null;
  }
}

/**
 * HubWorkspaceUserModal profile — identity user + profiles.role (Data Box parity).
 * @param {object|null} identityAuth hub-api session
 * @param {object|null} dataAuth sb-api session (fallback)
 */
export async function resolveHubUserModalProfile(identityAuth, dataAuth) {
  const userId =
    identityAuth?.user_id ?? dataAuth?.user_id ?? null;
  const email =
    identityAuth?.user_email ?? dataAuth?.user_email ?? null;

  const authUser = identityAuth ? await fetchAuthUserRecord(identityAuth) : null;
  const roleFromProfile =
    identityAuth && userId
      ? await fetchWorkspaceProfileRole(identityAuth, { userId, email })
      : null;

  const meta = authUser?.app_metadata ?? {};
  const umeta = authUser?.user_metadata ?? {};

  return {
    hubIdentityUserId: authUser?.id ?? userId ?? null,
    userRole:
      roleFromProfile ??
      identityAuth?.user_role ??
      dataAuth?.user_role ??
      meta.role ??
      umeta.role ??
      "user",
    userProvider: String(
      authUser?.app_metadata?.provider ??
        authUser?.user_metadata?.provider ??
        identityAuth?.user_provider ??
        dataAuth?.user_provider ??
        "email",
    ),
    userCreatedAt:
      authUser?.created_at ??
      identityAuth?.user_created_at ??
      dataAuth?.user_created_at ??
      null,
    userLastSignInAt:
      authUser?.last_sign_in_at ??
      identityAuth?.user_last_sign_in_at ??
      dataAuth?.user_last_sign_in_at ??
      null,
  };
}
