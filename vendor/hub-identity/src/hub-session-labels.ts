import {
  hubDisplayEmail,
  hubDisplayLoginId,
  isHubSyntheticEmail,
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
  const loginId = hubDisplayLoginId({
    loginId: String(session?.user.user_metadata?.login_id ?? ""),
    authEmail,
  });
  const email = hubDisplayEmail({ authEmail });
  return { authEmail, loginId, email, hasSyntheticAuth: isHubSyntheticEmail(authEmail) };
}
