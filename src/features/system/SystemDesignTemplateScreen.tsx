import type { ReactNode } from "react";
import type { StealthSystemTab } from "../../lib/stealth-system-tab";
import { DesignTemplatePage } from "./design-template/DesignTemplatePage";
import { SystemBackupPage } from "./SystemBackupPage";
import { SystemExtensionsPage } from "./SystemExtensionsPage";
import { SystemOverviewPage } from "./SystemOverviewPage";

export function SystemDesignTemplateScreen({
  tab,
  headerActions,
}: {
  tab: StealthSystemTab;
  headerActions?: ReactNode;
}) {
  if (tab === "design") return <DesignTemplatePage />;
  if (tab === "backup") return <SystemBackupPage headerActions={headerActions} />;
  if (tab === "extensions") return <SystemExtensionsPage headerActions={headerActions} />;
  return <SystemOverviewPage />;
}
