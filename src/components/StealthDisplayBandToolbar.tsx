import { HubDirectoryDisplayPanel } from "@tool-workspace/hub-ui";
import type { StealthScreen } from "../lib/stealth-screen";
import {
  useStealthDisplayPanelConfig,
  type StealthDirectoryDisplayVariant,
} from "../lib/stealth-display-panel-config";

/** P0003 search-bar Display panel — workflow: table columns only; profiles: KPI + columns. */
export function StealthDisplayBandToolbar({
  screen,
  directoryVariant = "panel",
}: {
  screen: StealthScreen;
  directoryVariant?: StealthDirectoryDisplayVariant;
}) {
  const config = useStealthDisplayPanelConfig(screen, directoryVariant);
  if (!config) return null;
  return <HubDirectoryDisplayPanel {...config} />;
}
