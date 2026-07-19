import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HubAdmClickEditField } from "./HubAdmClickEditField";

const header = { label: "Service", colClass: "", role: "service" as const, headerAlign: "start" as const };

describe("HubAdmClickEditField", () => {
  afterEach(() => cleanup());

  it("opens editor on click when enabled", () => {
    render(
      <HubAdmClickEditField header={header} fieldLabel="Service" value="Gmail" onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Service" }));
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("does not open editor when disabled", () => {
    const onChange = vi.fn();
    render(
      <HubAdmClickEditField
        header={header}
        fieldLabel="Service"
        value="Gmail"
        onChange={onChange}
        disabled
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit Service" })).toBeNull();
    expect(screen.getByText("Gmail")).toBeTruthy();
    const shell = document.querySelector(".hub-adm-click-edit--disabled");
    expect(shell).toBeTruthy();
    fireEvent.click(shell!);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
