import type { Session, User } from "@supabase/supabase-js";
import { extractAuthErrorText } from "./extract-auth-error-text";
import { fetchHubAuth, HUB_GOTRUE_FETCH_TIMEOUT_MS } from "./hub-auth-fetch";

export const HUB_USER_TELEGRAM_FLUSH_URL = "https://infi.io.vn/api/hub/users/telegram-flush";

export function kickHubUserTelegramFlush(
  fetchImpl: typeof fetch = fetch,
  extra: { userId?: string; toolCode?: string } = {},
) {
  try {
    const body: Record<string, string> = {};
    const userId = String(extra.userId || "").trim();
    const toolCode = String(extra.toolCode || "").trim().toUpperCase();
    if (userId) body.userId = userId;
    if (/^P\d{4}$/.test(toolCode)) body.toolCode = toolCode;
    void Promise.resolve(
      fetchImpl(HUB_USER_TELEGRAM_FLUSH_URL, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ).catch(() => {});
  } catch {
    /* never fail Sign In */
  }
}

export type GoTruePasswordGrantInput = {
  supabaseUrl: string;
  anonKey: string;
  email: string;
  password: string;
  fetchImpl?: typeof fetch;
  toolCode?: string;
};

/**
 * One GoTrue password grant (`POST /auth/v1/token`) — no extra `/auth/v1/user` round-trip.
 * supabase-js `signInWithPassword` / `setSession` always call getUser (~0.5–2s on hub-api).
 * Dual-plane + P0004 gate use this so Sign In can close after a single POST (P0004 parity).
 */
export async function grantGoTruePasswordSession(
  input: GoTruePasswordGrantInput,
): Promise<{ session: Session | null; error: Error | null }> {
  const url = String(input.supabaseUrl ?? "").trim().replace(/\/$/, "");
  const anonKey = String(input.anonKey ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  if (!url || !anonKey || !email || !password) {
    return { session: null, error: new Error("Tool Hub identity is not configured.") };
  }

  const doFetch = input.fetchImpl ?? fetch;
  try {
    const res = await fetchHubAuth(
      `${url}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
      { timeoutMs: HUB_GOTRUE_FETCH_TIMEOUT_MS, retries: 1, fetchImpl: doFetch },
    );
    const payload = (await res.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      expires_at?: number;
      token_type?: string;
      user?: User | null;
      error_description?: string;
      msg?: string;
      error?: string;
    } | null;
    if (!res.ok || !payload?.access_token) {
      if (res.status === 502 || res.status === 503 || res.status === 504 || res.status === 530) {
        return {
          session: null,
          error: new Error(
            `Sign-in service is offline (HTTP ${res.status}). Wait a moment and try again.`,
          ),
        };
      }
      const message = extractAuthErrorText(payload) || `HTTP ${res.status}`;
      return { session: null, error: new Error(message) };
    }
    const expiresIn = Number(payload.expires_in || 3600);
    const expiresAt =
      typeof payload.expires_at === "number"
        ? payload.expires_at
        : Math.floor(Date.now() / 1000) + Math.max(60, expiresIn);
    const session = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token ?? "",
      expires_in: expiresIn,
      expires_at: expiresAt,
      token_type: payload.token_type || "bearer",
      user: (payload.user ?? { id: "", email }) as User,
    } as Session;
    kickHubUserTelegramFlush(doFetch, {
      userId: session.user?.id,
      toolCode: input.toolCode,
    });
    return { session, error: null };
  } catch (err) {
    return { session: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export function readSupabaseGoTrueTarget(
  client: unknown,
): { supabaseUrl: string; anonKey: string } | null {
  if (!client || typeof client !== "object") return null;
  const rec = client as { supabaseUrl?: unknown; supabaseKey?: unknown };
  const supabaseUrl = String(rec.supabaseUrl ?? "").trim().replace(/\/$/, "");
  const anonKey = String(rec.supabaseKey ?? "").trim();
  if (!supabaseUrl || !anonKey) return null;
  return { supabaseUrl, anonKey };
}

type GoTrueSessionClient = {
  auth?: {
    setSession?: (tokens: { access_token: string; refresh_token: string }) => Promise<unknown>;
  };
};

/**
 * Hydrate supabase-js in the background. Do not await — `setSession` always hits `/auth/v1/user`.
 */
export function adoptGrantedGoTrueSession(
  client: GoTrueSessionClient | null | undefined,
  session: Session | null | undefined,
): void {
  if (!client?.auth?.setSession || !session?.access_token) return;
  void Promise.resolve(
    client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token ?? "",
    }),
  ).catch(() => {
    /* /user hydrate is best-effort — cache already holds the JWT */
  });
}
