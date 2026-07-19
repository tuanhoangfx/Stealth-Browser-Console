import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HUB_FLASH_BORDER_MS, useHubFlashBorder } from "./useHubFlashBorder";

describe("useHubFlashBorder", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds ids then clears after duration", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useHubFlashBorder(400));

    act(() => {
      result.current.flash("row-1");
    });
    expect(result.current.flashIds.has("row-1")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(result.current.flashIds.has("row-1")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.flashIds.has("row-1")).toBe(false);
  });

  it("flashes multiple ids in one call", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useHubFlashBorder(200));

    act(() => {
      result.current.flash(["a", "b"]);
    });
    expect(result.current.flashIds.has("a")).toBe(true);
    expect(result.current.flashIds.has("b")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.flashIds.size).toBe(0);
  });

  it("extends timer when the same id is flashed again", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useHubFlashBorder(300));

    act(() => {
      result.current.flash("row-1");
    });
    act(() => {
      vi.advanceTimersByTime(250);
      result.current.flash("row-1");
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.flashIds.has("row-1")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current.flashIds.has("row-1")).toBe(false);
  });

  it("defaults to HUB_FLASH_BORDER_MS", () => {
    expect(HUB_FLASH_BORDER_MS).toBe(2000);
  });
});
