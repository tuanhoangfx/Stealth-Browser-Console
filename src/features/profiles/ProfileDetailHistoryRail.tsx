import { useEffect, useMemo, useState } from "react";
import { HubToolDetailRail } from "@tool-workspace/hub-ui";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import { StealthRunHistoryContent } from "../runtime/StealthRuntimeRailPanels";
import { StealthRunHistoryRailTitle } from "../runtime/stealth-run-history-hint";
import { STEALTH_RUN_HISTORY_RAIL_LABEL } from "../runtime/stealth-runtime-rail-labels";
import { PROFILE_DETAIL_SECTION_HISTORY } from "./profile-detail-toc";
import { filterRunHistoryForProfile, filterRunHistoryForProfiles } from "./profile-runtime-rail-filter";

/** Profile detail top rail — Run History SSOT, filtered to one or many profiles. */
export function ProfileDetailHistoryRail({
  profileId,
  profileIds,
}: {
  profileId?: string;
  profileIds?: readonly string[];
}) {
  const { history, refreshHistory, replayRun } = useProfilesRuntime();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const entries = useMemo(() => {
    if (profileIds?.length) return filterRunHistoryForProfiles(history, profileIds);
    if (profileId) return filterRunHistoryForProfile(history, profileId);
    return [];
  }, [history, profileId, profileIds]);

  return (
    <HubToolDetailRail
      id={PROFILE_DETAIL_SECTION_HISTORY}
      title={<StealthRunHistoryRailTitle label={STEALTH_RUN_HISTORY_RAIL_LABEL} showIcon />}
      className="twofa-adm-rail--history stealth-profile-detail-history-rail hub-adm-rail--history"
      ariaLabel={STEALTH_RUN_HISTORY_RAIL_LABEL}
    >
      <StealthRunHistoryContent
        entries={entries}
        activeRunId={activeRunId}
        onSelectRun={(run) => {
          setActiveRunId(run.id);
          void replayRun(run);
        }}
      />
    </HubToolDetailRail>
  );
}
