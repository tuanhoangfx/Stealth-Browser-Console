import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HubBulkActivityList, HUB_BULK_ACTIVITY_PAGE_SIZE } from "./HubBulkActivityList";

const groups = Array.from({ length: HUB_BULK_ACTIVITY_PAGE_SIZE + 3 }, (_, index) => ({
  operationId: `op-${index}`,
  at: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
  summary: `Bulk op ${index}`,
  accounts: [{ accountId: `a-${index}`, accountLabel: `Account ${index}` }],
}));

describe("HubBulkActivityList", () => {
  it("lazy-loads older operations", () => {
    render(
      <HubBulkActivityList
        groups={groups}
        totalOperationCount={groups.length}
        renderAccountBody={(account) => <span>{account.accountLabel}</span>}
      />,
    );
    expect(document.querySelectorAll(".hub-bulk-activity-op")).toHaveLength(HUB_BULK_ACTIVITY_PAGE_SIZE);
    fireEvent.click(screen.getByRole("button", { name: /Show 3 earlier operations/ }));
    expect(document.querySelectorAll(".hub-bulk-activity-op")).toHaveLength(groups.length);
  });

  it("scrolls highlighted operation into view", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const onHighlightConsumed = vi.fn();
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    render(
      <HubBulkActivityList
        groups={groups.slice(0, 2)}
        highlightOperationId="op-1"
        onHighlightConsumed={onHighlightConsumed}
        renderAccountBody={() => <span>body</span>}
      />,
    );
    expect(onHighlightConsumed).toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalled();
    raf.mockRestore();
  });

  it("applies hub-flash-border SSOT on highlight", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    render(
      <HubBulkActivityList
        groups={groups.slice(0, 2)}
        highlightOperationId="op-1"
        renderAccountBody={() => <span>body</span>}
      />,
    );
    expect(
      document.querySelector(".hub-bulk-activity-op.hub-flash-border-surface.is-flash-border"),
    ).toBeTruthy();
    raf.mockRestore();
  });
});
