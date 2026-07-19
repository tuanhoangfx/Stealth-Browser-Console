import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HubDirectoryAdaptiveEditAction } from "./HubDirectoryAdaptiveEditAction";

describe("HubDirectoryAdaptiveEditAction", () => {
  afterEach(() => cleanup());

  it("is disabled at zero selection", () => {
    const onSingle = vi.fn();
    const onBulk = vi.fn();
    render(
      <HubDirectoryAdaptiveEditAction selectedCount={0} onEditSingle={onSingle} onEditBulk={onBulk} />,
    );
    const button = screen.getByRole("button", { name: "Edit" });
    expect(button).toHaveProperty("disabled", true);
  });

  it("routes to single edit when selectedCount is one", () => {
    const onSingle = vi.fn();
    const onBulk = vi.fn();
    render(
      <HubDirectoryAdaptiveEditAction selectedCount={1} onEditSingle={onSingle} onEditBulk={onBulk} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
    expect(onSingle).toHaveBeenCalledOnce();
    expect(onBulk).not.toHaveBeenCalled();
  });

  it("switches to bulk edit mode for multi-select", () => {
    const onSingle = vi.fn();
    const onBulk = vi.fn();
    render(
      <HubDirectoryAdaptiveEditAction selectedCount={3} onEditSingle={onSingle} onEditBulk={onBulk} />,
    );
    const button = screen.getByRole("button", { name: /^Bulk Edit/ });
    fireEvent.click(button);
    expect(onBulk).toHaveBeenCalledOnce();
    expect(onSingle).not.toHaveBeenCalled();
  });
});
