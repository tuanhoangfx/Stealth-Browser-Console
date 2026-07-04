/**
 * Extension launch policy for CloakBrowser profiles.
 *
 * native  — extensions load from Chrome profile prefs (default). Web Store installs
 *           via P0003 installer; chrome://extensions works like Chrome.
 * managed — legacy: only whitelisted dirs via --load-extension + --disable-extensions-except.
 */
function extensionLaunchMode() {
  const raw = String(process.env.STEALTH_EXTENSION_MODE ?? "native").toLowerCase();
  if (raw === "managed" || raw === "legacy" || raw === "load") return "managed";
  return "native";
}

function nativeExtensionsEnabled() {
  return extensionLaunchMode() === "native";
}

function managedExtensionsEnabled() {
  return extensionLaunchMode() === "managed";
}

function profileExtensionsEnabled() {
  try {
    const { getProfileExtensionsEnabled } = require("./app-settings.cjs");
    return getProfileExtensionsEnabled();
  } catch {
    return true;
  }
}

module.exports = {
  extensionLaunchMode,
  nativeExtensionsEnabled,
  managedExtensionsEnabled,
  profileExtensionsEnabled,
};
