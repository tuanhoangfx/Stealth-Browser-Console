/** Drive manifest URL — override via VITE_WORKFLOW_STORE_DRIVE_MANIFEST_URL (e.g. Google Drive export link). */
export const WORKFLOW_STORE_DRIVE_MANIFEST_URL =
  import.meta.env.VITE_WORKFLOW_STORE_DRIVE_MANIFEST_URL || "/workflow-store/index.json";

export const WORKFLOW_STORE_INSTALLED_KEY = "stealth-console-workflow-store-installed";
