import { useCallback, type MouseEvent } from "react";
import {
  HubTocSectionNav,
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT,
  scrollToHubTocSection,
  type HubTocNavItem,
} from "@tool-workspace/hub-ui";
import { EXTENSION_DETAIL_SECTION_LOG } from "./extension-detail-toc";

/** Extension detail TOC — HubTocSectionNav + Console rail focus (ProfileDetailTocNav parity). */
export function ExtensionDetailTocNav({
  items,
  onLogFocus,
}: {
  items: readonly HubTocNavItem[];
  onLogFocus?: () => void;
}) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const button =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLButtonElement>(".hub-toc-nav__item")
          : null;
      if (!button) return;
      const label = button.querySelector(".truncate")?.textContent?.trim().toLowerCase();
      if (label !== "console" && label !== "log") return;
      scrollToHubTocSection(EXTENSION_DETAIL_SECTION_LOG, HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT);
      onLogFocus?.();
      const railBody = document
        .getElementById(EXTENSION_DETAIL_SECTION_LOG)
        ?.querySelector<HTMLElement>(".hub-tool-detail-rail__body");
      railBody?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [onLogFocus],
  );

  return (
    <div className="hub-toc-nav" onClickCapture={handleClick}>
      <HubTocSectionNav
        items={items}
        scrollRootSelector={HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT}
        admNav
      />
    </div>
  );
}
