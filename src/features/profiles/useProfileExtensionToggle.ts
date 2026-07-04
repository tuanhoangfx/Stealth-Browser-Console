import { useCallback, useEffect, useState } from "react";
import { fetchExtensionToggles, updateProfile } from "../../api";
import {
  DEFAULT_EXTENSION_TOGGLES,
  nextProfileExtensionOverrides,
} from "../../lib/profile-extension-effective";
import type { ExtensionToggles, ProfileRow } from "../../types";

export type ProfileExtensionKey = "e0001" | "surfshark";

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
        for (const profile of profiles) {
          const extensionOverrides = nextProfileExtensionOverrides(profile, globalToggles, key, enabled);
          await updateProfile({ id: profile.id, extensionOverrides });
        }
        onSaved?.();
        return profiles.length;
      } finally {
        setBusy(false);
      }
    },
    [globalToggles, onSaved],
  );

  return { globalToggles, setExtensionOnProfiles, extensionBusy: busy };
}
