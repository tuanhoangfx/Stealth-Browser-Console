import { useCallback, useEffect } from "react";
import { fetchProfileEvents } from "../../api";
import type { ProfileEvent } from "../../types";

/** Refetch persisted events when profile session changes (launch/close/save). */
export function useProfileLogRealtime(
  profileId: string,
  onEvents: (events: ProfileEvent[]) => void,
  onSessionActivity?: () => void,
) {
  const refreshEvents = useCallback(() => {
    if (!profileId) return;
    void fetchProfileEvents(profileId)
      .then(onEvents)
      .catch(() => onEvents([]));
  }, [onEvents, profileId]);

  useEffect(() => {
    if (!profileId) return;
    refreshEvents();
  }, [profileId, refreshEvents]);

  useEffect(() => {
    const api = window.stealthApi;
    if (!api?.onProfileSession || !profileId) return undefined;
    const off = api.onProfileSession(({ profile, event }) => {
      if (profile.id !== profileId) return;
      refreshEvents();
      if (event === "running" || event === "closed" || event === "failed") {
        onSessionActivity?.();
      }
    });
    return off;
  }, [onSessionActivity, profileId, refreshEvents]);

  return refreshEvents;
}
