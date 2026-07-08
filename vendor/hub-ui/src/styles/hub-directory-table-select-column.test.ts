import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "hub-directory-table.css"),
  "utf8",
);

describe("hub-directory-table select column SSOT", () => {
  it("locks 36px width and 6px 4px padding on select th/td", () => {
    const selectBlock = css.match(
      /table\.hub-users-table\[data-hub-directory-select\] td\.hub-users-col--select\s*\{[^}]+\}/,
    )?.[0];
    expect(selectBlock).toBeTruthy();
    expect(selectBlock).toContain("width: 36px");
    expect(selectBlock).toContain("padding: 6px 4px");
    expect(selectBlock).toContain("vertical-align: middle");
  });

  it("centers checkbox label at 16px inside select column", () => {
    const labelBlock = css.match(
      /table\.hub-users-table\[data-hub-directory-select\] \.hub-users-select-row\s*\{[^}]+\}/,
    )?.[0];
    expect(labelBlock).toContain("width: 16px");
    expect(labelBlock).toContain("height: 16px");
    expect(labelBlock).toContain("align-items: center");
  });
});
