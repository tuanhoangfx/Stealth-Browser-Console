const path = require("node:path");
const { getExtensionToggles } = require("./app-settings.cjs");
const { resolveEffectiveExtensionToggles, SURFSHARK_STORE_ID } = require("./extension-toggles.cjs");
const { installStoreExtension } = require("./webstore-extension.cjs");
const { prepareProfileExtensions } = require("./native-extension-load.cjs");

function profileChromeDir(userDataRoot, profileId) {
  return path.join(userDataRoot, "profiles", String(profileId));
}

/** Pin store extensions when a profile override enables them while global default is off. */
async function ensureProfileExtensionPins(profile, userDataRoot, cloakCacheDir) {
  if (!profile?.id || !userDataRoot) return { installed: [] };
  const global = getExtensionToggles();
  const effective = resolveEffectiveExtensionToggles(global, profile.extensionOverrides);
  const userDataDir = profileChromeDir(userDataRoot, profile.id);
  const installed = [];

  if (effective.surfshark && !global.surfshark) {
    try {
      await installStoreExtension(userDataRoot, SURFSHARK_STORE_ID, { profileIds: [profile.id] });
      installed.push("surfshark");
    } catch (error) {
      console.warn(
        "[extension-profile] surfshark install:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (cloakCacheDir) {
    try {
      prepareProfileExtensions(userDataDir, userDataRoot, cloakCacheDir, { effectiveToggles: effective });
    } catch (error) {
      console.warn(
        "[extension-profile] prepare:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { installed, effective };
}

module.exports = {
  profileChromeDir,
  ensureProfileExtensionPins,
};
