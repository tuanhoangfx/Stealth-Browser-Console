const DEACTIVATED_WORKSPACE = "deactivated_workspace";

export function parseRouterErrorBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";

  try {
    const json = JSON.parse(trimmed) as { error?: { message?: string } };
    const message = json.error?.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  } catch {
    /* plain text */
  }

  return trimmed;
}

export function formatRouterError(status: number, body: string, model?: string): string {
  const detail = parseRouterErrorBody(body);

  if (detail.includes(DEACTIVATED_WORKSPACE) || detail.includes("402")) {
    const modelHint = model ? ` (${model})` : "";
    return (
      `9Router workspace deactivated${modelHint}. ` +
      "Codex models are unavailable — use xai/grok-3 in config/router.local.json " +
      "or run: node scripts/sync-9router-from-p0007.mjs"
    );
  }

  if (status === 404 && detail.includes("model_not_found")) {
    return `9Router model unavailable${model ? ` (${model})` : ""}. ${detail.slice(0, 180)}`;
  }

  const prefix = status ? `9Router ${status}` : "9Router network";
  return `${prefix}: ${(detail || "Request failed").slice(0, 320)}`;
}

export function isRouterRetryableModelError(_status: number, message: string): boolean {
  const detail = message.toLowerCase();
  if (detail.includes(DEACTIVATED_WORKSPACE) || detail.includes("workspace deactivated")) return true;
  if (detail.includes("model_not_found") || detail.includes("model unavailable")) return true;
  if (detail.includes("429") || detail.includes("rate limit")) return true;
  return false;
}
