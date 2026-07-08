import { describe, expect, it } from "vitest";
import {
  resolveDirectorySearchResultCountGuard,
  shouldShowHubDirectoryResultCount,
} from "./hubDirectorySelectionSlots";

describe("resolveDirectorySearchResultCountGuard", () => {
  it("auto-hides HubResultCount in table mode when selection toolbar is registered", () => {
    const guard = resolveDirectorySearchResultCountGuard({
      showResultCount: true,
      filterSelectionToolbarActive: true,
      viewMode: "table",
    });
    expect(guard.hasSearchSelectionChip).toBe(true);
    expect(shouldShowHubDirectoryResultCount(guard)).toBe(false);
  });

  it("keeps HubResultCount in card mode when selection chip moves to row-2", () => {
    const guard = resolveDirectorySearchResultCountGuard({
      showResultCount: true,
      filterSelectionToolbarActive: true,
      viewMode: "card",
    });
    expect(guard.hasSearchSelectionChip).toBe(false);
    expect(shouldShowHubDirectoryResultCount(guard)).toBe(true);
  });

  it("respects explicit showResultCount=false", () => {
    const guard = resolveDirectorySearchResultCountGuard({
      showResultCount: false,
      filterSelectionToolbarActive: true,
      viewMode: "table",
    });
    expect(shouldShowHubDirectoryResultCount(guard)).toBe(false);
  });

  it("merges manual hasSearchSelectionChip with auto-guard", () => {
    const guard = resolveDirectorySearchResultCountGuard({
      hasSearchSelectionChip: true,
      filterSelectionToolbarActive: false,
      viewMode: "card",
    });
    expect(guard.hasSearchSelectionChip).toBe(true);
    expect(shouldShowHubDirectoryResultCount(guard)).toBe(false);
  });
});
