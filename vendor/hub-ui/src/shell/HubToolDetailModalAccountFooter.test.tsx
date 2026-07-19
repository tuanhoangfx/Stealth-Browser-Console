import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Save } from "lucide-react";
import { HubToolDetailModalAccountFooter } from "./HubToolDetailModalAccountFooter";

describe("HubToolDetailModalAccountFooter", () => {
  afterEach(() => cleanup());

  it("renders Close and Save with golden labels", () => {
    render(<HubToolDetailModalAccountFooter onClose={() => {}} onSave={() => {}} saveIcon={Save} />);
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("shows Saving… while busy", () => {
    render(
      <HubToolDetailModalAccountFooter onClose={() => {}} onSave={() => {}} busy saveIcon={Save} />,
    );
    expect(screen.getByRole("button", { name: "Saving…" })).toBeTruthy();
    expect(document.querySelector(".hub-tool-detail-modal__confirm-icon--busy")).toBeTruthy();
    expect(document.querySelector(".hub-tool-detail-modal__confirm--busy")).toBeTruthy();
  });

  it("calls onSave and onClose", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<HubToolDetailModalAccountFooter onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
