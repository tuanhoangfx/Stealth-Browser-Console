/**
 * Host-embed marker for Hub auth clients.
 *
 * A hosted screen (P0004 Users/Organization inside P0015/P0012) must never own the Hub
 * session: a second GoTrue client with `persistSession` + `autoRefreshToken` rotates the
 * refresh token behind the host's identity client, which invalidates the shared
 * `x1z10:hub-identity-v2` snapshot mid-session — the "signed out by itself" flip-flop.
 *
 * Set this from an embed entry module that is imported before the app graph, then build the
 * client read-only (`persistSession: false, autoRefreshToken: false`).
 */

const FLAG = "__hubAuthHostEmbed";

type FlagCarrier = { [FLAG]?: boolean };

function carrier(): FlagCarrier | null {
  if (typeof globalThis === "undefined") return null;
  return globalThis as unknown as FlagCarrier;
}

export function markHubAuthHostEmbed(): void {
  const target = carrier();
  if (target) target[FLAG] = true;
}

export function isHubAuthHostEmbed(): boolean {
  return carrier()?.[FLAG] === true;
}
