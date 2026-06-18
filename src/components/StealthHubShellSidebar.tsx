import { useCallback, useState } from "react";
import { RefreshCcw } from "lucide-react";
import {
  HubLogButton,
  HubSidebarFooterButton,
  HubSidebarNavList,
  HubSidebarShell,
  HubToolAvatar,
  HubUiZoomControl,
  useNavGroupOpenState
} from "@tool-workspace/hub-ui";
import { StealthDisplayPrefs } from "./StealthDisplayPrefs";
import { useStealthShell } from "../context/stealth-shell-context";
import { STEALTH_NAV_STRUCTURE, STEALTH_NAV_SUBNAV_PREFIX } from "../lib/stealth-nav-structure";
import { STEALTH_BRAND_ICON, STEALTH_PRODUCT } from "../lib/stealth-product";
import type { StealthScreen } from "../lib/stealth-screen";

const EMPTY_GROUP_IDS: readonly string[] = [];

export function StealthHubShellSidebar({
  screen,
  onNavigate,
  onRefresh,
  refreshBusy = false
}: {
  screen: StealthScreen;
  onNavigate: (screen: StealthScreen) => void;
  onRefresh: () => void;
  refreshBusy?: boolean;
}) {
  const { groupOpen, setGroupSubnavOpen } = useNavGroupOpenState(STEALTH_NAV_SUBNAV_PREFIX, EMPTY_GROUP_IDS);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    onRefresh();
    window.setTimeout(() => setRefreshing(false), 600);
  }, [onRefresh]);

  return (
    <HubSidebarShell
      brandLeading={
        <HubToolAvatar code={STEALTH_PRODUCT.code} size="md" svgSrc={STEALTH_BRAND_ICON} />
      }
      brandTitle={STEALTH_PRODUCT.name}
      nav={
        <HubSidebarNavList
          structure={STEALTH_NAV_STRUCTURE}
          activeScreen={screen}
          groupOpen={groupOpen}
          setGroupSubnavOpen={setGroupSubnavOpen}
          showToggleIcon={false}
          onNavigateScreen={onNavigate}
          onPrefetchScreen={(screen) => {
            if (screen === "workflow") {
              void import("../features/workflows/ScriptsEditorPane");
            }
          }}
          onSelectView={() => {}}
        />
      }
      footer={
        <>
          <HubSidebarFooterButton
            icon={RefreshCcw}
            iconClass={`text-emerald-300 ${refreshing || refreshBusy ? "animate-spin" : ""}`}
            label={refreshing || refreshBusy ? "Updating…" : "Refresh"}
            onClick={handleRefresh}
            disabled={refreshBusy}
            title="Refresh active tab data"
          />
          <HubLogButton variant="global" emptyMessage="No actions logged in this session yet." />
          <StealthDisplayPrefs screen={screen} sidebarRow scope="global" settingsMode="general" />
          <HubUiZoomControl />
        </>
      }
    />
  );
}
