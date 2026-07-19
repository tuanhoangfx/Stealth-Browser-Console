import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "hub-account-detail-modal.css"),
  "utf8",
);

/**
 * Detail-line rows (📜 Order Details, notes, credential blocks) place the label in col 1 and the
 * value in cols 2–6. The label is top-aligned (`align-self: start`); the value MUST also top-align
 * so its first line lines up with the label. Vertically centering the value drifts single-line
 * values ~4-5px below the label and floats the label for multi-line values (the "lệch" bug).
 */
function ruleBlock(selectorFragment: string): string {
  const escaped = selectorFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]+\\}`));
  expect(match, `missing CSS rule for: ${selectorFragment}`).toBeTruthy();
  return match![0];
}

describe("hub-account-detail-modal detail-line alignment SSOT", () => {
  it("top-aligns the multiline detail-line value to the label's first line", () => {
    const block = ruleBlock(
      ".hub-adm-form-row--detail-line .hub-adm-inline-field--multiline > .hub-adm-inline-field__value",
    );
    expect(block).toContain("align-self: start");
    expect(block).not.toContain("align-self: center");
  });

  it("top-aligns the multiline click-edit box (not centered)", () => {
    const block = ruleBlock(
      ".hub-adm-form-row--detail-line .hub-adm-inline-field--multiline .hub-adm-click-edit",
    );
    expect(block).toContain("align-items: flex-start");
    expect(block).not.toContain("align-items: center");
  });

  it("top-aligns the readonly detail-line value to the label's first line", () => {
    const block = ruleBlock(
      ".hub-adm-form-row--detail-line .hub-adm-inline-field--readonly > .hub-adm-inline-field__value",
    );
    expect(block).toContain("align-self: start");
  });

  it("keeps both detail-line labels top-aligned (col-1 anchor)", () => {
    for (const variant of ["multiline", "readonly"] as const) {
      const block = ruleBlock(
        `.hub-adm-form-row--detail-line .hub-adm-inline-field--${variant} > :is(.hub-adm-inline-field__label, .hub-directory-popover-anchor)`,
      );
      expect(block).toContain("grid-column: 1");
      expect(block).toContain("align-self: start");
    }
  });
});
