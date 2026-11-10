import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { HubVisitedTabPanel } from "@tool-workspace/hub-ui";
import { isStealthDesignTabVisible, type StealthSystemTab } from "../../lib/stealth-system-tab";
import { DesignTemplatePage } from "./design-template/DesignTemplatePage";
import { SystemBackupPage } from "./SystemBackupPage";
import { SystemExtensionsPage } from "./SystemExtensionsPage";

const SYSTEM_PANEL_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";

export function SystemDesignTemplateScreen({
  tab,
  headerActions,
}: {
  tab: StealthSystemTab;
  headerActions?: ReactNode;
}) {
  const showDesign = isStealthDesignTabVisible();
  const effectiveTab: StealthSystemTab = tab === "design" && !showDesign ? "extensions" : tab;
  const [visitedTabs, setVisitedTabs] = useState<Set<StealthSystemTab>>(() => new Set([effectiveTab]));

  useLayoutEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(effectiveTab)) return prev;
      return new Set(prev).add(effectiveTab);
    });
  }, [effectiveTab]);

  const effectiveVisited = useMemo(() => new Set(visitedTabs).add(effectiveTab), [visitedTabs, effectiveTab]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {showDesign ? (
        <HubVisitedTabPanel
          tabId="design"
          active={effectiveTab === "design"}
          visited={effectiveVisited}
          className={SYSTEM_PANEL_CLASS}
          dataScreen="system:design"
        >
          <DesignTemplatePage />
        </HubVisitedTabPanel>
      ) : null}
      <HubVisitedTabPanel
        tabId="backup"
        active={effectiveTab === "backup"}
        visited={effectiveVisited}
        className={SYSTEM_PANEL_CLASS}
        dataScreen="system:backup"
      >
        <SystemBackupPage headerActions={headerActions} />
      </HubVisitedTabPanel>
      <HubVisitedTabPanel
        tabId="extensions"
        active={effectiveTab === "extensions"}
        visited={effectiveVisited}
        className={SYSTEM_PANEL_CLASS}
        dataScreen="system:extensions"
      >
        <SystemExtensionsPage headerActions={headerActions} />
      </HubVisitedTabPanel>
    </div>
  );
}
