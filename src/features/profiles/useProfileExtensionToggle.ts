import { useCallback, useEffect, useState } from "react";
import { bulkUpdateProfiles, fetchExtensionToggles } from "../../api";
import { DEFAULT_EXTENSION_TOGGLES } from "../../lib/profile-extension-effective";
import type { ExtensionToggles, ProfileRow } from "../../types";

export type ProfileExtensionKey = "e0001" | "e0002" | "surfshark";

export function useProfileExtensionToggle(onSaved?: () => void) {
  const [globalToggles, setGlobalToggles] = useState<ExtensionToggles>(DEFAULT_EXTENSION_TOGGLES);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchExtensionToggles()
      .then(setGlobalToggles)
      .catch(() => setGlobalToggles(DEFAULT_EXTENSION_TOGGLES));
  }, []);

  const setExtensionOnProfiles = useCallback(
    async (profiles: ProfileRow[], key: ProfileExtensionKey, enabled: boolean) => {
      if (!profiles.length) return 0;
      setBusy(true);
      try {
        const res = await bulkUpdateProfiles(
          profiles.map((p) => p.id),
          {
            extensionOverrideDelta: {
              key,
              enabled,
              globalDefault: Boolean(globalToggles[key]),
            },
          },
        );
        onSaved?.();
        return res.count || profiles.length;
      } finally {
        setBusy(false);
      }
    },
    [globalToggles, onSaved],
  );

  return { globalToggles, setExtensionOnProfiles, extensionBusy: busy };
}
