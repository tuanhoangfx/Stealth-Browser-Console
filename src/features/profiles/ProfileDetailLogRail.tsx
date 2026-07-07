import { useCallback, useEffect, useMemo, useState } from "react";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import type { ProfileEvent } from "../../types";
import { useRunLogs } from "../runtime/RunLogsContext";
import { ProfileActivityLogRail } from "./ProfileActivityLogRail";
import { buildProfileConsoleLines } from "./profile-run-log";
import { useProfileLogRealtime } from "./useProfileLogRealtime";

/** Profile detail right rail — P0006 JobDetailLogRail parity + realtime session refresh. */
export function ProfileDetailLogRail({
  profileId,
  profileName,
  focused = false,
}: {
  profileId: string;
  profileName: string;
  focused?: boolean;
}) {
  const { history, refreshHistory } = useProfilesRuntime();
  const { logs } = useRunLogs();
  const [profileEvents, setProfileEvents] = useState<ProfileEvent[]>([]);
  const [sessionTick, setSessionTick] = useState(0);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const handleEvents = useCallback((events: ProfileEvent[]) => {
    setProfileEvents(events);
  }, []);

  const handleSessionActivity = useCallback(() => {
    setSessionTick((tick) => tick + 1);
    void refreshHistory();
  }, [refreshHistory]);

  useProfileLogRealtime(profileId, handleEvents, handleSessionActivity);

  const allLines = useMemo(
    () => buildProfileConsoleLines(profileId, profileName, history, logs, profileEvents),
    [history, logs, profileEvents, profileId, profileName, sessionTick],
  );

  return (
    <ProfileActivityLogRail
      lines={allLines}
      filterStorageKey={profileId}
      emptyHint="Profile activity will appear here — launches, workflow runs, and automation output."
      focused={focused}
    />
  );
}
