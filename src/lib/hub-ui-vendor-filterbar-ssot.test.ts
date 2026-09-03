import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const vendorFilterBar = readFileSync(
  path.resolve(here, "../../vendor/hub-ui/src/shell/FilterBar.tsx"),
  "utf8",
);

describe("P0003 hub-ui vendor FilterBar SSOT", () => {
  it("keeps directory dropdown panel rows golden text-sm (toolbarChrome is gap-only)", () => {
    expect(vendorFilterBar).toMatch(/const compactDropdown = panelScope === "twofa"/);
    expect(vendorFilterBar).not.toMatch(/panelScope === "twofa" \|\| toolbarChrome/);
    expect(vendorFilterBar).toMatch(/toolbarChrome=\{layout === "hub"\}/);
  });

  it("uses HubSplitDirectoryFilterBar for Profiles directory filters", () => {
    const chrome = readFileSync(
      path.resolve(here, "../features/profiles/useProfileDirectoryChrome.tsx"),
      "utf8",
    );
    expect(chrome).toContain("HubSplitDirectoryFilterBar");
  });
});
