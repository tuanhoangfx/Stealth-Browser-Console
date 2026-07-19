import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubAccountDetailHeaderSearch } from "./HubAccountDetailHeaderSearch";
import { HubAccountDetailSearchProvider } from "./hubAccountDetailSearch";

describe("HubAccountDetailHeaderSearch", () => {
  it("focuses the modal search when F is pressed", () => {
    render(
      <HubAccountDetailSearchProvider>
        <HubAccountDetailHeaderSearch />
      </HubAccountDetailSearchProvider>,
    );

    const input = screen.getByRole("searchbox", { name: "Search credentials, note, log…" });
    expect(input.getAttribute("data-hub-modal-search")).toBe("");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));

    expect(document.activeElement).toBe(input);
  });
});
