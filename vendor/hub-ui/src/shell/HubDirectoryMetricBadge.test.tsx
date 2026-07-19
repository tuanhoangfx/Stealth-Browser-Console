import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClipboardList } from "lucide-react";
import { HubDirectoryMetricBadge } from "./HubDirectoryMetricBadge";
import {
  HUB_DIRECTORY_METRIC_HEAT_LEGEND_LINES,
  hubDirectoryMetricTierClass,
  resolveHubDirectoryMetricTier,
} from "../lib/directory-metric-tier";

describe("HubDirectoryMetricBadge", () => {
  it("maps count tiers to shared palette classes", () => {
    expect(resolveHubDirectoryMetricTier(0)).toBe("empty");
    expect(resolveHubDirectoryMetricTier(1)).toBe("one");
    expect(resolveHubDirectoryMetricTier(2)).toBe("few");
    expect(resolveHubDirectoryMetricTier(9)).toBe("mid");
    expect(resolveHubDirectoryMetricTier(15)).toBe("high");
    expect(resolveHubDirectoryMetricTier(1416)).toBe("hot");
    expect(hubDirectoryMetricTierClass("one")).toBe("hub-directory-metric-badge--one");
    expect(hubDirectoryMetricTierClass("high")).toBe("hub-directory-metric-badge--high");
  });

  it("exposes heat legend lines for column header tooltips", () => {
    expect(HUB_DIRECTORY_METRIC_HEAT_LEGEND_LINES).toHaveLength(6);
    expect(HUB_DIRECTORY_METRIC_HEAT_LEGEND_LINES[1]?.label).toBe("1");
    expect(HUB_DIRECTORY_METRIC_HEAT_LEGEND_LINES[1]?.detail).toBe("Green");
    expect(HUB_DIRECTORY_METRIC_HEAT_LEGEND_LINES[3]?.detail).toBe("Yellow");
    expect(HUB_DIRECTORY_METRIC_HEAT_LEGEND_LINES[4]?.detail).toBe("Orange");
    expect(HUB_DIRECTORY_METRIC_HEAT_LEGEND_LINES[1]?.dotClassName).toContain(
      "hub-directory-metric-heat-dot--one",
    );
  });

  it.each([
    [1, "hub-directory-metric-badge--one"],
    [4, "hub-directory-metric-badge--few"],
    [999, "hub-directory-metric-badge--hot"],
    [1416, "hub-directory-metric-badge--hot"],
  ])("renders count %i with tier chrome and overflow-safe count node", (count, tierClass) => {
    const { container } = render(<HubDirectoryMetricBadge count={count} icon={ClipboardList} />);
    const badge = container.querySelector(".hub-users-tool-badge");
    const countNode = container.querySelector(".hub-users-tool-badge__count");

    expect(badge).not.toBeNull();
    expect(badge?.className).toContain(tierClass);
    expect(countNode?.textContent).toBe(String(count));
    expect(countNode?.className).toContain("tabular-nums");
  });

  it("keeps empty tier muted without heat chrome", () => {
    const { container } = render(<HubDirectoryMetricBadge count={0} />);
    const badge = container.querySelector(".hub-users-tool-badge");

    expect(badge?.className).toContain("hub-directory-metric-badge--empty");
    expect(badge?.className).toContain("hub-users-tool-badge--empty");
    expect(container.querySelector(".hub-users-tool-badge__count")?.textContent).toBe("0");
  });
});
