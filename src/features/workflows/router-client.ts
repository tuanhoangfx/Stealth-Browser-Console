import type { RouterSettings } from "./router-settings";

export type RouterHttpResult = {
  ok: boolean;
  status: number;
  body: string;
};

function isRouterRequestBridgeAvailable() {
  return typeof window !== "undefined" && typeof window.routerApi?.request === "function";
}

function resolveRouterRequestUrl(settings: RouterSettings, path: string) {
  const normalizedPath = path.replace(/^\//, "");
  if (isRouterRequestBridgeAvailable()) {
    return `${settings.baseUrl.replace(/\/$/, "")}/${normalizedPath}`;
  }
  if (import.meta.env.DEV) {
    try {
      const basePath = new URL(settings.baseUrl).pathname.replace(/\/$/, "");
      return `/router-api${basePath}/${normalizedPath}`;
    } catch {
      return `/router-api/v1/${normalizedPath}`;
    }
  }
  return `${settings.baseUrl.replace(/\/$/, "")}/${normalizedPath}`;
}

/** 9Router HTTP via Electron main (avoids renderer CORS / Failed to fetch). */
export async function routerHttp(
  settings: RouterSettings,
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<RouterHttpResult> {
  const method = (init.method || "GET").toUpperCase();
  const timeoutMs = init.timeoutMs ?? 120_000;

  if (isRouterRequestBridgeAvailable()) {
    return window.routerApi!.request<RouterHttpResult>({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      path,
      method,
      body: init.body,
      timeoutMs
    });
  }

  const url = resolveRouterRequestUrl(settings, path);
  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}
