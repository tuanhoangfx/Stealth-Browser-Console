import { describe, expect, it } from "vitest";
import { HUB_NONE_EMOJI, HUB_NONE_LABEL, hubNoneFilterOption } from "./hub-none-option";

describe("hub none option", () => {
  it("renders the canonical 🚫 None option with empty value by default", () => {
    const opt = hubNoneFilterOption();
    expect(opt).toEqual({ value: "", label: "None", emoji: "🚫" });
    expect(HUB_NONE_EMOJI).toBe("🚫");
    expect(HUB_NONE_LABEL).toBe("None");
  });

  it("keeps a distinct sentinel value but the same 🚫 None display", () => {
    const opt = hubNoneFilterOption("__tier_none__", { count: 7 });
    expect(opt.value).toBe("__tier_none__");
    expect(opt.label).toBe(HUB_NONE_LABEL);
    expect(opt.emoji).toBe(HUB_NONE_EMOJI);
    expect(opt.count).toBe(7);
  });
});
