import { describe, expect, it } from "vitest";
import {
  HUB_ADM_ACTIVITY_LOG_EMPTY_MESSAGE,
  HUB_ADM_ACTIVITY_RAIL_TITLE,
  HUB_ADM_LOG_MUTED_CLASS,
} from "./hubAccountDetailModal";

describe("hubAccountDetailModal SSOT", () => {
  it("exports log muted class token", () => {
    expect(HUB_ADM_LOG_MUTED_CLASS).toBe("hub-adm-muted");
  });

  it("exports Activity rail copy tokens", () => {
    expect(HUB_ADM_ACTIVITY_RAIL_TITLE).toBe("Activity");
    expect(HUB_ADM_ACTIVITY_LOG_EMPTY_MESSAGE).toContain("No activity");
  });
});
