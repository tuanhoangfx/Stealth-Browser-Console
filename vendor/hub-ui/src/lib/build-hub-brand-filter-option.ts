import type { FilterOption } from "../shell/FilterBar";
import type { HubBrandIconShell } from "../shell/filter-dropdown-primitives";

export type HubBrandFilterIcon = {
  src: string;
  shell?: HubBrandIconShell;
  label?: string;
};

/** Filter dropdown row — brand icon (14px) + label + count (P0020 Services SSOT). */
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
      : {}),
  };
}
