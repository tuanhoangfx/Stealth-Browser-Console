export type RouterSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fallbacks: string[];
  maxTokens: number;
  temperature: number;
};

export type RouterLocalConfigPayload = Partial<RouterSettings> & { source?: string };

export const ROUTER_SETTINGS_KEY = "stealth-console-router";

const DEFAULT_ROUTER: RouterSettings = {
  baseUrl: "https://9router.infi.io.vn/v1",
  apiKey: "",
  model: "cx/gpt-5.3-codex",
  fallbacks: ["cc/claude-sonnet-4-6"],
  maxTokens: 4096,
  temperature: 0.3
};

function mergeRouterSettings(base: RouterSettings, patch?: Partial<RouterSettings>): RouterSettings {
  if (!patch) return base;
  return {
    baseUrl: String(patch.baseUrl || base.baseUrl).trim(),
    apiKey: String(patch.apiKey || base.apiKey).trim(),
    model: String(patch.model || base.model).trim(),
    fallbacks: Array.isArray(patch.fallbacks)
      ? patch.fallbacks.map((m) => String(m).trim()).filter(Boolean)
      : base.fallbacks,
    maxTokens: Number(patch.maxTokens) || base.maxTokens,
    temperature: Number.isFinite(Number(patch.temperature)) ? Number(patch.temperature) : base.temperature
  };
}

export function readRouterSettings(): RouterSettings {
  try {
    const raw = localStorage.getItem(ROUTER_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_ROUTER };
    const parsed = JSON.parse(raw) as Partial<RouterSettings>;
    return mergeRouterSettings({ ...DEFAULT_ROUTER }, parsed);
  } catch {
    return { ...DEFAULT_ROUTER };
  }
}

export function writeRouterSettings(settings: RouterSettings) {
  localStorage.setItem(ROUTER_SETTINGS_KEY, JSON.stringify(settings));
}

function isRouterBridgeAvailable() {
  return typeof window !== "undefined" && typeof window.routerApi?.loadLocalConfig === "function";
}

async function loadRouterLocalConfigFromSources(): Promise<RouterLocalConfigPayload | null> {
  if (isRouterBridgeAvailable()) {
    try {
      const fileConfig = await window.routerApi!.loadLocalConfig<RouterLocalConfigPayload | null>();
      if (fileConfig?.apiKey?.trim()) return fileConfig;
    } catch {
      // try dev fetch fallback
    }
  }

  if (import.meta.env.DEV) {
    try {
      const response = await fetch("/config/router.local.json", { cache: "no-store" });
      if (response.ok) {
        const parsed = (await response.json()) as RouterLocalConfigPayload;
        if (parsed?.apiKey?.trim()) return parsed;
      }
    } catch {
      // no local dev config
    }
  }

  return null;
}

/** Load config/router.local.json via Electron or dev server and persist if localStorage has no key. */
export async function bootstrapRouterSettings(): Promise<RouterSettings> {
  const current = readRouterSettings();
  if (current.apiKey.trim()) return current;

  const fileConfig = await loadRouterLocalConfigFromSources();
  if (!fileConfig?.apiKey?.trim()) return current;

  const merged = mergeRouterSettings(current, fileConfig);
  writeRouterSettings(merged);
  return merged;
}

export async function pingRouter(settings: RouterSettings): Promise<{ ok: boolean; message: string }> {
  if (!settings.apiKey.trim()) {
    return { ok: false, message: "API key is empty. Add config/router.local.json or Settings → 9Router AI." };
  }
  try {
    const { routerHttp } = await import("./router-client");
    const response = await routerHttp(settings, "models", { method: "GET", timeoutMs: 12_000 });
    if (!response.ok) {
      const text = response.body;
      return { ok: false, message: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, message: "9Router reachable" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Connection failed" };
  }
}
