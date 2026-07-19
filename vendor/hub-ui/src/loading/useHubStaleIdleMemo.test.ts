/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  clearHubStaleIdleMemoCache,
  hubFilterValuesFingerprint,
  useHubStaleIdleMemo,
} from "./useHubStaleIdleMemo";

describe("hubFilterValuesFingerprint", () => {
  it("is order-independent", () => {
    expect(hubFilterValuesFingerprint({ b: ["2", "1"], a: "x" })).toBe(
      hubFilterValuesFingerprint({ a: "x", b: ["1", "2"] }),
    );
  });
});

describe("useHubStaleIdleMemo", () => {
  beforeEach(() => {
    clearHubStaleIdleMemoCache();
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0) as unknown as number,
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    vi.stubGlobal(
      "requestIdleCallback",
      (cb: IdleRequestCallback) =>
        window.setTimeout(
          () =>
            cb({
              didTimeout: false,
              timeRemaining: () => 50,
            }),
          0,
        ) as unknown as number,
    );
    vi.stubGlobal("cancelIdleCallback", (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearHubStaleIdleMemoCache();
  });

  it("paints cache hit immediately on remount", async () => {
    let n = 0;
    const { result, unmount } = renderHook(() =>
      useHubStaleIdleMemo(
        "test-ns",
        "a",
        () => {
          n += 1;
          return `v${n}`;
        },
        true,
      ),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(result.current).toBe("v1");
    unmount();

    const { result: result2 } = renderHook(() =>
      useHubStaleIdleMemo(
        "test-ns",
        "a",
        () => {
          n += 1;
          return `v${n}`;
        },
        true,
      ),
    );
    expect(result2.current).toBe("v1");
  });

  it("keeps previous value while new fingerprint computes", async () => {
    const { result, rerender } = renderHook(
      ({ fp }: { fp: string }) =>
        useHubStaleIdleMemo("test-ns2", fp, () => `val-${fp}`, true),
      { initialProps: { fp: "a" } },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(result.current).toBe("val-a");

    rerender({ fp: "b" });
    // Synchronous stale: still previous until rAF×2 apply
    expect(result.current).toBe("val-a");

    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(result.current).toBe("val-b");
  });
});
