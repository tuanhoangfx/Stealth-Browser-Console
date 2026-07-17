"use strict";

const { isAgentSmokeRequest } = require("./agent-smoke-context.cjs");

function truthyEnv(name) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function isPackagedElectronApp() {
  try {
    const { app } = require("electron");
    return Boolean(app?.isPackaged);
  } catch {
    return false;
  }
}

/**
 * Agent / CI smokes — force headless CloakBrowser so automated tests do not steal focus.
 * Packaged desktop UI is always headed unless per-request API agent-smoke flag is set.
 */
function isAgentSmokeLaunch() {
  if (isAgentSmokeRequest()) return true;
  if (isPackagedElectronApp()) return false;
  // Explicit opt-in only — never CURSOR_AGENT (Cursor IDE sets it globally; interactive dev must stay headed).
  if (truthyEnv("STEALTH_AGENT_SMOKE")) return true;
  if (truthyEnv("STEALTH_HEADLESS_SMOKE")) return true;
  return false;
}

module.exports = { isAgentSmokeLaunch };
