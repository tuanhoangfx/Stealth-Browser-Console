import type { FilterDef } from "@tool-workspace/hub-ui";
import type { CachedStoreExtension } from "../../../types";

export const EXTENSION_KIND_FILTER_OPTIONS = [
  { value: "store", label: "Store" },
] as const;

export type ExtensionKindFilter = (typeof EXTENSION_KIND_FILTER_OPTIONS)[number]["value"];

export function buildExtensionFilters(cached: CachedStoreExtension[]): FilterDef[] {
  const storeCount = cached.filter((ext) => ext.kind === "store").length;

  return [
    {
      key: "kind",
      label: "Kind",
      showAllLabel: false,
      totalCount: cached.length,
      options: EXTENSION_KIND_FILTER_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        count: storeCount,
      })),
    },
  ];
}

export function extensionFilterValuesToState(values: Record<string, string[]>) {
  return (values.kind ?? []).filter(
    (value): value is ExtensionKindFilter => value === "store",
  );
}

export function extensionStateToFilterValues(kinds: ExtensionKindFilter[]) {
  return { kind: kinds };
}
