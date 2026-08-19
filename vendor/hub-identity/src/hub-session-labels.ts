import {
  hubAccountEmailLabel,
  hubDisplayEmail,
  hubDisplayLoginId,
  isHubSyntheticEmail,
  isHubTechnicalAuthEmail,
} from "./hub-login";
import { hubJwtSubject } from "./hub-tool-access-fast-check";
import type { HubIdentitySnapshot } from "./hub-identity-cache";

export type HubSessionLike = {
  user: {
    id?: string;
    email?: string | null;
    created_at?: string;
    last_sign_in_at?: string;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  };
} | null;

/** Labels for account modal from Hub session */
export function hubSessionLabels(session: HubSessionLike) {
  const authEmail = session?.user.email ?? "";
  const meta = session?.user.user_metadata ?? {};
  const loginId = hubDisplayLoginId({
    loginId: String(meta.login_id ?? ""),
    authEmail,
  });
  const contactEmail = String(meta.contact_email ?? "");
  const profileEmail = String(meta.email ?? "");
  const email = hubDisplayEmail({
    authEmail,
    contactEmail,
    profileEmail,
  });
  const displayName = String(meta.full_name ?? meta.display_name ?? meta.name ?? "").trim();
  const hasTechnicalAuth = isHubTechnicalAuthEmail(authEmail);
  return {
    authEmail,
    loginId,
    email,
    contactEmail,
    profileEmail,
    displayName,
    /** @deprecated Prefer `hasTechnicalAuth` — opaque Hub emails are not synthetic. */
    hasSyntheticAuth: isHubSyntheticEmail(authEmail) || hasTechnicalAuth,
    /** True when auth.users.email is opaque/synthetic — UI must use profiles.email instead. */
    hasTechnicalAuth,
  };
}

/**
 * Access-denied / footer identity line.
 * Never `@infix1.io.vn` or opaque GoTrue locals — contact/profile email, else User ID.
 */
export function hubSignedInAsLabel(
  session: HubSessionLike,
  identityEmail?: string | null,
): string | undefined {
  const labels = hubSessionLabels(session);
  const email = hubAccountEmailLabel(
    {
      authEmail: labels.authEmail,
      contactEmail: labels.contactEmail,
      profileEmail: labels.profileEmail || identityEmail,
    },
    "",
  );
  if (email) return email;
  const identity = String(identityEmail ?? "").trim().toLowerCase();
  if (identity && !isHubSyntheticEmail(identity) && !isHubTechnicalAuthEmail(identity)) {
    return identity;
  }
  return labels.loginId || undefined;
}

/** Live `profiles.email` / `contact_email` for dual-plane hosts (Data Box session email may be opaque). */
export async function fetchHubProfileSignedInAs(
  snapshot: Pick<
    HubIdentitySnapshot,
    "access_token" | "user_id" | "user_email" | "supabase_url" | "supabase_anon_key"
  > | null | undefined,
  session: HubSessionLike = null,
): Promise<string | undefined> {
  const fallback = hubSignedInAsLabel(session, snapshot?.user_email ?? null);
  const url = String(snapshot?.supabase_url ?? "").trim().replace(/\/$/, "");
  const anon = String(snapshot?.supabase_anon_key ?? "").trim();
  const token = String(snapshot?.access_token ?? "").trim();
  const userId = hubJwtSubject(token) || String(snapshot?.user_id ?? "").trim();
  if (!url || !anon || !token || !userId) return fallback;
  try {
    const res = await fetch(
      `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=email,contact_email,login_id&limit=1`,
      {
        headers: {
          apikey: anon,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) return fallback;
    const rows = (await res.json().catch(() => null)) as
      | Array<{ email?: string | null; contact_email?: string | null; login_id?: string | null }>
      | null;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return fallback;
    const email = hubAccountEmailLabel(
      {
        contactEmail: row.contact_email,
        profileEmail: row.email,
        authEmail: snapshot?.user_email,
      },
      "",
    );
    if (email) return email;
    const loginId = String(row.login_id ?? "").trim().toLowerCase();
    return loginId || fallback;
  } catch {
    return fallback;
  }
}
