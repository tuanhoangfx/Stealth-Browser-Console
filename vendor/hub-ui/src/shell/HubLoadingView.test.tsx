import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Activity } from "lucide-react";
import { HubLoadingView } from "./HubLoadingView";
import { HUB_TAB_LOADER_ROOT_ID } from "../loading/hub-loader-dom";

describe("HubLoadingView", () => {
  it("renders loader into portal root when enabled", () => {
    const root = document.createElement("div");
    root.id = HUB_TAB_LOADER_ROOT_ID;
    document.body.appendChild(root);

    render(<HubLoadingView icon={Activity} ariaLabel="Loading test" variant="overlay" enabled />);

    expect(root.querySelector('[role="status"]')).not.toBeNull();
    root.remove();
  });

  it("does not portal overlay when enabled is false", () => {
    const root = document.createElement("div");
    root.id = HUB_TAB_LOADER_ROOT_ID;
    document.body.appendChild(root);

    render(<HubLoadingView icon={Activity} ariaLabel="Loading test" variant="overlay" enabled={false} />);

    expect(root.querySelector('[role="status"]')).toBeNull();
    root.remove();
  });

  it("renders inline when portaled is false", () => {
    const root = document.createElement("div");
    root.id = HUB_TAB_LOADER_ROOT_ID;
    document.body.appendChild(root);

    render(
      <div className="relative min-h-[8rem]">
        <HubLoadingView icon={Activity} ariaLabel="Loading inline" variant="overlay" portaled={false} />
      </div>,
    );

    expect(root.querySelector('[role="status"]')).toBeNull();
    expect(screen.getByRole("status", { name: "Loading inline" })).toHaveClass("hub-tab-loader-inline");
    root.remove();
  });
});
