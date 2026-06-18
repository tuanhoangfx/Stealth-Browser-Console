import { HubDirectoryDisplayPanel } from "@tool-workspace/hub-ui";
import type { StealthScreen } from "../lib/stealth-screen";
import { useStealthDisplayPanelConfig } from "../lib/stealth-display-panel-config";

/** P0003 search-bar Display panel — KPI · charts · header · filters · table columns. */
export function StealthDisplayBandToolbar({ screen }: { screen: StealthScreen }) {
  const config = useStealthDisplayPanelConfig(screen);
  if (!config) return null;
  return <HubDirectoryDisplayPanel {...config} />;
}
