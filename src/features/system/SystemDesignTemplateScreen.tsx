import type { ReactNode } from "react";
import { isStealthDesignTabVisible, type StealthSystemTab } from "../../lib/stealth-system-tab";
import { DesignTemplatePage } from "./design-template/DesignTemplatePage";
import { SystemBackupPage } from "./SystemBackupPage";
import { SystemExtensionsPage } from "./SystemExtensionsPage";

export function SystemDesignTemplateScreen({
  tab,
  headerActions,
}: {
  tab: StealthSystemTab;
  headerActions?: ReactNode;
}) {
  if (tab === "design" && isStealthDesignTabVisible()) return <DesignTemplatePage />;
  if (tab === "backup") return <SystemBackupPage headerActions={headerActions} />;
  return <SystemExtensionsPage headerActions={headerActions} />;
}
