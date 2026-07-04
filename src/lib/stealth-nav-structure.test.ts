import { describe, expect, it } from "vitest";
import { ClipboardList, Store } from "lucide-react";
import {
  stealthScreenChrome,
  stealthWorkflowTabChrome,
  STEALTH_NAV_STRUCTURE,
} from "./stealth-nav-structure";
import { resolveStealthActiveScreenId } from "./stealth-active-screen";

describe("stealthScreenChrome", () => {
  it("matches workflow sidebar group entry", () => {
    const nav = STEALTH_NAV_STRUCTURE.find((e) => e.kind === "group" && e.id === "workflow");
    const chrome = stealthScreenChrome("workflow");
    expect(chrome.label).toBe(nav?.label);
    expect(chrome.icon).toBe(ClipboardList);
    expect(chrome.titleIconClass).toContain("violet");
  });
});

describe("stealthWorkflowTabChrome", () => {
  it("resolves Store subnav", () => {
    const chrome = stealthWorkflowTabChrome("store");
    expect(chrome.label).toBe("Store");
    expect(chrome.icon).toBe(Store);
  });
});

describe("resolveStealthActiveScreenId", () => {
  it("maps workflow store sub-tab", () => {
    expect(resolveStealthActiveScreenId("workflow", { workflowTab: "store" })).toBe("workflow-store");
    expect(resolveStealthActiveScreenId("workflow", { workflowTab: "editor" })).toBe("workflow");
  });
});
