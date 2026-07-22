import { createHubIdentityUrls } from "@tool-workspace/hub-identity";

const base = createHubIdentityUrls({
  dev: import.meta.env.DEV,
});

/**
 * Standalone P0003 dev runs on :5175 — use same origin for identity bridge (no P0004 :5176 iframe).
 * Packaged / prod still resolves Tool Hub at infi.io.vn or HUB_DEV_ORIGIN when embedded in Hub.
 */
export function resolveToolHubOrigin(): string {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return window.location.origin;
  }
  return base.resolveToolHubOrigin();
}

export function isToolHubOrigin(origin: string): boolean {
  if (import.meta.env.DEV && typeof window !== "undefined" && origin === window.location.origin) {
    return true;
  }
  return base.isToolHubOrigin(origin);
}
