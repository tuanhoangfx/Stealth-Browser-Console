import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HubFilterDatePicker } from "./HubFilterDatePicker";

describe("HubFilterDatePicker", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the P0012 Todo calendar's ISO value and Clear action", () => {
    const onChange = vi.fn();
    render(
      <HubFilterDatePicker
        value="2026-08-15"
        onChange={onChange}
        placeholder="Select due date"
        locale="en"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "15/08/2026" }));
    fireEvent.click(screen.getByRole("button", { name: "15" }));
    expect(onChange).toHaveBeenCalledWith("2026-08-15");

    fireEvent.click(screen.getByRole("button", { name: "15/08/2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("opens above the trigger when there is more space above than below", () => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        top: 520,
        bottom: 552,
        left: 40,
        right: 220,
        width: 180,
        height: 32,
        x: 40,
        y: 520,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });

    render(<HubFilterDatePicker value="" onChange={vi.fn()} placeholder="Select due date" locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Select due date" }));

    const panel = document.querySelector("[class*='fixed']") as HTMLElement | null;
    expect(panel).toBeTruthy();
    expect(Number.parseFloat(panel!.style.top)).toBeLessThan(520);
  });

  it("uses the Todo calendar: Monday week and month sticker", () => {
    render(
      <HubFilterDatePicker value="2026-10-05" onChange={vi.fn()} placeholder="Select due date" locale="en" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "05/10/2026" }));
    expect(screen.getByText("🎃 Oct 2026")).toBeTruthy();
    const labels = [...document.querySelectorAll(".hub-date-picker-dow span")].map((el) => el.textContent);
    expect(labels[0]?.toLowerCase()).toBe("mo");
    expect(labels[6]?.toLowerCase()).toBe("su");
    const dayOne = screen.getByRole("button", { name: "1" });
    expect(dayOne.className).not.toContain("hub-date-picker-day--selected");
    expect(screen.getByRole("button", { name: "5" }).className).toContain("hub-date-picker-day--selected");
  });

  it("emits today's local calendar day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15, 12));
    const onChange = vi.fn();
    render(<HubFilterDatePicker value="" onChange={onChange} placeholder="Select due date" locale="en" />);

    fireEvent.click(screen.getByRole("button", { name: "Select due date" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-15");
  });
});
