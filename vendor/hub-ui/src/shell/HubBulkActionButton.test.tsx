/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pencil } from "lucide-react";
import { HUB_BULK_ACTION_BTN_CLASS, HubBulkActionButton } from "./HubBulkActionButton";

describe("HubBulkActionButton", () => {
  it("keeps disabled icons visible — no whole-button opacity class", () => {
    expect(HUB_BULK_ACTION_BTN_CLASS).not.toMatch(/disabled:opacity-/);
  });

  it("renders Lucide icon paths when disabled", () => {
    const { container } = render(
      <HubBulkActionButton
        icon={<Pencil size={14} aria-hidden />}
        label="Edit"
        title="Edit selected"
        tone="indigo"
        disabled
        onClick={() => {}}
      />,
    );
    const btn = container.querySelector("button");
    expect(btn?.disabled).toBe(true);
    expect(btn?.className).not.toMatch(/opacity-40/);
    expect(container.querySelectorAll("svg path").length).toBeGreaterThan(0);
  });
});
