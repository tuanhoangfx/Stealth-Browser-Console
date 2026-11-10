import { useEffect, useState } from "react";
import { fetchExtensionIcon, isStealthDesktop } from "../../api";
import { DEFAULT_EXTENSION_ICONS } from "../../lib/default-extension-icons";
import { COOKIE_BRIDGE_STORE_ID, SURFSHARK_STORE_ID } from "../../lib/stealth-extension-store-ids";

export type ExtensionIconMap = Record<"e0001" | "e0002" | "surfshark", string | null>;

const cache: ExtensionIconMap = {
  e0001: DEFAULT_EXTENSION_ICONS.e0001,
  e0002: DEFAULT_EXTENSION_ICONS.e0002,
  surfshark: DEFAULT_EXTENSION_ICONS.surfshark,
};
let inFlight: Promise<ExtensionIconMap> | null = null;
let resolved = false;

function loadExtensionIconsOnce(): Promise<ExtensionIconMap> {
  if (resolved) return Promise.resolve(cache);
  if (!isStealthDesktop()) {
    resolved = true;
    return Promise.resolve(cache);
  }
  if (!inFlight) {
    inFlight = Promise.allSettled([
      fetchExtensionIcon(COOKIE_BRIDGE_STORE_ID, 48),
      fetchExtensionIcon("e0002", 48),
      fetchExtensionIcon(SURFSHARK_STORE_ID, 48),
    ]).then(([e0001Result, e0002Result, surfsharkResult]) => {
      if (e0001Result.status === "fulfilled" && e0001Result.value) {
        cache.e0001 = e0001Result.value;
      }
      if (e0002Result.status === "fulfilled" && e0002Result.value) {
        cache.e0002 = e0002Result.value;
      }
      if (surfsharkResult.status === "fulfilled" && surfsharkResult.value) {
        cache.surfshark = surfsharkResult.value;
      }
      resolved = true;
      return { ...cache };
    });
  }
  return inFlight;
}

/**
 * Resolve actual extension icons from manifest.json via IPC, seeded with real bundled 48x48 PNGs.
 */
export function useExtensionIcons(): ExtensionIconMap {
  const [icons, setIcons] = useState<ExtensionIconMap>(() => ({ ...cache }));

  useEffect(() => {
    let active = true;
    void loadExtensionIconsOnce().then((next) => {
      if (active) setIcons({ ...next });
    });
    return () => {
      active = false;
    };
  }, []);

  return icons;
}
