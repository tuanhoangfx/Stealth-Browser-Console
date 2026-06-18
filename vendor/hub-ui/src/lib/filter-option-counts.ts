import type { FilterDef, FilterValues } from "../shell/FilterBar";

/** Faceted counts: apply query + all filters except the current filter key, then count per option. */
export function enrichFilterDefs<T>(
  items: T[],
  defs: FilterDef[],
  query: string,
  values: FilterValues,
  matches: (item: T, query: string, filters: FilterValues) => boolean,
  matchesOption: (item: T, filterKey: string, optionValue: string) => boolean,
): FilterDef[] {
  return defs.map((def) => {
    const other: FilterValues = { ...values };
    delete other[def.key];
    const base = items.filter((item) => matches(item, query, other));
    return {
      ...def,
      totalCount: base.length,
      options: def.options.map((opt) => ({
        ...opt,
        count: base.filter((item) => matchesOption(item, def.key, opt.value)).length,
      })),
    };
  });
}
