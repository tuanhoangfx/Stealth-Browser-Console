import { formatHubOrderPricePillLabel } from "../lib/format-order-price";
import {
  HUB_ORDER_PRICE_TEXT_CLASS,
  HUB_ORDER_PRICE_TEXT_DEFAULT_TONE,
  type HubOrderPriceTextTone,
} from "./hub-order-price-badge";

export type HubOrderPriceBadgeProps = {
  amountCents: number | null | undefined;
  currency?: string;
  tone?: HubOrderPriceTextTone;
  className?: string;
};

/** @deprecated use HubOrderPriceTextTone */
export type { HubOrderPriceTextTone as HubOrderPriceBadgeTone };

/**
 * Orders directory Price — colored tabular text only (no pill).
 * Returns null when amount is missing; caller renders DirectoryEmptyDash.
 */
export function HubOrderPriceBadge({
  amountCents,
  currency = "VND",
  tone = HUB_ORDER_PRICE_TEXT_DEFAULT_TONE,
  className = "",
}: HubOrderPriceBadgeProps) {
  const label = formatHubOrderPricePillLabel(amountCents, currency);
  if (!label) return null;

  return (
    <span
      className={[
        HUB_ORDER_PRICE_TEXT_CLASS,
        `${HUB_ORDER_PRICE_TEXT_CLASS}--${tone}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </span>
  );
}

/** Preferred export name — same component, text-only Price display. */
export const HubOrderPriceText = HubOrderPriceBadge;
