export type NormalizeHubAuthErrorOptions = {
  /** Mention Tool Hub (P0004) in invalid-credentials copy */
  toolHubHint?: boolean;
  /** Extra network / quota messages for dual-workspace tools */
  dualWorkspace?: boolean;
};

export function formatHubAuthErrorMessage(raw: unknown): string {
  // Bare status codes (e.g. 0 from a failed XHR) must not surface in the gate UI.
  if (typeof raw === "number") return "";
  if (raw instanceof Error) return raw.message.trim();
  if (typeof raw === "string") {
    const text = raw.trim();
    return /^\d+$/.test(text) ? "" : text;
  }
  if (raw && typeof raw === "object" && "message" in raw) {
    const msg = (raw as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) {
      const text = msg.trim();
      return /^\d+$/.test(text) ? "" : text;
    }
  }
  const text = String(raw ?? "").trim();
  if (text === "[object Object]" || /^\d+$/.test(text)) return "";
  return text;
}

export function normalizeHubAuthError(raw: unknown, opts: NormalizeHubAuthErrorOptions = {}) {
  const msg = formatHubAuthErrorMessage(raw);
  const lower = msg.toLowerCase();
  if (lower.includes("rate limit")) return "Temporary sign-in issue. Please try again in a moment.";
  if (lower.includes("sign-in service unavailable")) return msg;
  if (lower.includes("user id not found") || lower.includes("username not found")) {
    return opts.toolHubHint
      ? `${msg} Same username as Tool Hub (P0004).`
      : msg;
  }
  if (lower.includes("phone number not found")) return msg;
  if (lower.includes("account linked to this phone")) {
    return opts.toolHubHint
      ? "Incorrect password for the account linked to this phone. Use that account's Tool Hub (P0004) password, or sign in with username/email."
      : msg;
  }
  if (lower.includes("incorrect password for this username")) {
    return opts.toolHubHint
      ? "Incorrect password for this username. If you recently changed your Tool Hub (P0004) password, use the new one."
      : msg;
  }
  if (lower.includes("invalid login credentials")) {
    return opts.toolHubHint
      ? "Incorrect username/email/phone or password. Use the same credentials as Tool Hub (P0004)."
      : "Incorrect username/email/phone or password.";
  }
  if (lower.includes("user already registered")) {
    return "This username or email is already registered.";
  }
  if (lower.includes("auth_timeout")) {
    return opts.dualWorkspace
      ? "Sign-in timed out — Tool Hub or workspace data plane is slow. Wait a moment and try again."
      : "Sign-in timed out. Please try again.";
  }
  if (opts.dualWorkspace) {
    if (lower.includes("exceed_egress_quota") || lower.includes("egress_quota")) {
      return "Workspace data API quota exceeded on Home Server. Check hub-api / sb-api status.";
    }
    if (msg === "Failed to fetch" || lower.includes("networkerror") || lower.includes("load failed")) {
      return "Cannot reach Tool Hub or workspace data API (Home Server). Check hub-api / sb-api and Cloudflare tunnel.";
    }
  } else if (msg === "Failed to fetch" || lower.includes("networkerror")) {
    return "Cannot reach Tool Hub identity (hub-api). Check network and Cloudflare tunnel.";
  }
  return msg || "Sign-in failed. Please try again.";
}
