import { describe, expect, it } from "vitest";
import { DEFAULT_WORKFLOWS } from "./workflow-defaults";
import { matchesWorkflowDirectorySearch } from "./workflow-directory-search";

describe("matchesWorkflowDirectorySearch", () => {
  const sample = DEFAULT_WORKFLOWS[0]!;

  it("matches numeric WF id fragment", () => {
    expect(matchesWorkflowDirectorySearch(sample, "0001", DEFAULT_WORKFLOWS)).toBe(true);
  });

  it("matches workflow name substring", () => {
    expect(matchesWorkflowDirectorySearch(sample, sample.name.slice(0, 4).toLowerCase(), DEFAULT_WORKFLOWS)).toBe(
      true,
    );
  });

  it("rejects unrelated numeric id", () => {
    expect(matchesWorkflowDirectorySearch(sample, "9999", DEFAULT_WORKFLOWS)).toBe(false);
  });
});
