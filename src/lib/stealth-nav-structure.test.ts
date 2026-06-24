import { describe, expect, it } from "vitest";
import { ClipboardList } from "lucide-react";
import { stealthScreenChrome, STEALTH_NAV_STRUCTURE } from "./stealth-nav-structure";

describe("stealthScreenChrome", () => {
  it("matches workflow sidebar nav entry", () => {
    const nav = STEALTH_NAV_STRUCTURE.find((e) => e.kind === "screen" && e.screen === "workflow");
    const chrome = stealthScreenChrome("workflow");
    expect(chrome.label).toBe(nav?.label);
    expect(chrome.icon).toBe(nav?.icon);
    expect(chrome.icon).toBe(ClipboardList);
    expect(chrome.titleIconClass).toContain("violet");
  });
});
