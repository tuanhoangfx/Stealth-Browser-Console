import { Tag } from "lucide-react";
import type { TabHeaderMetaItem } from "./AppTabHeader";

/** Left meta: `v1.1.2 · 03/06/26` (P0004 Hub / P0020 workspace pattern). */
export function buildVersionMetaItems(
  versionLine: string,
  live?: boolean,
  extra: TabHeaderMetaItem[] = [],
): TabHeaderMetaItem[] {
  return [
    {
      icon: Tag,
      value: versionLine,
      live,
    },
    ...extra,
  ];
}
