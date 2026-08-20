import type { ExtensionKindFilter } from "./extension-filters";

const SEARCH_MAX = 200;

export function readExtensionDirectoryFilterUrl(): {
  kinds: ExtensionKindFilter[];
  search: string;
} {
  if (typeof window === "undefined") return { kinds: [], search: "" };
  const sp = new URLSearchParams(window.location.search);
  const kinds = (sp.get("kind") ?? "")
    .split(",")
    .filter((value): value is ExtensionKindFilter => value === "store");
  const search = (sp.get("q") ?? "").slice(0, SEARCH_MAX);
  return { kinds, search };
}

export function writeExtensionDirectoryFilterUrl(kinds: ExtensionKindFilter[], search = ""): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (kinds.length) url.searchParams.set("kind", kinds.join(","));
  else url.searchParams.delete("kind");
  const q = search.trim().slice(0, SEARCH_MAX);
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== cur) window.history.replaceState(null, "", next);
}
