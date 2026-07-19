import { describe, expect, it } from "vitest";
import { parseHubTableHeaderLabel, hubTableLabelTextForGlyph } from "./hub-table-header-label";

describe("parseHubTableHeaderLabel", () => {
  it("splits embedded superhero emoji from Own", () => {
    expect(parseHubTableHeaderLabel("🦸‍♂️Own")).toEqual({
      embeddedGlyph: "🦸‍♂️",
      text: "Own",
    });
  });

  it("hubTableLabelTextForGlyph strips leading emoji when glyph is shown separately", () => {
    expect(hubTableLabelTextForGlyph("🦸‍♂️Own")).toBe("Own");
    expect(hubTableLabelTextForGlyph("Own")).toBe("Own");
  });

  it("leaves plain labels intact", () => {
    expect(parseHubTableHeaderLabel("Plan Tier")).toEqual({
      embeddedGlyph: null,
      text: "Plan Tier",
    });
  });

  it("leaves emoji-only labels intact", () => {
    expect(parseHubTableHeaderLabel("🏅")).toEqual({
      embeddedGlyph: null,
      text: "🏅",
    });
  });
});
