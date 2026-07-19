import { describe, expect, it } from "vitest";
import {
  buildDirectoryStickyColumnsCss,
  directoryStickyLeadExceedsViewport,
  measureDirectoryStickyLeadWidthPx,
  DIRECTORY_STICKY_LEFT_VAR_PREFIX,
  DIRECTORY_STICKY_VIEWPORT_WARN_PX,
} from "./directory-sticky-columns";

const SCOPE = ".p0005-crm-directory-table--sticky-lead";

const css = buildDirectoryStickyColumnsCss({
  scopeSelector: SCOPE,
  entries: [
    { colClass: "hub-users-col--select", width: "36px" },
    { colClass: "hub-users-col--od-order-date", width: "7.25rem" },
    { colClass: "hub-users-col--od-updated", width: "6.5rem" },
    { colClass: "hub-users-col--od-order-id", width: "8rem" },
  ],
});

describe("buildDirectoryStickyColumnsCss", () => {
  it("computes cumulative left offsets (px + rem via calc)", () => {
    expect(css).toContain(`${SCOPE} tbody td.hub-users-col--select{z-index:3;background-color:var(--panel, #121830);}`);
    // select left = 0
    expect(css).toContain("left:0px;");
    // order-date left = select width (36px)
    expect(css).toContain(".hub-users-col--od-order-date,\n" + `${SCOPE} tbody td.hub-users-col--od-order-date{position:sticky;left:36px;}`);
    // updated left = 36px + 7.25rem
    expect(css).toContain("left:calc(36px + 7.25rem);");
    // order-id left = 36px + 13.75rem
    expect(css).toContain("left:calc(36px + 13.75rem);");
  });

  it("frozen body cells stay opaque on the --panel base", () => {
    expect(css).toContain("background-color:var(--panel, #121830);");
  });

  it("re-applies every row-state tint as a layer over the opaque base (no UI change)", () => {
    // hover 0.06, selected 0.08, selected:hover 0.1, detail 0.08, detail:hover 0.1, highlighted 0.07, highlighted:hover 0.09
    for (const tint of [
      "rgba(99, 102, 241, 0.06)",
      "rgba(99, 102, 241, 0.08)",
      "rgba(99, 102, 241, 0.1)",
      "rgba(52, 211, 153, 0.08)",
      "rgba(52, 211, 153, 0.1)",
      "rgba(99, 102, 241, 0.07)",
      "rgba(99, 102, 241, 0.09)",
    ]) {
      expect(css).toContain(`background-image:linear-gradient(${tint},${tint});`);
    }
  });

  it("keeps the left-accent bar for detail / highlighted on the first frozen cell", () => {
    expect(css).toContain(
      `${SCOPE} .hub-users-row.is-detail td.hub-users-col--select{box-shadow:inset 3px 0 0 rgba(52, 211, 153, 0.5);}`,
    );
    expect(css).toContain(
      `${SCOPE} .hub-users-row.is-highlighted td.hub-users-col--select{box-shadow:inset 3px 0 0 rgba(129, 140, 248, 0.45);}`,
    );
  });

  it("edge shadow appears only while scrolled (last frozen column)", () => {
    expect(css).toContain(`${SCOPE}[data-sticky-scrolled="1"] tbody td.hub-users-col--od-order-id`);
    expect(css).toContain("box-shadow:8px 0 8px -8px rgba(0,0,0,0.45);");
  });

  it("wires the frozen flash animation for post-edit rows", () => {
    expect(css).toContain("animation:hub-flash-border-directory-row-frozen");
  });

  it("returns empty for no entries", () => {
    expect(buildDirectoryStickyColumnsCss({ scopeSelector: SCOPE, entries: [] })).toBe("");
  });

  it("rejects non px/rem widths", () => {
    expect(() =>
      buildDirectoryStickyColumnsCss({
        scopeSelector: SCOPE,
        entries: [{ colClass: "x", width: "10%" }],
      }),
    ).toThrow(/unsupported width/);
  });
});

describe("buildDirectoryStickyColumnsCss — measured mode (fluid/zoom tables)", () => {
  const measuredScope = ".p0016-channels-sticky-lead";
  const measured = buildDirectoryStickyColumnsCss({
    scopeSelector: measuredScope,
    leftMode: "measured",
    // Fluid % widths — would throw in css mode; measured mode ignores width entirely.
    entries: [
      { colClass: "hub-users-col--select", width: "36px" },
      { colClass: "hub-users-col--name", width: "22%" },
      { colClass: "hub-users-col--id", width: "14%" },
    ],
  });

  it("never parses widths — accepts % / any unit without throwing", () => {
    expect(() =>
      buildDirectoryStickyColumnsCss({
        scopeSelector: measuredScope,
        leftMode: "measured",
        entries: [{ colClass: "x", width: "10%" }],
      }),
    ).not.toThrow();
  });

  it("drives each left offset from the runtime CSS var (index-ordered)", () => {
    expect(measured).toContain(`left:var(${DIRECTORY_STICKY_LEFT_VAR_PREFIX}0, 0px);`);
    expect(measured).toContain(`left:var(${DIRECTORY_STICKY_LEFT_VAR_PREFIX}1, 0px);`);
    expect(measured).toContain(`left:var(${DIRECTORY_STICKY_LEFT_VAR_PREFIX}2, 0px);`);
  });

  it("keeps the same opaque base + edge shadow contract as css mode", () => {
    expect(measured).toContain("background-color:var(--panel, #121830);");
    expect(measured).toContain("box-shadow:8px 0 8px -8px rgba(0,0,0,0.45);");
  });
});

describe("measureDirectoryStickyLeadWidthPx", () => {
  it("sums px + rem widths against the rem base", () => {
    const px = measureDirectoryStickyLeadWidthPx(
      [
        { colClass: "a", width: "36px" },
        { colClass: "b", width: "7.25rem" },
        { colClass: "c", width: "6.5rem" },
      ],
      16,
    );
    expect(px).toBe(36 + 7.25 * 16 + 6.5 * 16);
  });

  it("flags a frozen block that would eat a small viewport", () => {
    // Orders default: select + 5 identity columns (Created·Update·Order ID·Customer·Product).
    const ordersDefaultFreeze = [
      { colClass: "select", width: "36px" },
      { colClass: "od-order-date", width: "7.25rem" },
      { colClass: "od-updated", width: "6.5rem" },
      { colClass: "od-order-id", width: "8rem" },
      { colClass: "od-full-info", width: "18rem" },
      { colClass: "od-product", width: "16rem" },
    ];
    expect(measureDirectoryStickyLeadWidthPx(ordersDefaultFreeze)).toBeGreaterThan(
      DIRECTORY_STICKY_VIEWPORT_WARN_PX,
    );
    expect(directoryStickyLeadExceedsViewport(ordersDefaultFreeze)).toBe(true);
  });

  it("stays under threshold for a modest freeze block", () => {
    const modest = [
      { colClass: "select", width: "36px" },
      { colClass: "od-order-date", width: "7.25rem" },
      { colClass: "od-order-id", width: "8rem" },
    ];
    expect(directoryStickyLeadExceedsViewport(modest)).toBe(false);
  });
});
