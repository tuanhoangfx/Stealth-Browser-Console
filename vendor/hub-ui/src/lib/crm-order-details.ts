/** SSOT — parse CRM Order Details (`metadata.raw_details`) for credential matching. */

import { inferProductCategory, stripProductPlanSuffix } from "./product-category-infer";

export const CRM_ORDER_DETAILS_EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export type CrmOrderDetailsMirrorRow = {
  id: string;
  product_name?: string | null;
  external_order_id?: string | null;
  /** CRM order status (🚦 sheet_status) — used to keep only completed orders in usage counts. */
  sheet_status?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** True when an order's sheet status is a "Completed" state (CRM Usage count gate). */
export function isCrmOrderCompletedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status.includes("Completed");
}

/**
 * True when an order's product resolves to the same service/category as an account's service.
 * Primary match uses the shared `inferProductCategory` SSOT (brand registry + plan-suffix strip);
 * falls back to a normalized substring match for labels with no brand-registry entry.
 */
export function crmOrderProductMatchesService(
  productName: string | null | undefined,
  service: string | null | undefined,
): boolean {
  const product = productName?.trim();
  const svc = service?.trim();
  if (!product || !svc) return false;

  const productKey = inferProductCategory(product).groupKey;
  const serviceKey = inferProductCategory(svc).groupKey;
  if (productKey && serviceKey && productKey === serviceKey) return true;

  const p = (stripProductPlanSuffix(product) || product).toLowerCase();
  const s = (stripProductPlanSuffix(svc) || svc).toLowerCase();
  return p.includes(s) || s.includes(p);
}

export function normalizeCrmOrderDetailsText(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function readCrmOrderDetailsFromRow(row: CrmOrderDetailsMirrorRow): string {
  return normalizeCrmOrderDetailsText(row.metadata?.raw_details);
}

export function normalizeCrmOrderDetailsIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function extractCrmOrderDetailEmails(text: string): string[] {
  const lower = text.toLowerCase();
  const matches = lower.match(CRM_ORDER_DETAILS_EMAIL_REGEX) ?? [];
  return [...new Set(matches.map(normalizeCrmOrderDetailsIdentifier))];
}

const CRM_ORDER_DETAIL_IDENTITY_PREFIXES = [
  "id :",
  "mail :",
  "account :",
] as const;

const CRM_ORDER_DETAIL_CREDENTIAL_PREFIXES = [
  ...CRM_ORDER_DETAIL_IDENTITY_PREFIXES,
  "pass :",
  "password :",
] as const;

/** Emails + ID / Mail / Account lines — account Usage SSOT (no password tokens). */
export function extractCrmOrderDetailIdentityTokens(text: string): string[] {
  const tokens = new Set(extractCrmOrderDetailEmails(text));
  const lower = text.toLowerCase();
  for (const prefix of CRM_ORDER_DETAIL_IDENTITY_PREFIXES) {
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(prefix, from);
      if (at < 0) break;
      const valueStart = at + prefix.length;
      const slice = text.slice(valueStart, valueStart + 160);
      const raw = slice.split(/\s+-\s+|\n|,|;|\|/)[0]?.trim() ?? "";
      const normalized = normalizeCrmOrderDetailsIdentifier(raw);
      if (normalized.length >= 3) tokens.add(normalized);
      from = valueStart + 1;
    }
  }
  return [...tokens];
}

/** @deprecated Prefer extractCrmOrderDetailIdentityTokens for CRM Usage — includes Pass lines. */
export function extractCrmOrderDetailCredentialTokens(text: string): string[] {
  const tokens = new Set(extractCrmOrderDetailIdentityTokens(text));
  const lower = text.toLowerCase();
  for (const prefix of CRM_ORDER_DETAIL_CREDENTIAL_PREFIXES) {
    if ((CRM_ORDER_DETAIL_IDENTITY_PREFIXES as readonly string[]).includes(prefix)) continue;
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(prefix, from);
      if (at < 0) break;
      const valueStart = at + prefix.length;
      const slice = text.slice(valueStart, valueStart + 160);
      const raw = slice.split(/\s+-\s+|\n|,|;|\|/)[0]?.trim() ?? "";
      const normalized = normalizeCrmOrderDetailsIdentifier(raw);
      if (normalized.length >= 3) tokens.add(normalized);
      from = valueStart + 1;
    }
  }
  return [...tokens];
}

export function countCrmOrderDetailMentions(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  let count = 0;
  let from = 0;
  while (from < haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

export function crmOrderDetailsSnippet(text: string, needle: string, maxLen = 88): string {
  if (!text) return "";
  const at = text.toLowerCase().indexOf(needle);
  if (at < 0 || text.length <= maxLen) return text.slice(0, maxLen);
  const start = Math.max(0, at - 20);
  const end = Math.min(text.length, start + maxLen);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}
