/**
 * Data Box mirror auth emails — one Hub identity, one Data Box GoTrue key.
 *
 * SSOT: Hub opaque `u_<hub_uuid>@auth.infi.internal` only.
 * Never invent `@infix1.io.vn` / legacy synthetics.
 */
import { isHubOpaqueAuthEmail, looksLikeEmail, sanitizeHubLoginInput } from "./hub-login";

export function resolveDataBoxMirrorAuthEmails(opts: {
  /** Hub GoTrue email after successful identity sign-in (opaque preferred). */
  mirrorEmail?: string | null;
  loginInput: string;
}): string[] {
  const mirror = String(opts.mirrorEmail ?? "").trim().toLowerCase();
  const out: string[] = [];
  const push = (value: string) => {
    const next = String(value ?? "").trim().toLowerCase();
    if (!next || !next.includes("@") || out.includes(next)) return;
    // Reject leftover synthetics — migrate scripts own those rows.
    if (next.endsWith("@infix1.io.vn") || next.endsWith("@id.hub.x1z10.local")) return;
    out.push(next);
  };

  if (mirror) {
    push(mirror);
    return out;
  }

  // Username without Hub session email cannot invent a mirror — caller must pass opaque.
  const login = sanitizeHubLoginInput(opts.loginInput);
  if (login && looksLikeEmail(login) && isHubOpaqueAuthEmail(login)) {
    push(login);
  }
  return out;
}
