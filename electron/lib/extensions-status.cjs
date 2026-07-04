const { nativeExtensionsEnabled, extensionLaunchMode } = require("./extension-launch-mode.cjs");
const {
  listAllLaunchExtensions,
  installStoreExtension,
  installUnpackedExtension,
  parseStoreId,
  resolveExtensionIconDataUri,
} = require("./webstore-extension.cjs");

function getExtensionsStatus(userDataRoot) {
  const cached = listAllLaunchExtensions(userDataRoot).map((ext) => ({
    ...ext,
    iconDataUri: resolveExtensionIconDataUri(ext.unpackedPath, 48) ?? undefined,
  }));
  return {
    launchMode: extensionLaunchMode(),
    nativeMode: nativeExtensionsEnabled(),
    cached,
    webStoreInstallHint:
      "Paste any Chrome Web Store ID or URL. Local unpacked folders are supported via Load unpacked folder.",
  };
}

module.exports = {
  getExtensionsStatus,
  installStoreExtension,
  installUnpackedExtension,
  parseStoreId,
};
