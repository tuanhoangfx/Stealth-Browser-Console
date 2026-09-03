import { describe, expect, it, vi } from "vitest";
import {
  isHubToolAccessRequestRpcMissing,
  normalizeHubToolAccessRequestCode,
  recordHubToolAccessRequest,
} from "./hub-tool-access-request";

describe("hub-tool-access-request", () => {
  it("normalizes integrated tool codes", () => {
    expect(normalizeHubToolAccessRequestCode(" p0020 ")).toBe("P0020");
    expect(normalizeHubToolAccessRequestCode("E0001")).toBeNull();
    expect(normalizeHubToolAccessRequestCode("")).toBeNull();
  });

  it("records via RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, kind: "signup_tool", tool_code: "P0012" },
      error: null,
    }));
    const result = await recordHubToolAccessRequest({ rpc }, "P0012");
    expect(rpc).toHaveBeenCalledWith("hub_record_tool_access_request", { p_tool_code: "P0012" });
    expect(result).toEqual({ ok: true, kind: "signup_tool", toolCode: "P0012" });
  });

  it("fail-opens when RPC is missing", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "function hub_record_tool_access_request does not exist" },
    }));
    const result = await recordHubToolAccessRequest({ rpc }, "P0020");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("migrate_miss");
  });

  it("detects migrate-miss copy", () => {
    expect(isHubToolAccessRequestRpcMissing("PGRST202 hub_record_tool_access_request")).toBe(true);
    expect(isHubToolAccessRequestRpcMissing("permission denied")).toBe(false);
  });
});
