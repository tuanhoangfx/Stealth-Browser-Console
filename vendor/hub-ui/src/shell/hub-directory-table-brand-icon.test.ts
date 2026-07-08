/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HUB_DIRECTORY_TABLE_BRAND_ICON_PX } from "./HubDirectoryBrandNameCell";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../styles");

describe("hub directory table brand icon SSOT", () => {
  it("locks table body glyph box to 16px", () => {
    expect(HUB_DIRECTORY_TABLE_BRAND_ICON_PX).toBe(16);
  });

  it("CSS sets --hub-directory-table-brand-icon-px fallback 16px on twofa + directory tables", () => {
    const css = readFileSync(join(stylesDir, "hub-directory-table.css"), "utf8");
    expect(css).toContain("--hub-directory-table-brand-icon-px, 16px");
    expect(css).toContain("hub-users-table--twofa");
    expect(css).toContain("background: transparent !important");
  });
});
