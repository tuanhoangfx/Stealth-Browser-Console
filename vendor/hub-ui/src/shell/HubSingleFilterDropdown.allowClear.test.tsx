import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HubSingleFilterDropdown } from "./FilterBar";

afterEach(() => cleanup());

describe("HubSingleFilterDropdown allowClear", () => {
  it("shows Clear beside search only when value is set", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <HubSingleFilterDropdown
        filterKey="plan-package"
        label="Plan Package"
        options={[{ value: "Claude Team Pro", label: "Claude Team Pro" }]}
        value="Claude Team Pro"
        onChange={onChange}
        allowClear
        usePortal={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Plan Package" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith("");

    rerender(
      <HubSingleFilterDropdown
        filterKey="plan-package"
        label="Plan Package"
        options={[{ value: "Claude Team Pro", label: "Claude Team Pro" }]}
        value=""
        onChange={onChange}
        allowClear
        usePortal={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Plan Package" }));
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("hides Clear when allowClear is false", () => {
    render(
      <HubSingleFilterDropdown
        filterKey="plan-package"
        label="Plan Package"
        options={[{ value: "Claude Team Pro", label: "Claude Team Pro" }]}
        value="Claude Team Pro"
        onChange={() => {}}
        usePortal={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Plan Package" }));
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});
