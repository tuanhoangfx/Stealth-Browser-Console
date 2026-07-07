import { useEffect, useMemo, useState } from "react";
import {
  HubRuntimeConsoleTerm,
  HubToolDetailRail,
  hubAccountDetailSectionIcon,
  hubAccountDetailSectionIconClass,
} from "@tool-workspace/hub-ui";
import { PROFILE_DETAIL_SECTION_LOG } from "./profile-detail-toc";
import { readProfileLogFilter, writeProfileLogFilter } from "./profile-log-filter-storage";
import {
  filterProfileConsoleLines,
  type ProfileConsoleLine,
  type ProfileRunLogFilter,
} from "./profile-run-log";
import {
  StealthProfileConsoleGridHead,
  StealthProfileConsoleTerminalRow,
  StealthProfileRuntimeChannelLegend,
} from "./stealth-runtime-rail-shared";
import { inferStealthConsoleChannel } from "../runtime/StealthConsoleChannelBadge";

const LOG_FILTERS: { id: ProfileRunLogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "errors", label: "Errors" },
];

const CONSOLE_RENDER_LIMIT = 120;

/** Shared log rail shell — edit (DB) + create/bulk (in-memory lines). */
export function ProfileActivityLogRail({
  lines,
  filterStorageKey,
  emptyHint,
  focused = false,
}: {
  lines: ProfileConsoleLine[];
  filterStorageKey: string;
  emptyHint: string;
  focused?: boolean;
}) {
  const [logFilter, setLogFilter] = useState<ProfileRunLogFilter>(() => readProfileLogFilter(filterStorageKey));

  useEffect(() => {
    writeProfileLogFilter(filterStorageKey, logFilter);
  }, [filterStorageKey, logFilter]);

  const visibleLines = useMemo(
    () => filterProfileConsoleLines(lines, logFilter).slice(0, CONSOLE_RENDER_LIMIT),
    [lines, logFilter],
  );

  const filterEmptyHint =
    logFilter === "errors"
      ? "No errors in this filter."
      : logFilter === "today"
        ? "No activity recorded today."
        : emptyHint;

  return (
    <HubToolDetailRail
      id={PROFILE_DETAIL_SECTION_LOG}
      title="Activity log"
      icon={hubAccountDetailSectionIcon("log")}
      iconClassName={hubAccountDetailSectionIconClass("log")}
      className={`twofa-adm-rail--log hub-adm-rail--log stealth-profile-detail-log-rail${
        focused ? " stealth-profile-detail-log-rail--focused" : ""
      }`}
      ariaLabel="Activity log"
    >
      <div className="stealth-profile-detail-log-rail__filters" role="tablist" aria-label="Log filter">
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
      <HubRuntimeConsoleTerm legend={<StealthProfileRuntimeChannelLegend />}>
        {visibleLines.length === 0 ? (
          <div className="text-hub-muted">{filterEmptyHint}</div>
        ) : (
          <div className="stealth-console-terminal">
            <StealthProfileConsoleGridHead />
            {visibleLines.map((line) => (
              <StealthProfileConsoleTerminalRow
                key={line.id}
                time={line.time}
                channel={inferStealthConsoleChannel(line.source)}
                level={line.level}
                message={line.message}
              />
            ))}
          </div>
        )}
        {lines.length > CONSOLE_RENDER_LIMIT ? (
          <div className="text-hub-muted">
            Showing latest {CONSOLE_RENDER_LIMIT} of {lines.length} lines
          </div>
        ) : null}
      </HubRuntimeConsoleTerm>
    </HubToolDetailRail>
  );
}
