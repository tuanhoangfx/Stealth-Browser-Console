export type HubOrderPriceCurrency = string;

export type HubOrderPriceParts = {
  amount: string;
  currency: string;
  symbol: string;
  major: number;
  isUsd: boolean;
};

export function formatHubOrderPriceParts(
  amountCents: number | null | undefined,
  currency: HubOrderPriceCurrency = "VND",
): HubOrderPriceParts | null {
  if (amountCents == null) return null;
  const cur = (currency || "VND").toUpperCase();
  const major = amountCents / 100;
  const isUsd = cur === "USD";
  const amount = isUsd
    ? major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : major.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
  const symbol = isUsd ? "$" : "₫";
  return { amount, currency: cur, symbol, major, isUsd };
}

/** V2 pill label — VND `1.250.000 ₫`, USD `$20.00`. */
export function formatHubOrderPricePillLabel(
  amountCents: number | null | undefined,
  currency: HubOrderPriceCurrency = "VND",
): string {
  const parts = formatHubOrderPriceParts(amountCents, currency);
  if (!parts) return "";
  return parts.isUsd ? `${parts.symbol}${parts.amount}` : `${parts.amount} ₫`;
}
