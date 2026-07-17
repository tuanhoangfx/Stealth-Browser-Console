import { HubDirectoryDisplayPanel } from "@tool-workspace/hub-ui";
import type { StealthScreen } from "../lib/stealth-screen";
import type { StealthSystemTab } from "../lib/stealth-system-tab";
import {
  useStealthDisplayPanelConfig,
  type StealthDirectoryDisplayVariant,
} from "../lib/stealth-display-panel-config";

/** P0003 search-bar Display panel — workflow: table columns; profiles/system: KPI + columns. */
export function StealthDisplayBandToolbar({
  screen,
  directoryVariant = "panel",
  systemTab,
}: {
  screen: StealthScreen;
  directoryVariant?: StealthDirectoryDisplayVariant;
  systemTab?: StealthSystemTab;
}) {
  const config = useStealthDisplayPanelConfig(screen, directoryVariant, systemTab);
  if (!config) return null;
  return <HubDirectoryDisplayPanel {...config} />;
}
