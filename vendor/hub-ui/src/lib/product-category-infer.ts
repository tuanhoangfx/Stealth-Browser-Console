/**
 * SSOT — infer a product's shared service/category from its SKU name.
 * Brand-icon registry match + plan/duration suffix strip. Canonical home so CRM Usage
 * matching (P0020) and the product catalog (P0005 via @tool-workspace/product-category)
 * share one implementation.
 */
import { resolveHubBrandIconByMatch } from "./resolve-hub-brand-icon";

/** Plan/duration suffix tokens stripped before category inference. */
export const PRODUCT_PLAN_SUFFIX_PATTERNS: RegExp[] = [
  /\s+lifetime$/i,
  /\s+life[-\s]?time$/i,
  /\s+permanent$/i,
  /\s+vĩnh\s*viễn$/i,
  /\s+vinh\s*vien$/i,
  /\s+trọn\s*đời$/i,
  /\s+tron\s*doi$/i,
  /\s+vip\s+\d+$/i,
  /\s+(?:\d+\s*)?(?:years?|yrs?|yr|y)$/i,
  /\s+(?:\d+\s*)?(?:months?|mos?|mo|m)$/i,
  /\s+(?:\d+\s*)?(?:weeks?|wks?|wk|w)$/i,
  /\s+(?:\d+\s*)?(?:days?|d)$/i,
  /\s+\d+x$/i,
  /\s+(?:monthly|yearly|annual|quarterly|weekly|daily)$/i,
  /\s+(?:standard|premium|basic|enterprise|business|starter)$/i,
  /\s+(?:pro|plus|team|max)$/i,
];

/**
 * Plan duration rule (SSOT). Derives subscription length in days from the product
 * name suffix — shared by P0005 CRM (Duration / Day-left / Sample) and P0020 service plans.
 *
 * `trial` → 3 · `lifetime/permanent/vĩnh viễn` → 10000 ·
 * `Ny` → N×365 · `Nm` → N×30 · `Nw` → N×7 · `Nd` → N.
 */
export function parseProductPlanDurationDays(productName: string): number | null {
  const name = String(productName ?? "").trim();
  if (!name) return null;
  if (/\b(?:trial)\b/i.test(name)) return 3;
  if (/\b(?:lifetime|permanent|vĩnh\s*viễn|vinh\s*vien|trọn\s*đời|tron\s*doi)\b/i.test(name)) {
    return 10000;
  }

  const year = name.match(/(?:^|[\s(])(\d+)\s*(?:years?|yrs?|yr|y)(?:\s|$|[),])/i);
  if (year) return Number(year[1]) * 365;

  const month = name.match(/(?:^|[\s(])(\d+)\s*(?:months?|mos?|mo|m)(?:\s|$|[),])/i);
  if (month) return Number(month[1]) * 30;

  const week = name.match(/(?:^|[\s(])(\d+)\s*(?:weeks?|wks?|wk|w)(?:\s|$|[),])/i);
  if (week) return Number(week[1]) * 7;

  const day = name.match(/(?:^|[\s(])(\d+)\s*(?:days?|d)(?:\s|$|[),])/i);
  if (day) return Number(day[1]);

  return null;
}

/** Strip plan/duration suffixes — Auto Render Lifetime → Auto Render. */
export function stripProductPlanSuffix(productName: string): string {
  let base = productName.trim();
  if (!base) return "";

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of PRODUCT_PLAN_SUFFIX_PATTERNS) {
      const next = base.replace(pattern, "").trim();
      if (next && next !== base) {
        base = next;
        changed = true;
      }
    }
  }
  return base;
}

/** Infer shared category from SKU name (brand SSOT + plan suffix strip). */
export function inferProductCategory(productName: string): { groupKey: string; groupLabel: string } {
  const name = productName.trim();
  if (!name) return { groupKey: "", groupLabel: "" };

  const brandFull = resolveHubBrandIconByMatch(name);
  if (brandFull && brandFull.label.toLowerCase() !== name.toLowerCase()) {
    return { groupKey: brandFull.id, groupLabel: brandFull.label };
  }

  const base = stripProductPlanSuffix(name);
  const brandBase = resolveHubBrandIconByMatch(base);
  if (brandBase) {
    return { groupKey: brandBase.id, groupLabel: brandBase.label };
  }

  const label = base || name;
  return { groupKey: label.toLowerCase(), groupLabel: label };
}

/** @deprecated alias — use inferProductCategory */
export function resolveProductPlatformGroup(productName: string): { groupKey: string; groupLabel: string } {
  return inferProductCategory(productName);
}
