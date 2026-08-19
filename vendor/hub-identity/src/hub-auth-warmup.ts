import { HUB_AUTH_DEFAULT_URL, HUB_DATA_DEFAULT_URL } from "./hub-supabase-env";

function originOf(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

/** TLS/TCP warmup so the first password grant reuses the Home Server connection. */
export function warmHubAuthConnections(urls: readonly string[] = [HUB_AUTH_DEFAULT_URL, HUB_DATA_DEFAULT_URL]): void {
  if (typeof document === "undefined") return;
  for (const url of urls) {
    const href = originOf(url);
    if (!href || document.querySelector(`link[data-hub-auth-preconnect="${href}"]`)) continue;
    const dns = document.createElement("link");
    dns.rel = "dns-prefetch";
    dns.href = href;
    const pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = href;
    pre.crossOrigin = "anonymous";
    pre.setAttribute("data-hub-auth-preconnect", href);
    document.head.append(dns, pre);
  }
}
