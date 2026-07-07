import type { ReactNode } from "react";
import { HubAccountDetailModalFrame } from "./HubAccountDetailModalFrame";
import { HubToolDetailPanel } from "./HubToolDetailSplitLayout";
import {
  HUB_ACCOUNT_DETAIL_CONTENT_ROOT_CLASS,
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_CLASS,
} from "./hubAccountDetailModal";
import { HUB_ACCOUNT_DETAIL_ADM_FRAME_CLASS } from "./HubAccountDetailAdmBody";
import {
  hubAccountDetailSectionIcon,
  hubAccountDetailSectionIconClass,
  type HubAccountDetailSectionKind,
} from "./hubAccountDetailSectionIcons";

export type HubAccountDetailAdmScaffoldProps = {
  panelId: string;
  panelTitle?: string;
  /** Panel header icon tone — defaults to credentials (P0020 Mail golden). */
  panelSectionKey?: HubAccountDetailSectionKind;
  main: ReactNode;
  rail?: ReactNode;
  frameClassName?: string;
  panelClassName?: string;
  panelBodyClassName?: string;
};

/**
 * Golden account-detail main column — `HubToolDetailPanel` inside `HubAccountDetailModalFrame`.
 * Layout tokens only from `hub-account-detail-modal.css` (no tool sizing overrides).
 */
export function HubAccountDetailAdmScaffold({
  panelId,
  panelTitle = "Credentials",
  panelSectionKey = "credentials",
  main,
  rail,
  frameClassName = "",
  panelClassName = "",
  panelBodyClassName = "",
}: HubAccountDetailAdmScaffoldProps) {
  const PanelIcon = hubAccountDetailSectionIcon(panelSectionKey);
  const frameClass = [
    HUB_ACCOUNT_DETAIL_CONTENT_ROOT_CLASS,
    HUB_ACCOUNT_DETAIL_ADM_FRAME_CLASS,
    frameClassName,
  ]
    .filter(Boolean)
    .join(" ");
  const bodyClass = [
    HUB_ACCOUNT_DETAIL_MAIN_SCROLL_CLASS,
    "hub-split-scroll",
    "hub-split-scroll--panel",
    panelBodyClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <HubAccountDetailModalFrame
      className={frameClass}
      main={
        <HubToolDetailPanel
          id={panelId}
          title={panelTitle}
          icon={PanelIcon ?? undefined}
          iconClassName={hubAccountDetailSectionIconClass(panelSectionKey)}
          className={`hub-tool-detail-panel--grow${panelClassName ? ` ${panelClassName}` : ""}`}
          bodyClassName={bodyClass}
          ariaLabel={panelTitle}
        >
          {main}
        </HubToolDetailPanel>
      }
      rail={rail}
    />
  );
}
