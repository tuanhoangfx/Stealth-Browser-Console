import { describe, expect, it, vi } from "vitest";
import {
  isHubTempEntityId,
  runHubDetailOptimisticSave,
} from "./hub-detail-optimistic-save";

describe("runHubDetailOptimisticSave", () => {
  it("clears busy before cloud finishes", async () => {
    const events: string[] = [];
    let cloudDone = false;
    let resolveCloud!: () => void;
    const cloudGate = new Promise<void>((resolve) => {
      resolveCloud = resolve;
    });

    const resultPromise = runHubDetailOptimisticSave({
      setBusy: (v) => events.push(v ? "busy:on" : "busy:off"),
      applyLocal: () => {
        events.push("local");
      },
      persistCloud: async () => {
        events.push("cloud:start");
        await cloudGate;
        cloudDone = true;
        events.push("cloud:done");
      },
    });

    await Promise.resolve();
    expect(events).toEqual(["busy:on", "local", "busy:off", "cloud:start"]);
    expect(cloudDone).toBe(false);

    resolveCloud();
    await expect(resultPromise).resolves.toBe("ok");
    expect(cloudDone).toBe(true);
  });

  it("surfaces local errors and skips cloud", async () => {
    const persistCloud = vi.fn(async () => {});
    const onLocalError = vi.fn();
    const result = await runHubDetailOptimisticSave({
      setBusy: () => {},
      applyLocal: () => {
        throw new Error("invalid");
      },
      persistCloud,
      onLocalError,
    });
    expect(result).toBe("local-error");
    expect(onLocalError).toHaveBeenCalled();
    expect(persistCloud).not.toHaveBeenCalled();
  });

  it("isHubTempEntityId", () => {
    expect(isHubTempEntityId("temp-abc")).toBe(true);
    expect(isHubTempEntityId("uuid-real")).toBe(false);
    expect(isHubTempEntityId("")).toBe(false);
  });
});
