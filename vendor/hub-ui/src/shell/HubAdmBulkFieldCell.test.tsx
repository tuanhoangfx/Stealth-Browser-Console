import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HubAdmBulkFieldCell } from "./HubAdmBulkFieldCell";

describe("HubAdmBulkFieldCell", () => {
  afterEach(() => cleanup());

  it("renders apply/clear controls and body", () => {
    render(
      <HubAdmBulkFieldCell apply onApplyChange={() => {}} clear onClearChange={() => {}}>
        <input aria-label="bulk-value" />
      </HubAdmBulkFieldCell>,
    );
    expect(screen.getByRole("checkbox", { name: "Apply" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Clear" })).toBeTruthy();
    expect(screen.getByLabelText("bulk-value")).toBeTruthy();
  });

  it("calls handlers and disables clear when apply is off", () => {
    const onApplyChange = vi.fn();
    const onClearChange = vi.fn();
    render(
      <HubAdmBulkFieldCell
        apply={false}
        onApplyChange={onApplyChange}
        clear={false}
        onClearChange={onClearChange}
      >
        <span>body</span>
      </HubAdmBulkFieldCell>,
    );

    const apply = screen.getByRole("checkbox", { name: "Apply" });
    const clear = screen.getByRole("checkbox", { name: "Clear" });
    expect(clear).toHaveProperty("disabled", true);
    fireEvent.click(apply);
    expect(onApplyChange).toHaveBeenCalledOnce();
  });
});
