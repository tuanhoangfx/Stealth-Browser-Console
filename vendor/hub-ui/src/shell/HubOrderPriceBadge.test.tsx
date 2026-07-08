import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubOrderPriceBadge } from "./HubOrderPriceBadge";
import {
  HUB_ORDER_PRICE_TEXT_CLASS,
  HUB_ORDER_PRICE_TEXT_DEFAULT_TONE,
} from "./hub-order-price-badge";

describe("HubOrderPriceBadge", () => {
  it("returns null for missing amount", () => {
    const { container } = render(<HubOrderPriceBadge amountCents={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders default amber money text without badge chrome", () => {
    const { container } = render(<HubOrderPriceBadge amountCents={22000} currency="VND" />);
    const node = container.querySelector("span");

    expect(node?.textContent).toBe("220 ₫");
    expect(node?.className).toContain(HUB_ORDER_PRICE_TEXT_CLASS);
    expect(node?.className).toContain(`${HUB_ORDER_PRICE_TEXT_CLASS}--${HUB_ORDER_PRICE_TEXT_DEFAULT_TONE}`);
    expect(node?.className).not.toMatch(/badge|pill|rounded/);
    expect(container).toMatchSnapshot();
  });

  it.each([
    [4_874_00, "VND", "4.874 ₫"],
    [125_000_000, "VND", "1.250.000 ₫"],
    [1999, "USD", "$19.99"],
  ])("formats amount %i %s as %s", (amountCents, currency, label) => {
    const { container } = render(
      <HubOrderPriceBadge amountCents={amountCents} currency={currency} />,
    );
    expect(container.textContent).toBe(label);
  });

  it("supports explicit tone override", () => {
    const { container } = render(
      <HubOrderPriceBadge amountCents={1000} currency="USD" tone="indigo" />,
    );
    expect(container.querySelector("span")?.className).toContain(`${HUB_ORDER_PRICE_TEXT_CLASS}--indigo`);
  });
});
