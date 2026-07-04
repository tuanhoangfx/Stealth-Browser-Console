import { memo, type ReactNode } from "react";
import { SystemDesignTemplateScreen } from "../features/system/SystemDesignTemplateScreen";
import type { StealthSystemTab } from "../lib/stealth-system-tab";

export const SystemView = memo(function SystemView({
  tab,
  headerActions,
}: {
  tab: StealthSystemTab;
  headerActions?: ReactNode;
}) {
  return <SystemDesignTemplateScreen tab={tab} headerActions={headerActions} />;
});
