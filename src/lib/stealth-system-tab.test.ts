import { describe, expect, it } from "vitest";
import { ACTIVE_DESIGN_COUNT } from "../features/system/design-template/design-registry";
import {
  coerceStealthSystemTab,
  defaultStealthSystemTab,
  isStealthDesignTabVisible,
  isStealthSystemTab,
} from "./stealth-system-tab";

describe("stealth system tabs", () => {
  it("defaults to Extensions and hides empty Design", () => {
    expect(defaultStealthSystemTab()).toBe("extensions");
    expect(isStealthDesignTabVisible()).toBe(ACTIVE_DESIGN_COUNT > 0);
    expect(isStealthSystemTab("overview")).toBe(false);
    expect(isStealthSystemTab("design")).toBe(ACTIVE_DESIGN_COUNT > 0);
    expect(coerceStealthSystemTab("overview")).toBe("extensions");
    expect(coerceStealthSystemTab("design")).toBe(ACTIVE_DESIGN_COUNT > 0 ? "design" : "extensions");
    expect(coerceStealthSystemTab("backup")).toBe("backup");
  });
});
