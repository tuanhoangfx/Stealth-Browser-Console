import type { ReactNode } from "react";
import type { StealthSystemTab } from "../../lib/stealth-system-tab";
import { SystemBackupPage } from "./SystemBackupPage";
import { SystemOverviewPage } from "./SystemOverviewPage";

export function SystemDesignTemplateScreen({
  tab,
  headerActions,
}: {
  tab: StealthSystemTab;
  headerActions?: ReactNode;
}) {
  if (tab === "backup") return <SystemBackupPage headerActions={headerActions} />;
  return <SystemOverviewPage />;
}
