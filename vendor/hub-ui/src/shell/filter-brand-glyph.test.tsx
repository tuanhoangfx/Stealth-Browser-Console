import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterBar } from "./FilterBar";
import { HubDirectoryBrandNameCell } from "./HubDirectoryBrandNameCell";
import { HUB_BRAND_ICON_BARE_CLASS, hubBrandIconImgClass, hubDirectoryTableBrandImgClass } from "./filter-dropdown-primitives";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../styles");

describe("filter brand glyph SSOT", () => {
  it("maps bare shell to hub-brand-icon-bare", () => {
    expect(hubBrandIconImgClass("bare")).toBe(HUB_BRAND_ICON_BARE_CLASS);
    expect(hubDirectoryTableBrandImgClass("bare")).toBe(HUB_BRAND_ICON_BARE_CLASS);
    expect(HUB_BRAND_ICON_BARE_CLASS).toBe("hub-brand-icon-bare");
  });

  it("directory table brand class is always bare (no filter tile / dark-ink chrome)", () => {
    expect(hubDirectoryTableBrandImgClass("bare")).toBe(HUB_BRAND_ICON_BARE_CLASS);
    expect(hubDirectoryTableBrandImgClass("tile")).toBe(HUB_BRAND_ICON_BARE_CLASS);
    expect(hubDirectoryTableBrandImgClass("darkInk")).toBe(HUB_BRAND_ICON_BARE_CLASS);
  });

  it("bare CSS keeps native logo shape (no circular crop)", () => {
    const css = readFileSync(join(stylesDir, "hub-brand-icon-bare.css"), "utf8");
    expect(css).toContain("object-fit: contain");
    expect(css).not.toMatch(/border-radius:\s*9999px/);
    expect(css).not.toContain("object-fit: cover");
  });

  it("aligns bare brand img and emoji fallback glyph slots in filter rows", () => {
    render(
      <FilterBar
        hideSearch
        query=""
        onQueryChange={() => {}}
        values={{}}
        onValuesChange={() => {}}
        filters={[
          {
            key: "product_name",
            label: "Product",
            options: [
              {
                value: "claude",
                label: "Claude Team Standard",
                iconSrc: "/assets/brand-icons/claude.png",
                iconShell: "bare",
              },
              {
                value: "ios",
                label: "iOS Clone App 3y",
                emoji: "⭕",
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /product/i }));

    const panel = document.querySelector("[data-hub-multi-filter-panel]");
    expect(panel).toBeTruthy();

    const bareImg = panel!.querySelector(`img.${HUB_BRAND_ICON_BARE_CLASS}`);
    expect(bareImg).toBeTruthy();
    expect(bareImg!.className).toContain(HUB_BRAND_ICON_BARE_CLASS);

    const emoji = panel!.querySelector(".hub-filter-option-emoji");
    expect(emoji?.textContent).toBe("⭕");

    const bareSlot = bareImg?.parentElement as HTMLElement | null;
    const emojiSlot = emoji?.parentElement as HTMLElement | null;
    expect(bareSlot?.style.width).toBeTruthy();
    expect(bareSlot?.style.width).toBe(emojiSlot?.style.width);
    expect(bareSlot?.style.height).toBe(emojiSlot?.style.height);
  });

  it("directory table brandId cell uses same bare SSOT class as filter", () => {
    render(<HubDirectoryBrandNameCell label="Claude Team Standard" brandId="claude" />);
    const img = document.querySelector(`img.${HUB_BRAND_ICON_BARE_CLASS}`);
    expect(img).toBeTruthy();
    expect(img!.className).toContain(HUB_BRAND_ICON_BARE_CLASS);
    expect(img!.className).not.toContain("hub-chrome-brand-icon--tile");
  });

  it("directory table custom imageSrc bare shell matches filter bare class", () => {
    render(
      <HubDirectoryBrandNameCell
        label="iOS Clone App 3y"
        imageSrc="/assets/brand-icons/claude.png"
        imageShell="bare"
      />,
    );
    const img = document.querySelector(`img.${HUB_BRAND_ICON_BARE_CLASS}`);
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toContain("claude.png");
    expect(img!.className).toBe(HUB_BRAND_ICON_BARE_CLASS);
  });
});
