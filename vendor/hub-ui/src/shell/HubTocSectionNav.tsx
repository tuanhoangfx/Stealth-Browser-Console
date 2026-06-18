import type { ReactNode } from "react";
import { scrollToHubTocSection } from "./hub-toc-scroll";
import { useHubTocNavActive, useHubTocNavHighlight } from "./HubTocSectionHighlight";
import { HUB_TOOL_DETAIL_SCROLL_ROOT } from "./HubToolDetailModal";

export type HubTocNavItem = {
  /** DOM id on `HubToolDetailSection` (or prefixed id when `sectionIdPrefix` is set). */
  id: string;
  label: string;
  icon?: ReactNode;
  emoji?: string;
};

type Props = {
  items: readonly HubTocNavItem[];
  /** Prepended to each item id for scroll target (Cookie download FAB uses `ext-dl-`). */
  sectionIdPrefix?: string;
  scrollRootSelector?: string;
  className?: string;
};

function HubTocSectionNavItem({
  item,
  sectionId,
  scrollRootSelector,
}: {
  item: HubTocNavItem;
  sectionId: string;
  scrollRootSelector?: string;
}) {
  const isHighlighted = useHubTocNavHighlight(sectionId);
  const isActive = useHubTocNavActive(sectionId);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        scrollToHubTocSection(sectionId, scrollRootSelector);
      }}
      className={`hub-toc-nav__item group relative z-[1] min-h-[var(--overview-toc-row-h,2rem)] w-full cursor-pointer text-left text-[13px] transition-colors${
        isHighlighted ? " is-highlighted" : isActive ? " is-active" : ""
      }`}
    >
      <span className="hub-toc-nav__label flex min-w-0 items-center gap-1.5 truncate rounded-lg px-2 py-1 font-medium text-[var(--muted)] transition-all duration-200 group-hover:text-[var(--text)]">
        {item.emoji ? (
          <span className="shrink-0 text-[12px] leading-none opacity-90" aria-hidden>
            {item.emoji}
          </span>
        ) : item.icon ? (
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[.03] text-[var(--muted)] group-hover:text-indigo-200 [&>svg]:size-[11px]"
            aria-hidden
          >
            {item.icon}
          </span>
        ) : null}
        <span className="truncate">{item.label}</span>
      </span>
    </button>
  );
}

/** Left TOC rail — scroll-to-section + pointer highlight (Cookie download FAB golden). */
export function HubTocSectionNav({
  items,
  sectionIdPrefix = "",
  scrollRootSelector = HUB_TOOL_DETAIL_SCROLL_ROOT,
  className = "",
}: Props) {
  if (!items.length) return null;

  return (
    <nav className={`hub-toc-nav__list space-y-0.5${className ? ` ${className}` : ""}`} aria-label="On this page">
      {items.map((item) => {
        const sectionId = `${sectionIdPrefix}${item.id}`;
        return (
          <HubTocSectionNavItem
            key={sectionId}
            item={item}
            sectionId={sectionId}
            scrollRootSelector={scrollRootSelector}
          />
        );
      })}
    </nav>
  );
}
