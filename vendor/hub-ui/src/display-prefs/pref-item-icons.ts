import type { DirectoryTableColumnItem } from "../prefs/directory-table-column-prefs";
import type { PrefIcon, PrefItem } from "./types";

export type PrefIconMeta = { icon?: PrefIcon; iconClassName?: string };
export type PrefIconMap = Record<string, PrefIconMeta>;

/** Attach per-key Lucide icons to KPI / header / filter pref rows (Display panel SSOT). */
export function withPrefItemIcons<T extends { key: string; label: string }>(
  items: readonly T[],
  icons: PrefIconMap,
): PrefItem[] {
  return items.map((item) => ({
    ...item,
    icon: icons[item.key]?.icon,
    iconClassName: icons[item.key]?.iconClassName,
  }));
}

/** Attach icons to directory table column toggles (Display → Table columns). */
export function withDirectoryColumnIcons<K extends string>(
  items: readonly DirectoryTableColumnItem<K>[],
  icons: PrefIconMap,
): DirectoryTableColumnItem<K>[] {
  return items.map((item) => ({
    ...item,
    icon: icons[item.key]?.icon,
    iconClassName: icons[item.key]?.iconClassName,
  }));
}
