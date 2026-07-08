import { describe, expect, it } from "vitest";
import { chartBreakdownFromLabels } from "./chart-breakdown";

describe("chartBreakdownFromLabels emojiFor", () => {
  it("prefers emojiGlyph over iconFor when emojiFor returns a glyph", () => {
    const rows = chartBreakdownFromLabels(["Synced", "Synced", "Error"], {
      iconFor: () => ({ icon: (() => null) as never, className: "text-red-300" }),
      emojiFor: (label) => (label === "Synced" ? "✅" : label === "Error" ? "❌" : undefined),
    });
    const synced = rows.find((row) => row.label === "Synced");
    const error = rows.find((row) => row.label === "Error");
    expect(synced?.emojiGlyph).toBe("✅");
    expect(error?.emojiGlyph).toBe("❌");
    expect(synced?.iconMeta).toBeUndefined();
    expect(error?.iconMeta).toBeUndefined();
  });

  it("falls back to iconFor when emojiFor is omitted", () => {
    const iconMeta = { icon: (() => null) as never, className: "text-sky-300" };
    const rows = chartBreakdownFromLabels(["Alpha"], {
      iconFor: () => iconMeta,
    });
    expect(rows[0]?.iconMeta).toBe(iconMeta);
    expect(rows[0]?.emojiGlyph).toBeUndefined();
  });
});
