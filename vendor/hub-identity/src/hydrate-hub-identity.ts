import { readHubIdentity } from "./hub-identity-cache";
import { requestHubIdentityFromHost } from "./hub-identity-relay";
import { shouldAcceptHubIdentityRelay } from "./workspace-sign-out";

export type HydrateHubIdentityOptions = {
  /** Ask opener/parent for a Hub JWT when local cache is empty (default true). */
  requestFromHost?: boolean;
  /** Product applyHubIdentitySession / setSession — optional. */
  applySession?: () => Promise<unknown>;
  /** Wait after postMessage request for host response (default 550ms). */
  hostWaitMs?: number;
};

/**
 * One hydrate path for cold embed boot + header "Refresh Hub identity".
 * Sources: local cache → host postMessage → optional applySession.
 * Respects explicit Sign Out opt-out (no relay adopt).
 */
export async function hydrateHubIdentity(
  opts: HydrateHubIdentityOptions = {},
): Promise<boolean> {
  if (!shouldAcceptHubIdentityRelay()) return false;

  const requestFromHost = opts.requestFromHost !== false;
  const hostWaitMs = Math.max(0, opts.hostWaitMs ?? 550);

  if (!readHubIdentity()?.access_token?.trim() && requestFromHost) {
    if (requestHubIdentityFromHost() && hostWaitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, hostWaitMs));
    }
  }

  if (opts.applySession) {
    await opts.applySession();
  }

  return Boolean(readHubIdentity()?.access_token?.trim());
}
