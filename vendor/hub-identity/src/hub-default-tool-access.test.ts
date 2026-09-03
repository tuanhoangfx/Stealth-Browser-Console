import { describe, expect, it } from "vitest";
import {
  applyDefaultToolsToUserRow,
  hasEffectiveHubToolAccess,
  isHubCsBuyerLoginId,
  isHubDefaultUserTool,
  isHubLockedDefaultGrantTool,
  mergeDefaultUserToolCodes,
  resolveEffectiveHubUserToolCodes,
} from "./hub-default-tool-access";

describe("hub-default-tool-access", () => {
  it("recognizes default tools", () => {
    expect(isHubDefaultUserTool("E0001")).toBe(true);
    expect(isHubDefaultUserTool("P0016")).toBe(false);
    expect(isHubDefaultUserTool("P0020")).toBe(false);
    expect(isHubDefaultUserTool("P0022")).toBe(true);
    expect(isHubDefaultUserTool("P0004")).toBe(false);
  });

  it("merges default tool codes only for CS buyers", () => {
    expect(mergeDefaultUserToolCodes(["P0005"], "cs00001")).toEqual(["E0001", "P0005", "P0022"]);
    expect(mergeDefaultUserToolCodes(["P0005"], "duyceo01")).toEqual(["P0005"]);
  });

  it("grants default tools to CS buyers and admins/managers only", () => {
    expect(hasEffectiveHubToolAccess("user", "E0001", [], { loginId: "cs00001" })).toBe(true);
    expect(hasEffectiveHubToolAccess("user", "E0001", [], { loginId: "duyceo01" })).toBe(false);
    expect(hasEffectiveHubToolAccess("user", "P0016", [])).toBe(false);
    expect(hasEffectiveHubToolAccess("user", "P0022", [], { loginId: "cs00042" })).toBe(true);
    expect(hasEffectiveHubToolAccess("manager", "P0015", [])).toBe(true);
    expect(hasEffectiveHubToolAccess("manager", "P0004", [])).toBe(false);
    expect(hasEffectiveHubToolAccess("admin", "P0004", [])).toBe(true);
  });

  it("locks default grants only for CS buyers", () => {
    expect(isHubLockedDefaultGrantTool("E0001", "cs00001", "user")).toBe(true);
    expect(isHubLockedDefaultGrantTool("E0001", "duyceo01", "user")).toBe(false);
    expect(isHubLockedDefaultGrantTool("E0001", "cs00001", "manager")).toBe(false);
  });

  it("resolves manager catalog access excluding P0004", () => {
    const catalog = ["P0003", "P0004", "P0012", "P0022"];
    expect(resolveEffectiveHubUserToolCodes({ role: "manager", toolCodes: [] }, catalog)).toEqual([
      "P0003",
      "P0012",
      "P0022",
    ]);
    expect(resolveEffectiveHubUserToolCodes({ role: "admin", toolCodes: [] }, catalog)).toEqual(catalog);
    expect(resolveEffectiveHubUserToolCodes({ role: "user", toolCodes: ["P0015"] }, catalog)).toEqual(["P0015"]);
  });

  it("applies defaults to CS buyer rows only", () => {
    const enzy = applyDefaultToolsToUserRow({
      role: "user",
      loginId: "duyceo01",
      toolCodes: ["P0015", "E0001", "P0022"],
      toolCount: 3,
    });
    expect(enzy.toolCodes).toEqual(["P0015"]);
    expect(isHubCsBuyerLoginId("cs00001")).toBe(true);
    const buyer = applyDefaultToolsToUserRow({
      role: "user",
      loginId: "cs00001",
      toolCodes: ["P0005"],
      toolCount: 1,
    });
    expect(buyer.toolCodes).toEqual(["E0001", "P0005", "P0022"]);
  });
});
