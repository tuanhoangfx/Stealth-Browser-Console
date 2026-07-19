import { describe, expect, it } from "vitest";
import { computeHubTableHeaderIconOnly } from "./hub-table-header-fit";

describe("computeHubTableHeaderIconOnly", () => {
  it("keeps label when th is wide enough for glyph + text + sort", () => {
    expect(
      computeHubTableHeaderIconOnly({
        thWidth: 160,
        thPadX: 8,
        btnPadX: 12,
        sortWidth: 14,
        glyphWidth: 14,
        textWidth: 52,
        gap: 5,
      }),
    ).toBe(false);
  });

  it("hides label only when th budget is below needed", () => {
    expect(
      computeHubTableHeaderIconOnly({
        thWidth: 48,
        thPadX: 4,
        btnPadX: 8,
        sortWidth: 14,
        glyphWidth: 14,
        textWidth: 52,
        gap: 5,
      }),
    ).toBe(true);
  });

  it("does not latch on a shrunk button — compare against th, not content width", () => {
    // Wide column, but a content-sized host would be ~28px (glyph+sort only after icon-only).
    const withThBudget = computeHubTableHeaderIconOnly({
      thWidth: 140,
      thPadX: 4,
      btnPadX: 12,
      sortWidth: 14,
      glyphWidth: 14,
      textWidth: 48,
      gap: 5,
    });
    expect(withThBudget).toBe(false);

    const ifMeasuredAgainstShrunkBtn = computeHubTableHeaderIconOnly({
      thWidth: 28,
      thPadX: 0,
      btnPadX: 0,
      sortWidth: 14,
      glyphWidth: 14,
      textWidth: 48,
      gap: 5,
    });
    expect(ifMeasuredAgainstShrunkBtn).toBe(true);
  });

  it("shows Provider / Status / Update at Mail chrome floors", () => {
    // Matches MAIL_COLUMN_WIDTH_BASE — glyph 14 + gap 5 + sort 14 + pads ~24.
    const chrome = { thPadX: 8, btnPadX: 12, sortWidth: 14, glyphWidth: 14, gap: 5 };
    expect(
      computeHubTableHeaderIconOnly({
        ...chrome,
        thWidth: 7.75 * 16,
        textWidth: 58, // "Provider"
      }),
    ).toBe(false);
    expect(
      computeHubTableHeaderIconOnly({
        ...chrome,
        thWidth: 6.5 * 16,
        textWidth: 42, // "Status"
      }),
    ).toBe(false);
    expect(
      computeHubTableHeaderIconOnly({
        ...chrome,
        thWidth: 7.25 * 16,
        textWidth: 48, // "Update"
      }),
    ).toBe(false);
    // Old Mail Provider floor 5.5rem → icon-only.
    expect(
      computeHubTableHeaderIconOnly({
        ...chrome,
        thWidth: 5.5 * 16,
        textWidth: 58,
      }),
    ).toBe(true);
  });
});
