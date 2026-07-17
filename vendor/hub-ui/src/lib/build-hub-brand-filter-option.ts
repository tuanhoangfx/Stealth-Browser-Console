import type { FilterOption } from "../shell/FilterBar";
import type { HubBrandIconShell } from "../shell/filter-dropdown-primitives";
import { HUB_DIRECTORY_BRAND_EMPTY_GLYPH } from "./resolve-hub-brand-icon";

export type HubBrandFilterIcon = {
  src: string;
  shell?: HubBrandIconShell;
  /** Optional display override — omit for product/service facets (label = value). */
  label?: string;
};

/**
 * Icon-only brand payload for directory filters — **no** company `label`.
 * Use with `buildHubBrandFilterOption(value, count, hubBrandFilterIcon(hit))`
 * so facet text stays the storage/product key (ChatGPT), not registry company (OpenAI).
 */
export function hubBrandFilterIcon(
  brand: { src: string; shell?: HubBrandIconShell } | null | undefined,
): HubBrandFilterIcon | null {
  if (!brand?.src) return null;
  return { src: brand.src, shell: brand.shell ?? "bare" };
}

/**
 * Filter dropdown row — brand icon (directory 16px / filter 13px) + label + count (P0020 Services SSOT).
 *
 * **Facet label contract:** pass `hubBrandFilterIcon(hit)` (or `{ src, shell }` only) for
 * product/service facets so `label` defaults to `value`. Do **not** pass hub registry
 * `brand.label` (company name) — e.g. ChatGPT rows must show "ChatGPT", not "OpenAI".
 * Pass `label` only when the display string is intentionally different from `value`
 * (formatted platform id, i18n, etc.).
 */
export function buildHubBrandFilterOption(
  value: string,
  count: number,
  brand: HubBrandFilterIcon | null | undefined,
  resolveSrc: (src: string) => string = (s) => s,
): FilterOption {
  return {
    value,
    label: brand?.label ?? value,
    count,
    ...(brand?.src
      ? { iconSrc: resolveSrc(brand.src), iconShell: brand.shell ?? "bare" }
      : { emoji: HUB_DIRECTORY_BRAND_EMPTY_GLYPH }),
  };
}
