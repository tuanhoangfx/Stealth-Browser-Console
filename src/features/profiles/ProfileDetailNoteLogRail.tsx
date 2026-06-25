import { useEffect, useMemo, useState } from "react";
import { ScrollText, StickyNote } from "lucide-react";
import { PROFILE_DETAIL_SECTION_LOG } from "./profile-form-toc";
import { readProfileLogFilter, writeProfileLogFilter } from "./profile-log-filter-storage";
import {
  filterProfileActivityLogs,
  profileActivityLogStatusLabel,
  profileActivityLogStatusTone,
  profileActivityLogTime,
  type ProfileActivityLogEntry,
  type ProfileRunLogFilter,
} from "./profile-run-log";

const LOG_FILTERS: { id: ProfileRunLogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "errors", label: "Errors" },
];

export function ProfileDetailNoteLogRail({
  note,
  onNoteChange,
  logEntries,
  logFilterStorageKey,
  logEmptyHint = "No workflow runs recorded yet.",
  notePlaceholder = "Profile notes, credentials hints, proxy labels…",
}: {
  note: string;
  onNoteChange: (value: string) => void;
  logEntries: ProfileActivityLogEntry[];
  logFilterStorageKey?: string;
  logEmptyHint?: string;
  notePlaceholder?: string;
}) {
  const [logFilter, setLogFilter] = useState<ProfileRunLogFilter>(() =>
    logFilterStorageKey ? readProfileLogFilter(logFilterStorageKey) : "all",
  );

  useEffect(() => {
    if (!logFilterStorageKey) return;
    writeProfileLogFilter(logFilterStorageKey, logFilter);
  }, [logFilter, logFilterStorageKey]);
  const visibleEntries = useMemo(
    () => filterProfileActivityLogs(logEntries, logFilter),
    [logEntries, logFilter],
  );
  const filterEmptyHint =
    logFilter === "errors"
      ? "No failed runs in this filter."
      : logFilter === "today"
        ? "No runs recorded today."
        : logEmptyHint;

  return (
    <div className="stealth-profile-detail__rail">
      <section className="stealth-profile-adm-rail stealth-profile-adm-rail--note" aria-label="Note">
        <div className="stealth-profile-adm-rail__head">
          <StickyNote size={12} aria-hidden />
          Note
        </div>
        <div className="stealth-profile-adm-rail__body stealth-profile-adm-rail__body--note">
          <textarea
            className="field stealth-profile-adm-note-textarea"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={notePlaceholder}
            spellCheck={false}
          />
        </div>
      </section>

      <aside
        id={PROFILE_DETAIL_SECTION_LOG}
        className="stealth-profile-adm-rail stealth-profile-adm-rail--log"
        aria-label="Activity log"
      >
        <div className="stealth-profile-adm-rail__head stealth-profile-adm-rail__head--split">
          <span className="stealth-profile-adm-rail__head-title">
            <ScrollText size={12} aria-hidden />
            Activity log
          </span>
          <div className="stealth-profile-adm-log-filters" role="tablist" aria-label="Log filter">
            {LOG_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={logFilter === item.id}
                className={`stealth-profile-adm-log-filter${logFilter === item.id ? " is-active" : ""}`}
                onClick={() => setLogFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="stealth-profile-adm-rail__body">
          {visibleEntries.length ? (
            <ol className="stealth-profile-adm-log-list">
              {visibleEntries.map((entry, index) => {
                const tone = profileActivityLogStatusTone(entry.status);
                return (
                  <li key={entry.id || `${entry.startedAt}-${index}`} className="stealth-profile-adm-log-item">
                    <span
                      className={`stealth-profile-adm-log-dot stealth-profile-adm-log-dot--${tone}`}
                      aria-hidden
                    />
                    <div>
                      <div className="stealth-profile-adm-log-item__meta">
                        <time
                          className="stealth-profile-adm-log-item__time"
                          dateTime={entry.finishedAt || entry.startedAt}
                        >
                          {profileActivityLogTime(entry)}
                        </time>
                        <span
                          className={`stealth-profile-adm-log-badge stealth-profile-adm-log-badge--${tone}`}
                        >
                          {profileActivityLogStatusLabel(entry.status)}
                        </span>
                      </div>
                      <p className="stealth-profile-adm-log-item__msg">{entry.message}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="stealth-profile-adm-muted">{filterEmptyHint}</p>
          )}
        </div>
      </aside>
    </div>
  );
}
