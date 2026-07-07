import { describe, expect, it } from "vitest";
import { hubMainShellClassName } from "./hub-main-shell-class";

describe("hubMainShellClassName", () => {
  it("directory mode scrolls", () => {
    expect(hubMainShellClassName({ screen: "users", mode: "directory" })).toContain("hub-scrollbar");
    expect(hubMainShellClassName({ screen: "users", mode: "directory" })).toContain("overflow-y-auto");
    expect(hubMainShellClassName({ screen: "users", mode: "directory" })).not.toContain("overflow-hidden");
  });

  it("split mode locks overflow", () => {
    expect(hubMainShellClassName({ screen: "inbox", mode: "split" })).toContain("overflow-hidden");
  });

  it("splitScreens list", () => {
    expect(
      hubMainShellClassName({ screen: "inbox", splitScreens: ["inbox", "automation"] }),
    ).toContain("overflow-hidden");
    expect(hubMainShellClassName({ screen: "bots", splitScreens: ["inbox"] })).toContain("overflow-y-auto");
  });
});
