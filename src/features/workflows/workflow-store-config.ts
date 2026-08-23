/** Store install marks — Scripts JSON lives in `WORKFLOWS_KEY` (`workflow-defaults.ts`). */
export const WORKFLOW_STORE_INSTALLED_KEY = "stealth-console-workflow-store-installed";

/** Bundled Drive catalog path (copied to dist/workflow-store/). */
export const WORKFLOW_STORE_DRIVE_RELATIVE_PATH = "workflow-store/index.json";

/** Remote Drive override — Google Drive / hosted JSON. Empty = bundled static catalog. */
export function readConfiguredDriveManifestUrl(): string {
  return String(import.meta.env.VITE_WORKFLOW_STORE_DRIVE_MANIFEST_URL || "").trim();
}

export function isRemoteDriveManifestUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Root-absolute `/workflow-store/...` becomes `file:///workflow-store/...` on Electron
 * `loadFile(dist/index.html)` → Failed to fetch. Resolve against the page URL instead.
 */
export function resolveWorkflowStoreAssetUrl(href: string): string {
  const raw = String(href || "").trim();
  if (!raw) return raw;
  if (isRemoteDriveManifestUrl(raw)) return raw;
  const rel = raw.replace(/^\.\//, "").replace(/^\//, "");
  if (typeof window !== "undefined" && window.location?.href) {
    try {
      return new URL(rel, window.location.href).href;
    } catch {
      /* fall through */
    }
  }
  return `/${rel}`;
}

export function resolveWorkflowStoreDriveManifestUrl(): string {
  const configured = readConfiguredDriveManifestUrl();
  if (isRemoteDriveManifestUrl(configured)) return configured;
  return resolveWorkflowStoreAssetUrl(configured || WORKFLOW_STORE_DRIVE_RELATIVE_PATH);
}

/** @deprecated Prefer resolveWorkflowStoreDriveManifestUrl() — kept for existing imports. */
export const WORKFLOW_STORE_DRIVE_MANIFEST_URL = WORKFLOW_STORE_DRIVE_RELATIVE_PATH;
