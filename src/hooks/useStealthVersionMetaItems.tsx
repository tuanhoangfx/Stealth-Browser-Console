import { useMemo } from "react";
import { buildConsoleVersionMetaItems } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "../lib/app-meta";
import toolManifest from "../../tool.manifest.json";
import { StealthHeaderUpdateButton } from "../components/StealthHeaderUpdateButton";

/** Version meta + update status icon beside the version label (not Notify/Log row). */
export function useStealthVersionMetaItems() {
  return useMemo(
    () =>
      buildConsoleVersionMetaItems(APP_VERSION, toolManifest, {
        versionAfter: <StealthHeaderUpdateButton />,
      }),
    [],
  );
}
