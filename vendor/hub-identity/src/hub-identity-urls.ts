export const HUB_DEV_ORIGIN = "http://127.0.0.1:5176";
export const HUB_PRODUCTION_ORIGIN = "https://infi.io.vn";

export type HubIdentityUrlsInput = {
  toolHubUrl?: string | null;
  /** Hostnames that imply Hub lives at HUB_PRODUCTION_ORIGIN (e.g. chathub.infi.io.vn). */
  toolHostnames?: string[];
  dev?: boolean;
};

export type HubIdentityUrls = {
  resolveToolHubOrigin: () => string;
  toolHubUsersUrl: () => string;
  toolHubSignInUrl: (returnTo?: string) => string;
  isToolHubOrigin: (origin: string) => boolean;
};

export function createHubIdentityUrls(input: HubIdentityUrlsInput = {}): HubIdentityUrls {
  const toolHostnames = new Set(
    (input.toolHostnames ?? []).map((host) => host.trim().toLowerCase()).filter(Boolean),
  );

  const resolveToolHubOrigin = (): string => {
    const fromEnv = input.toolHubUrl?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, "");

    if (typeof window !== "undefined") {
      const host = window.location.hostname.toLowerCase();
      for (const pattern of toolHostnames) {
        if (host === pattern || host.endsWith(`.${pattern}`)) {
          return HUB_PRODUCTION_ORIGIN;
        }
      }
    }

    return input.dev ? HUB_DEV_ORIGIN : HUB_PRODUCTION_ORIGIN;
  };

  const toolHubUsersUrl = () => `${resolveToolHubOrigin()}/users`;

  const toolHubSignInUrl = (returnTo?: string) => {
    const base = toolHubUsersUrl();
    if (!returnTo?.trim()) return base;
    const url = new URL(base);
    url.searchParams.set("returnTo", returnTo.trim());
    return url.toString();
  };

  const isToolHubOrigin = (origin: string): boolean => {
    if (origin === HUB_DEV_ORIGIN || origin === HUB_PRODUCTION_ORIGIN) return true;
    try {
      const host = new URL(origin).hostname;
      return host === "infi.io.vn" || host.endsWith(".infi.io.vn") || host.endsWith(".vercel.app");
    } catch {
      return false;
    }
  };

  return {
    resolveToolHubOrigin,
    toolHubUsersUrl,
    toolHubSignInUrl,
    isToolHubOrigin,
  };
}
