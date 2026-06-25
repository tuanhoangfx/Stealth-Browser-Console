import { describe, expect, it } from "vitest";
import {
  applyDefaultToolsToUserRow,
  hasEffectiveHubToolAccess,
  isHubDefaultUserTool,
  mergeDefaultUserToolCodes,
} from "./hub-default-tool-access";

describe("hub-default-tool-access", () => {
  it("recognizes default tools", () => {
    expect(isHubDefaultUserTool("P0016")).toBe(true);
    expect(isHubDefaultUserTool("P0020")).toBe(true);
    expect(isHubDefaultUserTool("P0004")).toBe(false);
  });

  it("merges default tool codes", () => {
    expect(mergeDefaultUserToolCodes(["P0008"])).toEqual(["P0008", "P0016", "P0020"]);
  });

  it("grants default tools to regular users", () => {
    expect(hasEffectiveHubToolAccess("user", "P0016", [])).toBe(true);
    expect(hasEffectiveHubToolAccess("user", "P0008", [])).toBe(false);
    expect(hasEffectiveHubToolAccess("user", "P0008", ["P0008"])).toBe(true);
    expect(hasEffectiveHubToolAccess("admin", "P0008", [])).toBe(true);
  });

  it("applies defaults to user rows", () => {
    const row = applyDefaultToolsToUserRow({
      role: "user",
      toolCodes: ["P0008"],
      toolCount: 1,
    });
    expect(row.toolCodes).toEqual(["P0008", "P0016", "P0020"]);
    expect(row.toolCount).toBe(3);
  });
});
