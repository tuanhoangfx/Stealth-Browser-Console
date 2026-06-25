import { useEffect, useMemo, type ReactNode } from "react";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import { ProfileDetailNoteLogRail } from "./ProfileDetailNoteLogRail";
import { runHistoryToActivityLog, type ProfileActivityLogEntry } from "./profile-run-log";

export function ProfileFormModalLayout({
  children,
  note,
  onNoteChange,
  profileId,
  activityLogEntries,
  logFilterStorageKey,
  logEmptyHint,
  notePlaceholder,
}: {
  children: ReactNode;
  note: string;
  onNoteChange: (value: string) => void;
  profileId?: string;
  activityLogEntries?: ProfileActivityLogEntry[];
  logFilterStorageKey?: string;
  logEmptyHint?: string;
  notePlaceholder?: string;
}) {
  const { history, refreshHistory } = useProfilesRuntime();

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const logEntries = useMemo(() => {
    if (activityLogEntries) return activityLogEntries;
    if (!profileId) return [];
    return history
      .filter((entry) => entry.profileId === profileId)
      .map(runHistoryToActivityLog);
  }, [activityLogEntries, history, profileId]);

  return (
    <div className="stealth-profile-detail__body">
      <div className="stealth-profile-detail__split">
        <div className="stealth-profile-detail__main">{children}</div>
        <ProfileDetailNoteLogRail
          note={note}
          onNoteChange={onNoteChange}
          logEntries={logEntries}
          logFilterStorageKey={logFilterStorageKey ?? profileId}
          logEmptyHint={logEmptyHint}
          notePlaceholder={notePlaceholder}
        />
      </div>
    </div>
  );
}
