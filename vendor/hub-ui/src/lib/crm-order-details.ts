/** SSOT — parse CRM Order Details (`metadata.raw_details`) for credential matching. */

import { inferProductCategory, stripProductPlanSuffix } from "./product-category-infer";

export const CRM_ORDER_DETAILS_EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export type CrmOrderDetailsMirrorRow = {
  id: string;
  product_name?: string | null;
  external_order_id?: string | null;
  /** CRM order status (🚦 order_status) — live Usage requires Completed; all other statuses are exceptions. */
  order_status?: string | null;
  /** Primary / first Services vault join (backward-compat scalar). */
  twofa_account_id?: string | null;
  /** All matching Services vault ids on a multi-account order. */
  twofa_account_ids?: readonly string[] | null;
  metadata?: Record<string, unknown> | null;
};

/** True when an order's sheet status is a "Completed" state (live Usage gate). */
export function isCrmOrderCompletedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status.includes("Completed");
}

/**
 * P0020 Usage only — Google Flow SKUs count on Google One vaults.
 * Catalog Products (P0005 Service / Filter) stay separate (`google-flow` ≠ `google-one`).
 */
const CRM_USAGE_EQUIVALENT_SERVICE_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["google-flow", "google-one"],
];

function crmUsageServiceKeysMatch(productKey: string, serviceKey: string): boolean {
  if (productKey && serviceKey && productKey === serviceKey) return true;
  for (const [a, b] of CRM_USAGE_EQUIVALENT_SERVICE_KEYS) {
    if ((productKey === a && serviceKey === b) || (productKey === b && serviceKey === a)) return true;
  }
  return false;
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
  if (crmUsageServiceKeysMatch(productKey, serviceKey)) return true;

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

/** True when Order Details can participate in CRM Usage (non-empty credentials text). */
export function crmOrderHasUsageDetails(row: CrmOrderDetailsMirrorRow): boolean {
  return Boolean(readCrmOrderDetailsFromRow(row));
}

export function normalizeCrmOrderDetailsIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Gmail mailbox aliases — `user@gmail.com` ≡ `user@googlemail.com`.
 * Index + lookup must emit both keys; mention-count must search both spellings.
 */
export function expandCrmOrderGmailAliases(identifier: string): string[] {
  const n = normalizeCrmOrderDetailsIdentifier(identifier);
  if (!n) return [];
  if (n.endsWith("@gmail.com")) return [n, `${n.slice(0, -"@gmail.com".length)}@googlemail.com`];
  if (n.endsWith("@googlemail.com")) return [n, `${n.slice(0, -"@googlemail.com".length)}@gmail.com`];
  return [n];
}

/** Canonical mailbox key — `user@googlemail.com` → `user@gmail.com`. */
export function canonicalizeCrmOrderMailbox(email: string): string {
  const n = normalizeCrmOrderDetailsIdentifier(email);
  return n.endsWith("@googlemail.com") ? `${n.slice(0, -"@googlemail.com".length)}@gmail.com` : n;
}

/** Unique mailboxes in Details order (gmail/googlemail collapsed). */
export function crmOrderDetailMailboxOrder(text: string): string[] {
  const matches = text.toLowerCase().match(CRM_ORDER_DETAILS_EMAIL_REGEX) ?? [];
  const out: string[] = [];
  for (const raw of matches) {
    const key = canonicalizeCrmOrderMailbox(raw);
    if (key.includes("@") && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Unique mailboxes in Order Details (gmail/googlemail collapsed). Not order count. */
export function countCrmOrderDetailMailboxes(text: string): number {
  return crmOrderDetailMailboxOrder(text).length;
}

export function extractCrmOrderDetailEmails(text: string): string[] {
  const lower = text.toLowerCase();
  const matches = lower.match(CRM_ORDER_DETAILS_EMAIL_REGEX) ?? [];
  return [...new Set(matches.flatMap((m) => expandCrmOrderGmailAliases(m)))];
}

const CRM_ORDER_DETAIL_IDENTITY_PREFIXES = [
  "id :",
  "mail :",
  "account :",
  "recover mail :",
  "recover :",
  "mail recover :",
] as const;

const CRM_ORDER_DETAIL_CREDENTIAL_PREFIXES = [
  ...CRM_ORDER_DETAIL_IDENTITY_PREFIXES,
  "pass :",
  "password :",
] as const;

const CRM_ORDER_DETAIL_SKIP_BARE_LINE =
  /^(account|mail|id|pass|password|secret|recover(?:\s+mail)?|mail\s+recover)\s*:/i;

/**
 * Bare shop / profile lines under Account credentials (Kalowave Boost etc.).
 * Example: `Blessed Care PH - PHPHLC9WLYKA` — not an email, still a Usage identity.
 */
export function extractCrmOrderDetailBareIdentityLines(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length < 3) continue;
    if (CRM_ORDER_DETAIL_SKIP_BARE_LINE.test(line)) continue;
    if (/\b(password|secret)\s*:/i.test(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;
    const normalized = normalizeCrmOrderDetailsIdentifier(line);
    if (normalized.length >= 3) out.push(normalized);
  }
  return [...new Set(out)];
}

/** Emails + ID / Mail / Account / Recover lines + bare shop lines — Usage SSOT. */
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
      if (normalized.length >= 3) {
        for (const alias of expandCrmOrderGmailAliases(normalized)) tokens.add(alias);
      }
      from = valueStart + 1;
    }
  }
  for (const bare of extractCrmOrderDetailBareIdentityLines(text)) tokens.add(bare);
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
  for (const token of expandCrmOrderGmailAliases(needle)) {
    let from = 0;
    while (from < haystack.length) {
      const at = haystack.indexOf(token, from);
      if (at < 0) break;
      count += 1;
      from = at + token.length;
    }
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
