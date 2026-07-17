import type { FilterDef } from "@tool-workspace/hub-ui";
import type { CachedStoreExtension } from "../../../types";

export const EXTENSION_KIND_FILTER_OPTIONS = [
  { value: "store", label: "Store" },
  { value: "local", label: "Local" },
] as const;

export type ExtensionKindFilter = (typeof EXTENSION_KIND_FILTER_OPTIONS)[number]["value"];

export function buildExtensionFilters(cached: CachedStoreExtension[]): FilterDef[] {
  const storeCount = cached.filter((ext) => ext.kind === "store").length;
  const localCount = cached.filter((ext) => ext.kind === "local").length;

  return [
    {
      key: "kind",
      label: "Kind",
      showAllLabel: true,
      totalCount: cached.length,
      options: EXTENSION_KIND_FILTER_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        count: option.value === "store" ? storeCount : localCount,
      })),
    },
  ];
}

export function extensionFilterValuesToState(values: Record<string, string[]>) {
  return (values.kind ?? []).filter(
    (value): value is ExtensionKindFilter => value === "store" || value === "local",
  );
}

export function extensionStateToFilterValues(kinds: ExtensionKindFilter[]) {
  return { kind: kinds };
}
