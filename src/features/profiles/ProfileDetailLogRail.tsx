import { useMemo } from "react";
import { HubToolDetailRail } from "@tool-workspace/hub-ui";
import { useRunLogs } from "../runtime/RunLogsContext";
import { StealthConsoleContent } from "../runtime/StealthRuntimeRailPanels";
import { StealthConsoleRailTitle } from "../runtime/stealth-console-hint";
import { STEALTH_CONSOLE_RAIL_LABEL } from "../runtime/stealth-runtime-rail-labels";
import { PROFILE_DETAIL_SECTION_LOG } from "./profile-detail-toc";
import { filterConsoleLogsForProfile, filterConsoleLogsForProfiles } from "./profile-runtime-rail-filter";

/** Profile detail console rail — same SSOT as workflow Console, filtered by profile name(s). */
export function ProfileDetailLogRail({
  profileName,
  profileNames,
  focused = false,
}: {
  profileName?: string;
  profileNames?: readonly string[];
  focused?: boolean;
}) {
  const { logs } = useRunLogs();
  const profileLogs = useMemo(() => {
    if (profileNames?.length) return filterConsoleLogsForProfiles(logs, profileNames);
    if (profileName) return filterConsoleLogsForProfile(logs, profileName);
    return [];
  }, [logs, profileName, profileNames]);

  return (
    <HubToolDetailRail
      id={PROFILE_DETAIL_SECTION_LOG}
      title={<StealthConsoleRailTitle label={STEALTH_CONSOLE_RAIL_LABEL} showIcon />}
      className={`twofa-adm-rail--log hub-adm-rail--log stealth-profile-detail-log-rail${
        focused ? " stealth-profile-detail-log-rail--focused" : ""
      }`}
      ariaLabel={STEALTH_CONSOLE_RAIL_LABEL}
    >
      <StealthConsoleContent
        logs={profileLogs}
        emptyHint="System output will appear here…"
      />
    </HubToolDetailRail>
  );
}
