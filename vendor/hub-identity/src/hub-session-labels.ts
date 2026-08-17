import {
  hubDisplayEmail,
  hubDisplayLoginId,
  isHubSyntheticEmail,
  isHubTechnicalAuthEmail,
} from "./hub-login";

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
  const email = hubDisplayEmail({
    authEmail,
    contactEmail: String(meta.contact_email ?? ""),
    profileEmail: String(meta.email ?? ""),
  });
  const displayName = String(meta.full_name ?? meta.display_name ?? meta.name ?? "").trim();
  const hasTechnicalAuth = isHubTechnicalAuthEmail(authEmail);
  return {
    authEmail,
    loginId,
    email,
    displayName,
    /** @deprecated Prefer `hasTechnicalAuth` — opaque Hub emails are not synthetic. */
    hasSyntheticAuth: isHubSyntheticEmail(authEmail) || hasTechnicalAuth,
    /** True when auth.users.email is opaque/synthetic — UI must use profiles.email instead. */
    hasTechnicalAuth,
  };
}
