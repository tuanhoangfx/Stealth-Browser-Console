import { useEffect, useMemo, useState } from "react";
import { buildConsoleVersionMetaItems } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "../lib/app-meta";
import { stealthVersionClockInput } from "../lib/app-release";
import toolManifest from "../../tool.manifest.json";
import { useStealthDesktopUpdate } from "./useStealthDesktopUpdate";

const SEMVER_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function pickHigherSemver(a: string, b?: string | null): string {
  const cleanA = String(a || "").replace(/^v/i, "").trim();
  const cleanB = String(b || "").replace(/^v/i, "").trim();
  if (!cleanB) return cleanA;
  if (!cleanA) return cleanB;
  return SEMVER_COLLATOR.compare(cleanB, cleanA) >= 0
    ? cleanB
    : cleanA;
}

/** Version clock + desktop updater folded into the single HubVersionReleaseNotes trigger. */
export function useStealthVersionMetaItems() {
  const manifestVersion = (toolManifest as { version?: string; release?: { version?: string } })?.version ||
    (toolManifest as { release?: { version?: string } })?.release?.version ||
    "";
  const baseVersion = pickHigherSemver(APP_VERSION, manifestVersion);

  const [liveVersion, setLiveVersion] = useState<string>(() => {
    const win = typeof window !== "undefined"
      ? (window as unknown as { __HUB_ELECTRON_VERSION__?: string })
      : null;
    return pickHigherSemver(baseVersion, win?.__HUB_ELECTRON_VERSION__);
  });
  const [livePublishedAt, setLivePublishedAt] = useState<string | undefined>(() => {
    const win = typeof window !== "undefined"
      ? (window as unknown as { __HUB_ELECTRON_VERSION_AT__?: string })
      : null;
    return win?.__HUB_ELECTRON_VERSION_AT__;
  });

  useEffect(() => {
    const syncVersion = () => {
      const win = window as unknown as {
        __HUB_ELECTRON_VERSION__?: string;
        __HUB_ELECTRON_VERSION_AT__?: string;
        stealthApi?: { appInfo?: () => Promise<{ version?: string }> };
      };
      const metaEl = document.querySelector('meta[name="app-version"]');
      const metaVer = metaEl?.getAttribute("content") || "";
      const immediate = pickHigherSemver(
        pickHigherSemver(baseVersion, metaVer),
        win.__HUB_ELECTRON_VERSION__,
      );
      setLiveVersion((prev) => pickHigherSemver(prev, immediate));
      if (win.__HUB_ELECTRON_VERSION_AT__) {
        setLivePublishedAt(win.__HUB_ELECTRON_VERSION_AT__);
      }
      if (typeof win.stealthApi?.appInfo === "function") {
        win.stealthApi
          .appInfo()
          .then((info) => {
            if (info?.version) {
              const best = pickHigherSemver(immediate, info.version);
              win.__HUB_ELECTRON_VERSION__ = best;
              setLiveVersion((prev) => pickHigherSemver(prev, best));
            }
          })
          .catch(() => {});
      }
    };
    syncVersion();
    window.addEventListener("hub:electron-dev-ready", syncVersion);
    window.addEventListener("focus", syncVersion);
    return () => {
      window.removeEventListener("hub:electron-dev-ready", syncVersion);
      window.removeEventListener("focus", syncVersion);
    };
  }, [baseVersion]);

  const effectiveVersion = pickHigherSemver(baseVersion, liveVersion);

  const metaItems = useMemo(() => {
    const clock = stealthVersionClockInput(effectiveVersion);
    if (livePublishedAt) {
      clock.changelogPublishedAt = livePublishedAt;
    }
    return buildConsoleVersionMetaItems(effectiveVersion, toolManifest, clock);
  }, [effectiveVersion, livePublishedAt]);
  const desktopUpdate = useStealthDesktopUpdate();
  return { metaItems, desktopUpdate };
}
