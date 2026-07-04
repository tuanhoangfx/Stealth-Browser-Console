import { useEffect, useState } from "react";
import { fetchExtensionIcon } from "../../api";
import { isStealthDesktop } from "../../api";

const COOKIE_BRIDGE_STORE_ID = "kaaadageakdandpobcofplmfbjfjabdk";
const SURFSHARK_STORE_ID = "ailoabdmgclmfmhdagmlohpjlbpffblp";

export type ExtensionIconMap = Record<"e0001" | "surfshark", string | null>;

const cache: ExtensionIconMap = { e0001: null, surfshark: null };
let fetched = false;

/**
 * Resolve actual extension icons from manifest.json via IPC.
 * Falls back to static PNGs in dev/web mode.
 */
export function useExtensionIcons(): ExtensionIconMap {
  const [icons, setIcons] = useState<ExtensionIconMap>(cache);

  useEffect(() => {
    if (fetched) return;
    if (!isStealthDesktop()) {
      cache.e0001 = "/icons/ext-e0001-16.png";
      cache.surfshark = "/icons/ext-surfshark-16.png";
      fetched = true;
      setIcons({ ...cache });
      return;
    }
    fetched = true;
    Promise.allSettled([
      fetchExtensionIcon(COOKIE_BRIDGE_STORE_ID, 48),
      fetchExtensionIcon(SURFSHARK_STORE_ID, 48),
    ]).then(([e0001Result, surfsharkResult]) => {
      cache.e0001 =
        (e0001Result.status === "fulfilled" && e0001Result.value) ||
        "/icons/ext-e0001-16.png";
      cache.surfshark =
        (surfsharkResult.status === "fulfilled" && surfsharkResult.value) ||
        "/icons/ext-surfshark-16.png";
      setIcons({ ...cache });
    });
  }, []);

  return icons;
}
