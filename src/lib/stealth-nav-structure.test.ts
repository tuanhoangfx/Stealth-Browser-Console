import { describe, expect, it } from "vitest";
import { ClipboardList, Store } from "lucide-react";
import {
  stealthScreenChrome,
  stealthWorkflowTabChrome,
  STEALTH_NAV_STRUCTURE,
} from "./stealth-nav-structure";
import { resolveStealthActiveScreenId } from "./stealth-active-screen";
import { ACTIVE_DESIGN_COUNT } from "../features/system/design-template/design-registry";

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

  it("maps system extensions sub-tab", () => {
    expect(resolveStealthActiveScreenId("system", { systemTab: "extensions" })).toBe("system-extensions");
  });
});

describe("STEALTH_NAV_STRUCTURE system children", () => {
  it("omits Overview and only includes Design when ACTIVE_DESIGN_COUNT > 0", () => {
    const system = STEALTH_NAV_STRUCTURE.find((item) => item.kind === "group" && item.id === "system");
    const expected = ACTIVE_DESIGN_COUNT > 0 ? ["design", "extensions", "backup"] : ["extensions", "backup"];
    expect(system && system.kind === "group" ? system.children.map((child) => child.view) : []).toEqual(expected);
  });
});
