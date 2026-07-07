import { type ReactNode } from "react";
import { ProfileDetailNoteRail } from "./ProfileDetailNoteRail";
import { ProfileDetailNoteLogRail } from "./ProfileDetailNoteLogRail";
import type { ProfileActivityLogEntry } from "./profile-run-log";

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
  const rail =
    activityLogEntries !== undefined ? (
      <ProfileDetailNoteLogRail
        note={note}
        onNoteChange={onNoteChange}
        logEntries={activityLogEntries}
        logFilterStorageKey={logFilterStorageKey ?? profileId}
        logEmptyHint={logEmptyHint}
        notePlaceholder={notePlaceholder}
      />
    ) : (
      <ProfileDetailNoteRail note={note} onNoteChange={onNoteChange} notePlaceholder={notePlaceholder} />
    );

  return (
    <div className="stealth-profile-detail__body hub-tool-detail-split__body">
      <div className="stealth-profile-detail__split hub-tool-detail-split">
        <div className="stealth-profile-detail__main">{children}</div>
        <div className="hub-tool-detail-split__rail">{rail}</div>
      </div>
    </div>
  );
}
