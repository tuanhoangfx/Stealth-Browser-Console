import { useEffect, useState, type ReactNode } from "react";
import { ToggleRow } from "../display-prefs/primitives";
import type { DirectoryTableColumnItem, DirectoryTableColumnPrefs } from "./directory-table-column-prefs";

export type DirectoryTableColumnsSettingsProps<K extends string> = {
  items: readonly DirectoryTableColumnItem<K>[];
  prefs: DirectoryTableColumnPrefs<K>;
  /** Optional block above column toggles (e.g. Users password mask). */
  header?: ReactNode;
};

export function DirectoryTableColumnsSettings<K extends string>({
  items,
  prefs,
  header,
}: DirectoryTableColumnsSettingsProps<K>) {
  const [visible, setVisible] = useState<Set<K>>(() => prefs.read());

  useEffect(() => {
    const sync = () => setVisible(prefs.read());
    window.addEventListener(prefs.changeEvent, sync);
    return () => window.removeEventListener(prefs.changeEvent, sync);
  }, [prefs]);

  function toggle(key: K) {
    const item = items.find((c) => c.key === key);
    if (item?.required) return;
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    prefs.write(next);
    setVisible(next);
  }

  return (
    <div className={header ? "space-y-3" : undefined}>
      {header}
      <ul className="space-y-0.5">
        {items.map((col) => {
          const on = visible.has(col.key);
          return (
            <li key={col.key} className={col.required ? "opacity-80" : undefined}>
              <div className="flex items-center gap-2">
                <div className={col.required ? "pointer-events-none flex-1" : "flex-1"}>
                  <ToggleRow label={col.label} on={on} onChange={() => toggle(col.key)} />
                </div>
                {col.required ? (
                  <span className="shrink-0 pr-2 text-[9px] uppercase text-[var(--muted)]">Required</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
