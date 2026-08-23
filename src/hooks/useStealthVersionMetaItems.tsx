import { useMemo } from "react";
import { buildConsoleVersionMetaItems } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "../lib/app-meta";
import { stealthVersionClockInput } from "../lib/app-release";
import toolManifest from "../../tool.manifest.json";
import { useStealthDesktopUpdate } from "./useStealthDesktopUpdate";

/** Version clock + desktop updater folded into the single HubVersionReleaseNotes trigger. */
export function useStealthVersionMetaItems() {
  const metaItems = useMemo(
    () => buildConsoleVersionMetaItems(APP_VERSION, toolManifest, stealthVersionClockInput()),
    [],
  );
  const desktopUpdate = useStealthDesktopUpdate();
  return { metaItems, desktopUpdate };
}
