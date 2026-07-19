import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClipboardList } from "lucide-react";
import { HubToolDetailModalSecondaryAction } from "./HubToolDetailModal";

describe("HubToolDetailModalSecondaryAction", () => {
  afterEach(() => cleanup());

  it("applies accent tone modifier class", () => {
    const { container } = render(
      <HubToolDetailModalSecondaryAction
        label="View orders"
        icon={ClipboardList}
        tone="emerald"
        onClick={() => {}}
      />,
    );
    const btn = container.querySelector("button");
    expect(btn?.className).toContain("hub-tool-detail-modal__secondary--emerald");
    expect(screen.getByRole("button", { name: "View orders" })).toBeTruthy();
  });
});
