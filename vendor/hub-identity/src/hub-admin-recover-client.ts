import type { Session } from "@supabase/supabase-js";
import { isHubAuthRateLimitError } from "./hub-auth-rate-limit";

export type HubRecoverApiResponse = {
  ok?: boolean;
  error?: string;
  rateLimited?: boolean;
  adminRecovery?: boolean;
  session?: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number | null;
    expires_in?: number | null;
    token_type?: string;
    user?: Session["user"];
  };
  chatcenterSession?: HubRecoverApiResponse["session"];
  dataSession?: HubRecoverApiResponse["session"];
  chatcenterError?: string | null;
};

export type RecoverHubSessionViaApiOptions = {
  apiUrl: (path: string) => string;
  loginInput: string;
  password: string;
  recoverToken?: string;
};

function toSession(raw: NonNullable<HubRecoverApiResponse["session"]>): Session {
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token ?? "",
    expires_at: raw.expires_at ?? undefined,
    expires_in: raw.expires_in ?? undefined,
    token_type: "bearer",
    user: raw.user as Session["user"],
  } as Session;
}

function recoverHeaders(recoverToken?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = recoverToken?.trim();
  if (token) headers["X-Hub-Recover-Token"] = token;
  return headers;
}

function adoptRecoverPayload(data: HubRecoverApiResponse, mirrorSessionKey: "chatcenterSession" | "dataSession" = "chatcenterSession") {
  if (!data.session?.access_token) return null;
  const mirror = data[mirrorSessionKey];
  return {
    identitySession: toSession(data.session),
    mirrorSession: mirror?.access_token ? toSession(mirror) : null,
  };
}

/** Worker admin recovery when GoTrue rate-limits browser password grant. */
export async function recoverHubSessionViaApi(
  options: RecoverHubSessionViaApiOptions & { mirrorSessionKey?: "chatcenterSession" | "dataSession" },
): Promise<{ identitySession: Session; mirrorSession: Session | null } | null> {
  const { apiUrl, loginInput, password, recoverToken, mirrorSessionKey = "chatcenterSession" } = options;
  const headers = recoverHeaders(recoverToken);
  const body = JSON.stringify({ login: loginInput, password, mode: "signin" });

  let signInRes: Response;
  try {
    signInRes = await fetch(apiUrl("/api/auth/hub/sign-in"), { method: "POST", headers, body });
  } catch {
    return null;
  }
  const signInData = (await signInRes.json().catch(() => ({}))) as HubRecoverApiResponse;
  const adopted = adoptRecoverPayload(signInData, mirrorSessionKey);
  if (signInRes.ok && signInData.ok && adopted) {
    return { identitySession: adopted.identitySession, mirrorSession: adopted.mirrorSession };
  }

  const shouldRecover =
    signInData.adminRecovery ||
    signInData.rateLimited ||
    isHubAuthRateLimitError(signInData.error) ||
    signInRes.status === 429;

  if (!shouldRecover) return null;

  let recoverRes: Response;
  try {
    recoverRes = await fetch(apiUrl("/api/auth/hub/admin-recover"), {
      method: "POST",
      headers,
      body: JSON.stringify({ login: loginInput, password }),
    });
  } catch {
    return null;
  }
  const recoverData = (await recoverRes.json().catch(() => ({}))) as HubRecoverApiResponse;
  const recovered = adoptRecoverPayload(recoverData, mirrorSessionKey);
  if (recoverRes.ok && recoverData.ok && recovered) {
    return { identitySession: recovered.identitySession, mirrorSession: recovered.mirrorSession };
  }

  return null;
}
