import { HubTocSectionNav, type HubTocNavItem } from "./HubTocSectionNav";
import { HubToolDetailRail } from "./HubToolDetailSplitLayout";
import { HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT } from "./hubAccountDetailModal";
import { HUB_ACCOUNT_DETAIL_NAVIGATE_EMOJI } from "./hubAccountDetailSectionIcons";

export function HubCrmDetailTocNav({
  items,
  className = "hub-crm-detail-toc-rail",
}: {
  items: readonly HubTocNavItem[];
  className?: string;
}) {
  return (
    <HubToolDetailRail
      title="Navigate"
      titleEmoji={HUB_ACCOUNT_DETAIL_NAVIGATE_EMOJI}
      className={className}
      scroll={false}
      ariaLabel="Sections"
    >
      <HubTocSectionNav
        items={[...items]}
        scrollRootSelector={HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT}
        admNav
      />
    </HubToolDetailRail>
  );
}

/** @deprecated Use HubCrmDetailTocNav */
export const CrmDetailTocNav = HubCrmDetailTocNav;
