import { useEffect } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { devHubAutoSignIn } from "./dev-hub-auto-sign-in";
import { isDevAutoLoginEnabled } from "./dev-auto-login";

export type DevHubAutoSignInBootOpts = {
  enabled: boolean;
  getClient: () => SupabaseClient | null;
  readCachedSession: () => Session | null;
  onSession: (session: Session) => void;
  onBootLoading?: (loading: boolean) => void;
};

/** Dev localhost: silent Hub sign-in before auth gate flashes. */
export function useDevHubAutoSignInBoot(opts: DevHubAutoSignInBootOpts): void {
  const { enabled, getClient, readCachedSession, onSession, onBootLoading } = opts;

  useEffect(() => {
    if (!isDevAutoLoginEnabled() || !enabled) return;
    if (readCachedSession()) return;
    const client = getClient();
    if (!client) return;

    let cancelled = false;
    onBootLoading?.(true);
    void (async () => {
      try {
        const ok = await devHubAutoSignIn(client);
        if (cancelled || !ok) return;
        const { data } = await client.auth.getSession();
        if (data.session) onSession(data.session);
      } finally {
        if (!cancelled) onBootLoading?.(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Boot once per mount — callbacks are stable enough from parent useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
