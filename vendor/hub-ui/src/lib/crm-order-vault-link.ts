/**
 * CRM Order → P0020 Services vault id (Usage join SSOT).
 * Persist `order_desk_orders.twofa_account_id` — never a Mail hop / CRM entity id.
 */

import { inferProductCategory } from "./product-category-infer";
import {
  canonicalizeCrmOrderMailbox,
  countCrmOrderDetailMailboxes,
  crmOrderDetailMailboxOrder,
  crmOrderProductMatchesService,
  expandCrmOrderGmailAliases,
  extractCrmOrderDetailIdentityTokens,
  normalizeCrmOrderDetailsIdentifier,
} from "./crm-order-details";

export type CrmOrderVaultCandidate = {
  id: string;
  service: string;
  account: string;
  mailRecover?: string | null;
};

export type CrmOrderVaultLinkQuery = {
  productName?: string | null;
  details?: string | null;
  twofaAccountId?: string | null;
  twofaAccountIds?: readonly string[] | null;
};

/** Mail vault `service` labels — same family as P0020 Mail tab (not Services). */
export const CRM_ORDER_MAIL_VAULT_SERVICES = [
  "gmail",
  "google mail",
  "googlemail",
  "gmail edu",
  "outlook",
  "hotmail",
  "live",
  "msn",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud",
  "icloud.com",
  "temp mail",
] as const;

export function isCrmOrderMailVaultService(service: string | null | undefined): boolean {
  const n = normalizeCrmOrderDetailsIdentifier(service ?? "");
  if (!n) return false;
  return CRM_ORDER_MAIL_VAULT_SERVICES.some((label) => n === label || n.startsWith(`${label} `));
}

export function crmOrderProductIsMailSku(productName: string | null | undefined): boolean {
  const product = productName?.trim() ?? "";
  if (!product) return false;
  if (inferProductCategory(product).groupKey === "acc gmail") return true;
  return CRM_ORDER_MAIL_VAULT_SERVICES.some((label) => crmOrderProductMatchesService(product, label));
}

/**
 * P0020 Mail Usage SSOT — only Acc Gmail seat SKUs (`Acc Gmail #1`, `#2`, `#3 1m`, …).
 * Not Acc Gmail Edu / bare Acc Gmail 1m without `#N`.
 */
export function crmOrderProductIsAccGmailSeatSku(productName: string | null | undefined): boolean {
  const product = productName?.trim() ?? "";
  if (!product) return false;
  return /^acc\s*gmail\s*#\s*\d+/i.test(product);
}

export function crmOrderVaultCandidateEligible(
  productName: string | null | undefined,
  row: Pick<CrmOrderVaultCandidate, "service">,
): boolean {
  if (!crmOrderProductMatchesService(productName, row.service)) return false;
  const mailVault = isCrmOrderMailVaultService(row.service);
  const mailSku = crmOrderProductIsMailSku(productName);
  if (mailVault !== mailSku) return false;
  return true;
}

export function crmOrderVaultCandidateIdentityHits(
  details: string | null | undefined,
  row: Pick<CrmOrderVaultCandidate, "account" | "mailRecover">,
): boolean {
  const text = details ?? "";
  const tokens = new Set(extractCrmOrderDetailIdentityTokens(text));
  const haystack = normalizeCrmOrderDetailsIdentifier(text);
  const hitsIdentity = (raw: string) => {
    const aliases = expandCrmOrderGmailAliases(raw).filter((alias) => alias.length >= 3);
    if (aliases.some((alias) => tokens.has(alias))) return true;
    // Non-email shop / profile Account (Kalowave) may only appear as a bare Details line.
    return aliases.some((alias) => !alias.includes("@") && haystack.includes(alias));
  };
  if (hitsIdentity(row.account ?? "")) return true;
  if (hitsIdentity(row.mailRecover ?? "")) return true;
  return false;
}

function pushCrmOrderVaultId(out: Set<string>, raw: unknown): void {
  if (typeof raw !== "string") return;
  const id = raw.trim();
  if (id) out.add(id);
}

/** All persisted Services vault ids (array + scalar + metadata). Email match stays the primary Usage index. */
export function readCrmOrderServicesVaultIds(row: {
  twofa_account_id?: string | null;
  twofa_account_ids?: readonly string[] | null;
  metadata?: Record<string, unknown> | null;
}): string[] {
  const out = new Set<string>();
  if (Array.isArray(row.twofa_account_ids)) {
    for (const id of row.twofa_account_ids) pushCrmOrderVaultId(out, id);
  }
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : null;
  const metaIds = meta?.twofa_account_ids;
  if (Array.isArray(metaIds)) {
    for (const id of metaIds) pushCrmOrderVaultId(out, id);
  }
  pushCrmOrderVaultId(out, row.twofa_account_id);
  pushCrmOrderVaultId(out, meta?.twofa_account_id);
  pushCrmOrderVaultId(out, meta?.vault_id);
  pushCrmOrderVaultId(out, meta?.vaultId);
  return [...out];
}

export function sameCrmOrderVaultAccountIds(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((id, i) => id === b[i]);
}

