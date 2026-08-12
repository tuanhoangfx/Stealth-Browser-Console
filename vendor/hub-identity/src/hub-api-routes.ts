/** CF Worker gateway — static SPA hosts (Lenovo/nginx) have no /api serverless. */
export const HUB_API_GATEWAY_ORIGIN = "https://api.infi.io.vn";

function bakedHubApiOrigin(): string {
  return String(import.meta.env.VITE_HUB_API_ORIGIN ?? "")
    .trim()
    .replace(/\/$/, "");
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
}

/** Resolve Hub API origin — baked env, else CF gateway on public hosts, else same-origin (dev/Vercel). */
export function hubApiOrigin(): string {
  const baked = bakedHubApiOrigin();
  if (baked) return baked;
  if (typeof window !== "undefined" && !isLocalDevHost(window.location.hostname)) {
    return HUB_API_GATEWAY_ORIGIN;
  }
  return "";
}

export function hubResolveLoginApiUrl(override?: string): string {
  if (override) return override;
  const origin = hubApiOrigin();
  return origin ? `${origin}/hub/auth/resolve-login` : "/api/hub/auth/resolve-login";
}

export function hubSyncMirrorPasswordApiUrl(override?: string): string {
  if (override) return override;
  const origin = hubApiOrigin();
  return origin ? `${origin}/hub/auth/sync-mirror-password` : "/api/hub/auth/sync-mirror-password";
}
