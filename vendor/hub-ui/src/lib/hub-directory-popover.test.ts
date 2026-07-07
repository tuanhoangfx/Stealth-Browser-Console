import { describe, expect, it } from "vitest";
import { HUB_DIRECTORY_POPOVER_OFFSET_PX, hubDirectoryPopoverPosition } from "./hub-directory-popover";

describe("hubDirectoryPopoverPosition", () => {
  it("places popover below anchor start edge with offset", () => {
    const rect = { left: 40, right: 120, bottom: 100, top: 80, width: 80, height: 20 } as DOMRect;
    expect(hubDirectoryPopoverPosition(rect)).toEqual({
      top: 100 + HUB_DIRECTORY_POPOVER_OFFSET_PX,
      left: 40,
    });
  });

  it("clamps left to viewport margin", () => {
    const rect = { left: 2, right: 50, bottom: 50, top: 30, width: 48, height: 20 } as DOMRect;
    expect(hubDirectoryPopoverPosition(rect).left).toBe(8);
  });
});
