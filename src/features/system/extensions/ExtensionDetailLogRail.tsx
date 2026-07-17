import { HubToolDetailRail } from "@tool-workspace/hub-ui";
import { useRunLogs } from "../../runtime/RunLogsContext";
import { StealthConsoleContent } from "../../runtime/StealthRuntimeRailPanels";
import { StealthConsoleRailTitle } from "../../runtime/stealth-console-hint";
import { STEALTH_CONSOLE_RAIL_LABEL } from "../../runtime/stealth-runtime-rail-labels";
import { EXTENSION_DETAIL_SECTION_LOG } from "./extension-detail-toc";

/** Extension detail console rail — full app log (screen rail parity). */
export function ExtensionDetailLogRail({ focused = false }: { focused?: boolean }) {
  const { logs } = useRunLogs();

  return (
    <HubToolDetailRail
      id={EXTENSION_DETAIL_SECTION_LOG}
      title={<StealthConsoleRailTitle label={STEALTH_CONSOLE_RAIL_LABEL} showIcon />}
      className={`twofa-adm-rail--log hub-adm-rail--log stealth-profile-detail-log-rail${
        focused ? " stealth-profile-detail-log-rail--focused" : ""
      }`}
      ariaLabel={STEALTH_CONSOLE_RAIL_LABEL}
    >
      <StealthConsoleContent logs={logs} emptyHint="System output will appear here…" />
    </HubToolDetailRail>
  );
}
