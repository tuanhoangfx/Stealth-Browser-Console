import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextWithExecCommand, copyTextWithFallback } from "./copy-text-with-fallback";

describe("copyTextWithFallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyTextWithFallback("order-123")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("order-123");
  });

  it("falls back to execCommand when clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    await expect(copyTextWithFallback("buyer-456")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("execCommand helper returns false on failure", () => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => {
        throw new Error("blocked");
      },
    });
    expect(copyTextWithExecCommand("x")).toBe(false);
  });
});
