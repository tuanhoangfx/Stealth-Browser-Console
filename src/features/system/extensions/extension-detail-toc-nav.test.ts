import { describe, expect, it } from "vitest";
import { extensionDetailTocNavItems } from "./extension-detail-toc-nav";
import {
  EXTENSION_DETAIL_SECTION_INSTALL,
  EXTENSION_DETAIL_SECTION_LOG,
  EXTENSION_DETAIL_SECTION_METADATA,
} from "./extension-detail-toc";

describe("extensionDetailTocNavItems", () => {
  it("New modal shows New + Console (Layout 3 Log rail)", () => {
    const items = extensionDetailTocNavItems({ showInstall: true });
    expect(items.map((item) => item.id)).toEqual([
      EXTENSION_DETAIL_SECTION_INSTALL,
      EXTENSION_DETAIL_SECTION_LOG,
    ]);
    expect(items.map((item) => item.label)).toEqual(["New", "Console"]);
  });

  it("existing extension keeps Metadata + Console", () => {
    const items = extensionDetailTocNavItems();
    expect(items.map((item) => item.id)).toEqual([
      EXTENSION_DETAIL_SECTION_METADATA,
      EXTENSION_DETAIL_SECTION_LOG,
    ]);
  });
});