/** Parse `#N` from product name (`Acc Gmail #2`, `ChatGPT Plus #2 1m` → 2). Single-seat → 0. */
export function crmOrderMultiSeatSlot(productName: string | null | undefined): number {
  const match = (productName ?? "").match(/#(\d+)\b/);
  const slot = match ? Number(match[1]) : 0;
  return Number.isFinite(slot) && slot >= 2 ? slot : 0;
}

/**
 * Hard seat cap from SKU only when `#N` is sold-seat count.
 * Acc Gmail #N → N. ChatGPT Plus #N is a package line — Details Account count wins (OI1809023).
 */
export function crmOrderSkuHardSeatCap(productName: string | null | undefined): number {
  const product = productName?.trim() ?? "";
  if (!product) return 0;
  if (/^acc\s*gmail\s*#\s*\d+/i.test(product)) return crmOrderMultiSeatSlot(product);
  return 0;
}

/** Target seat count for vault link / backfill: Acc Gmail hard-cap, else Details mailboxes. */
export function crmOrderServicesVaultSeatTarget(
  productName: string | null | undefined,
  details: string | null | undefined,
): number {
  const mailboxes = countCrmOrderDetailMailboxes(details ?? "");
  const hardCap = crmOrderSkuHardSeatCap(productName);
  if (hardCap >= 2) return mailboxes > 0 ? Math.min(hardCap, mailboxes) : hardCap;
  return mailboxes;
}

/** True when persisted Services ids are fewer than Details mailboxes (or Acc Gmail `#2+` still scalar-only). */
export function crmOrderNeedsServicesVaultBackfill(row: {
  product_name?: string | null;
  twofa_account_id?: string | null;
  twofa_account_ids?: readonly string[] | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  const details = typeof row.metadata?.raw_details === "string" ? row.metadata.raw_details : "";
  const persisted = readCrmOrderServicesVaultIds(row);
  const target = crmOrderServicesVaultSeatTarget(row.product_name, details);
  if (target < 2) return false;
  return persisted.length < target;
}

/**
 * Every eligible Services (or Mail SKU → Mail vault) hit — union, never pick-one-and-drop.
 * Keeps a still-eligible current link when it still identity-hits Details (Account or
 * mailRecover), or when no identity hit exists yet (Share seat / incomplete candidates).
 * Drops a stale link when Details uniquely identity-hit another Services vault
 * (CapCut Recover Mail rematch — OI1906008 / policy N orders → Usage N).
 * Does not hop Capcut-recipe → Gmail (OTP-only).
 */
export function resolveCrmOrderServicesVaultIds(
  order: CrmOrderVaultLinkQuery,
  candidates: readonly CrmOrderVaultCandidate[],
): string[] {
  const hits = candidates.filter(
    (row) =>
      crmOrderVaultCandidateEligible(order.productName, row) &&
      crmOrderVaultCandidateIdentityHits(order.details, row),
  );
  const ids = [...new Set(hits.map((row) => row.id))];
  const current = order.twofaAccountId?.trim() || "";
  if (current) {
    const currentRow = candidates.find((row) => row.id === current);
    if (currentRow && crmOrderVaultCandidateEligible(order.productName, currentRow)) {
      const currentStillHits = crmOrderVaultCandidateIdentityHits(order.details, currentRow);
      if (currentStillHits) {
        if (!ids.includes(current)) ids.unshift(current);
        else
          return capCrmOrderServicesVaultIds(order, candidates, [
            current,
            ...ids.filter((id) => id !== current),
          ]);
      } else if (ids.length === 0) {
        // No identity match in the candidate set — keep Share / incomplete token lookup.
        ids.unshift(current);
      }
      // else: stale current + ≥1 identity hit → prefer Details rematch (drop current).
    }
  }
  return capCrmOrderServicesVaultIds(order, candidates, ids);
}

/** One Services id per canonical mailbox; Acc Gmail `#N` hard-caps at N (no gmail/googlemail twin dump). */
export function capCrmOrderServicesVaultIds(
  order: CrmOrderVaultLinkQuery,
  candidates: readonly CrmOrderVaultCandidate[],
  ids: readonly string[],
): string[] {
  const byId = new Map(candidates.map((row) => [row.id, row]));
  const mailboxOf = (id: string): string => {
    const row = byId.get(id);
    return canonicalizeCrmOrderMailbox(row?.account || row?.mailRecover || "");
  };
  const details = order.details ?? "";
  const mailboxes = crmOrderDetailMailboxOrder(details);
  const hardCap = crmOrderSkuHardSeatCap(order.productName);
  // Bare shop / profile lines (Kalowave) are extra seats beside the login mailbox.
  // ChatGPT: Details Account count wins — `Plus #2` is package line, not seat cap (OI1809023).
  // Acc Gmail #N: hard-cap at N even when Details lists more mailboxes.
  const nonEmailIdentities = extractCrmOrderDetailIdentityTokens(details).filter(
    (token) => !token.includes("@"),
  ).length;
  const identitySeats = mailboxes.length + nonEmailIdentities;
  const limit =
    hardCap >= 2
      ? hardCap
      : identitySeats > 0
        ? identitySeats
        : ids.length;
  const picked: string[] = [];
  const seen = new Set<string>();
  const tryAdd = (id: string) => {
    if (!id || picked.includes(id) || picked.length >= Math.max(limit, 0)) return;
    const key = mailboxOf(id);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    picked.push(id);
  };
  for (const box of mailboxes) {
    const match = ids.find((id) => mailboxOf(id) === box);
    if (match) tryAdd(match);
  }
  for (const id of ids) tryAdd(id);
  return picked;
}

/** First of {@link resolveCrmOrderServicesVaultIds} — scalar `twofa_account_id`. */
export function resolveCrmOrderServicesVaultId(
  order: CrmOrderVaultLinkQuery,
  candidates: readonly CrmOrderVaultCandidate[],
): string | null {
  return resolveCrmOrderServicesVaultIds(order, candidates)[0] ?? null;
}
