/**
 * Apply taskbar badge with optional focus-then-retry for NOHWND (minimized / no MainWindowHandle yet).
 * SSOT: electron/lib/profile-taskbar-native.cjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { applyNativeProfileTaskbarChromeWithRetry } = require("../../electron/lib/profile-taskbar-native.cjs");

export async function applyTaskbarBadgeWithRetry(userDataDir, label, code, opts = {}) {
  return applyNativeProfileTaskbarChromeWithRetry(userDataDir, label, code, opts);
}
