"use strict";

function truthyEnv(name) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/**
 * Agent / CI smokes — force headless CloakBrowser so automated tests do not steal focus.
 * Only explicit env flags (set by reload-and-verify / run-unit-tests), not generic Cursor IDE vars.
 */
function isAgentSmokeLaunch() {
  if (truthyEnv("STEALTH_AGENT_SMOKE")) return true;
  if (truthyEnv("STEALTH_HEADLESS_SMOKE")) return true;
  if (truthyEnv("CURSOR_AGENT")) return true;
  return false;
}

module.exports = { isAgentSmokeLaunch };
