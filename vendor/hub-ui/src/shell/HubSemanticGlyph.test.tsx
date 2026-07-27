import { render } from "@testing-library/react";
import { MessageSquare } from "lucide-react";
import { describe, expect, it } from "vitest";
import { HubSemanticGlyph } from "./HubSemanticGlyph";
import { resolveHubBrandIcon, type HubBrandIconId } from "../lib/resolve-hub-brand-icon";

describe("HubSemanticGlyph brand fallback", () => {
  it("resolves channel brand ids (zalo / telegram / facebook)", () => {
    expect(resolveHubBrandIcon("zalo")?.src).toBeTruthy();
    expect(resolveHubBrandIcon("telegram")?.src).toBeTruthy();
    expect(resolveHubBrandIcon("facebook")?.src).toBeTruthy();
  });

  it("never renders icon-less when a brand id has a Lucide fallback (img OR svg)", () => {
    // jsdom cannot load images, so the brand <img> onError fires → Lucide fallback.
    // In a real browser the <img> loads; either way a glyph is always present.
    const { container } = render(
      <HubSemanticGlyph brandId="telegram" icon={MessageSquare} size={12} />,
    );
    expect(container.querySelector("img") || container.querySelector("svg")).toBeTruthy();
  });

  it("falls back to the Lucide icon when the brand id is unknown (never icon-less)", () => {
    const { container } = render(
      <HubSemanticGlyph brandId={"__missing__" as HubBrandIconId} icon={MessageSquare} size={12} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
