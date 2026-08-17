import { describe, expect, it } from "vitest";
import {
  buildDirectoryFixedColumnTabularSelectors,
  generateDirectoryFixedColumnCss,
  verifyDirectoryColumnMetaKeys,
  verifyDirectoryColumnWidths,
  verifyDirectoryFixedColumnCss,
} from "./directory-fixed-column-css";

const TABLE_ROOTS = [
  "table.hub-users-table--directory-6.p0005-crm-directory-table[data-hub-directory-select]",
  "table.hub-users-table.p0005-crm-directory-table[data-hub-directory-select]",
] as const;

const SAMPLE_ENTRIES = [
  { colClass: "hub-users-col--od-order-date", width: "5.75rem", kind: "date" as const },
  { colClass: "hub-users-col--od-order-id", width: "7.25rem", kind: "code" as const },
] as const;

describe("generateDirectoryFixedColumnCss", () => {
  it("emits fixed width blocks for col/th/td on every table root", () => {
    const css = generateDirectoryFixedColumnCss({
      entries: SAMPLE_ENTRIES,
      tableRoots: TABLE_ROOTS,
    });
    expect(css).toContain("width: 5.75rem");
    expect(css).toContain("col.hub-users-col--od-order-date");
    expect(css).toContain("th.hub-users-col--od-order-id");
    expect(css).toContain("td.hub-users-col--od-order-id");
    expect(css).toContain("text-align: left");
    expect(css).toContain("font-variant-numeric: tabular-nums");
  });

  it("builds default tabular selectors by column kind", () => {
    const selectors = buildDirectoryFixedColumnTabularSelectors(TABLE_ROOTS, SAMPLE_ENTRIES);
    expect(selectors.some((s) => s.includes("hub-directory-timestamp"))).toBe(true);
    expect(selectors.some((s) => s.includes("customer-copy-text"))).toBe(true);
  });

  it("verifyDirectoryFixedColumnCss passes for matching output", () => {
    const css = generateDirectoryFixedColumnCss({
      entries: SAMPLE_ENTRIES,
      tableRoots: TABLE_ROOTS,
    });
    expect(verifyDirectoryFixedColumnCss(css, SAMPLE_ENTRIES)).toEqual([]);
  });

  it("verifyDirectoryFixedColumnCss reports width mismatch", () => {
    const css = generateDirectoryFixedColumnCss({
      entries: [{ colClass: "hub-users-col--od-order-date", width: "5.75rem", kind: "date" }],
      tableRoots: TABLE_ROOTS,
    });
    const errors = verifyDirectoryFixedColumnCss(css, [
      { colClass: "hub-users-col--od-order-date", width: "9rem", kind: "date" },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("verifyDirectoryColumnWidths accepts entries without kind", () => {
    const css = "td.hub-users-col--place-name { width: 11rem; min-width: 11rem; }";
    expect(
      verifyDirectoryColumnWidths(css, [{ colClass: "hub-users-col--place-name", width: "11rem" }]),
    ).toEqual([]);
  });

  it("verifyDirectoryColumnMetaKeys checks width and optional columnKind", () => {
    const metaSource = `
      order_date: orderSheetColumnMeta("📅", "Date", "hub-users-col--od-order-date", "5.75rem", hints, { columnKind: "date" }),
      product_name: orderSheetColumnMeta("🏷️", "Product", "hub-users-col--od-product", "16rem"),
    `;
    const entries = [
      { colClass: "hub-users-col--od-order-date", width: "5.75rem", kind: "date" as const, keys: ["order_date"] },
      { colClass: "hub-users-col--od-product", width: "16rem", keys: ["product_name"] },
    ];
    expect(
      verifyDirectoryColumnMetaKeys(metaSource, entries, { requireColumnKind: true, metaLabel: "meta" }),
    ).toEqual([]);
    const bad = verifyDirectoryColumnMetaKeys(metaSource, entries, { requireColumnKind: true }).filter((e) =>
      e.includes("product_name"),
    );
    expect(bad.some((e) => e.includes("columnKind"))).toBe(false);
  });
});
