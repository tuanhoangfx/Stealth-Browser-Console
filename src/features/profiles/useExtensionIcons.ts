import { useEffect, useState } from "react";
import { fetchExtensionIcon } from "../../api";
import { isStealthDesktop } from "../../api";
import { resolveHubBrandAssetSrc } from "../../lib/hub-brand-asset-src";
import { resolveHubBrandIcon } from "@tool-workspace/hub-ui";

const COOKIE_BRIDGE_STORE_ID = "kaaadageakdandpobcofplmfbjfjabdk";
const SURFSHARK_STORE_ID = "ailoabdmgclmfmhdagmlohpjlbpffblp";
const SURFSHARK_BRAND_SRC = resolveHubBrandAssetSrc(resolveHubBrandIcon("surfshark")?.src ?? "");

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
      fetched = true;
      setIcons({ e0001: null, surfshark: SURFSHARK_BRAND_SRC || null });
      return;
    }
    fetched = true;
    Promise.allSettled([
      fetchExtensionIcon(COOKIE_BRIDGE_STORE_ID, 48),
      fetchExtensionIcon(SURFSHARK_STORE_ID, 48),
    ]).then(([e0001Result, surfsharkResult]) => {
      cache.e0001 = e0001Result.status === "fulfilled" ? e0001Result.value : null;
      const surfsharkIpc = surfsharkResult.status === "fulfilled" ? surfsharkResult.value : null;
      cache.surfshark = surfsharkIpc || SURFSHARK_BRAND_SRC || null;
      setIcons({ ...cache });
    });
  }, []);

  return icons;
}
