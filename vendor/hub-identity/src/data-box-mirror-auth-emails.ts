/**
 * Data Box / workspace-data mirror auth emails — one Hub identity, one data GoTrue key.
 *
 * Trust Hub-validated `mirrorEmail` (opaque **or** provisioned `cs*@infix1.io.vn` store buyers).
 * Never invent `@infix1.io.vn` from a username.
 */
import { isHubOpaqueAuthEmail, looksLikeEmail, sanitizeHubLoginInput } from "./hub-login";

export function resolveDataBoxMirrorAuthEmails(opts: {
  /** Hub GoTrue email after successful identity sign-in (opaque preferred). */
  mirrorEmail?: string | null;
  loginInput: string;
}): string[] {
  const mirror = String(opts.mirrorEmail ?? "").trim().toLowerCase();
  const out: string[] = [];
  const push = (value: string, allowProvisionedSynthetic = false) => {
    const next = String(value ?? "").trim().toLowerCase();
    if (!next || !next.includes("@") || out.includes(next)) return;
    if (
      !allowProvisionedSynthetic &&
      (next.endsWith("@infix1.io.vn") || next.endsWith("@id.hub.x1z10.local"))
    ) {
      return;
    }
    out.push(next);
  };

  if (mirror) {
    push(mirror, true);
    return out;
  }

  // Username without Hub session email cannot invent a mirror — caller must pass Hub email.
  const login = sanitizeHubLoginInput(opts.loginInput);
  if (login && looksLikeEmail(login) && isHubOpaqueAuthEmail(login)) {
    push(login);
  }
  return out;
}
