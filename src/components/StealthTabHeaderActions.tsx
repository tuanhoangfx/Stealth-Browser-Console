import { useMemo } from "react";
import { HubHeaderOpsPanels } from "@tool-workspace/hub-ui";
import { useStealthShell } from "../context/stealth-shell-context";
import { useProfilesRuntime } from "../providers/ProfilesRuntimeProvider";
import { buildStealthNotifyPanelProps } from "../lib/stealth-notify";
import { StealthDisplayPrefs } from "./StealthDisplayPrefs";
import type { StealthScreen } from "../lib/stealth-screen";

export function StealthTabHeaderActions({ screen }: { screen: StealthScreen }) {
  const { engineStatus, syncBusy } = useStealthShell();
  const { catalogStats, history } = useProfilesRuntime();

  const notify = useMemo(
    () =>
      buildStealthNotifyPanelProps({
        engineStatus,
        syncBusy,
        profileFailed: catalogStats?.failed ?? 0,
        profileRunning: catalogStats?.running ?? 0,
        runHistoryFailed: history.filter((item) => item.status === "failed").length,
      }),
    [engineStatus, syncBusy, catalogStats, history],
  );

  return (
    <HubHeaderOpsPanels
      log={{ variant: "tab" }}
      notify={notify}
      trailing={<StealthDisplayPrefs screen={screen} scope="tab" />}
    />
  );
}
