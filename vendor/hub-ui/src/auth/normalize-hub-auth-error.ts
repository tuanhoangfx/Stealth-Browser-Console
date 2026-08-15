export type NormalizeHubAuthErrorOptions = {
  /** Mention Tool Hub (P0004) in invalid-credentials copy */
  toolHubHint?: boolean;
  /** Extra network / quota messages for dual-workspace tools */
  dualWorkspace?: boolean;
};

export function formatHubAuthErrorMessage(raw: unknown): string {
  if (raw instanceof Error) return raw.message.trim();
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object" && "message" in raw) {
    const msg = (raw as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  const text = String(raw ?? "").trim();
  return text === "[object Object]" ? "" : text;
}

export function normalizeHubAuthError(raw: unknown, opts: NormalizeHubAuthErrorOptions = {}) {
  const msg = formatHubAuthErrorMessage(raw);
  const lower = msg.toLowerCase();
  if (lower.includes("rate limit")) return "Temporary sign-in issue. Please try again in a moment.";
  if (lower.includes("sign-in service unavailable")) return msg;
  if (lower.includes("user id not found")) return msg;
  if (lower.includes("invalid login credentials")) {
    return opts.toolHubHint
      ? "Incorrect user ID/email or password. Use the same credentials as Tool Hub (P0004)."
      : "Incorrect user ID/email or password.";
  }
  if (lower.includes("user already registered")) return "This user ID or email is already registered.";
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
