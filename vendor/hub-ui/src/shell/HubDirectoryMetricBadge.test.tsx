import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClipboardList } from "lucide-react";
import { HubDirectoryMetricBadge } from "./HubDirectoryMetricBadge";
import {
  hubDirectoryMetricTierClass,
  resolveHubDirectoryMetricTier,
} from "../lib/directory-metric-tier";

describe("HubDirectoryMetricBadge", () => {
  it("maps count tiers to shared palette classes", () => {
    expect(resolveHubDirectoryMetricTier(0)).toBe("empty");
    expect(resolveHubDirectoryMetricTier(2)).toBe("low");
    expect(resolveHubDirectoryMetricTier(9)).toBe("normal");
    expect(resolveHubDirectoryMetricTier(1416)).toBe("high");
    expect(hubDirectoryMetricTierClass("high")).toBe("hub-directory-metric-badge--high");
  });

  it.each([
    [999, "hub-directory-metric-badge--high", "hub-users-tool-badge--admin"],
    [1416, "hub-directory-metric-badge--high", "hub-users-tool-badge--admin"],
    [120000, "hub-directory-metric-badge--high", "hub-users-tool-badge--admin"],
  ])("renders large count %i with tier chrome and overflow-safe count node", (count, tierClass, adminClass) => {
    const { container } = render(<HubDirectoryMetricBadge count={count} icon={ClipboardList} />);
    const badge = container.querySelector(".hub-users-tool-badge");
    const countNode = container.querySelector(".hub-users-tool-badge__count");

    expect(badge).not.toBeNull();
    expect(badge?.className).toContain(tierClass);
    expect(badge?.className).toContain(adminClass);
    expect(countNode?.textContent).toBe(String(count));
    expect(countNode?.className).toContain("tabular-nums");
    expect(container).toMatchSnapshot();
  });

  it("keeps empty tier muted without admin chrome", () => {
    const { container } = render(<HubDirectoryMetricBadge count={0} />);
    const badge = container.querySelector(".hub-users-tool-badge");

    expect(badge?.className).toContain("hub-directory-metric-badge--empty");
    expect(badge?.className).toContain("hub-users-tool-badge--empty");
    expect(badge?.className).not.toContain("hub-users-tool-badge--admin");
    expect(container.querySelector(".hub-users-tool-badge__count")?.textContent).toBe("0");
  });
});
