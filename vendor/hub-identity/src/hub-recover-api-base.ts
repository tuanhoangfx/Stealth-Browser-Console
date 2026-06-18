type ImportMetaEnv = { DEV?: boolean; VITE_CHATCENTER_WORKER_URL?: string };

function readEnvUrl(): string {
  try {
    return String((import.meta as ImportMeta & { env?: ImportMetaEnv }).env?.VITE_CHATCENTER_WORKER_URL ?? "").trim();
  } catch {
    return "";
  }
}

function isDevRuntime(): boolean {
  try {
    return Boolean((import.meta as ImportMeta & { env?: ImportMetaEnv }).env?.DEV);
  } catch {
    return false;
  }
}

/** Hub auth worker origin — dev localhost, prod Chat Center VPS unless overridden. */
export function resolveHubRecoverApiBase(options: {
  envUrl?: string;
  devDefault?: string;
  prodDefault?: string;
  isDev?: boolean;
} = {}): string {
  const fromEnv = (options.envUrl ?? readEnvUrl()).replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const isDev = options.isDev ?? isDevRuntime();
  if (isDev) return (options.devDefault ?? "http://127.0.0.1:3921").replace(/\/$/, "");
  return (options.prodDefault ?? "https://chathub.infi.io.vn").replace(/\/$/, "");
}

export function createHubRecoverApiUrl(base: string) {
  const origin = base.replace(/\/$/, "");
  return (path: string) => {
    const p = path.startsWith("/") ? path : `/${path}`;
    return origin ? `${origin}${p}` : p;
  };
}
