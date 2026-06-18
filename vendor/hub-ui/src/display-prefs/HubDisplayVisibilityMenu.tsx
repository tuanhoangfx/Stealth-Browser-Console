import { useEffect, useRef, useState, type ComponentType } from "react";
import { ChevronDown } from "lucide-react";
import { buildSemanticTocIcon } from "../lib/semantic-icon-registry";
import { compactIconSize } from "../ui-scale";
import { ToggleRow } from "./primitives";
import type { PrefItem } from "./types";
import { countVisiblePrefs, defaultsForPrefItems, isHubPrefVisible } from "./hub-display-visibility";

export type HubDisplayVisibilityMenuProps = {
  label: string;
  iconKey: "settings.kpi" | "settings.charts" | "settings.headerStats";
  items: PrefItem[];
  visibleSet: Set<string> | null;
  defaultKeys?: Set<string>;
  maxVisible?: number;
  onToggle: (key: string) => void;
  onCapReached?: () => void;
};

/** Toolbar dropdown — toggle visible KPI / chart / header-stat keys (golden next to page size). */
export function HubDisplayVisibilityMenu({
  label,
  iconKey,
  items,
  visibleSet,
  defaultKeys,
  maxVisible,
  onToggle,
  onCapReached,
}: HubDisplayVisibilityMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const defaults = defaultsForPrefItems(items, defaultKeys);
  const visibleCount = countVisiblePrefs(items, visibleSet, defaults);
  const atMax = maxVisible != null && visibleCount >= maxVisible;
  const icon = buildSemanticTocIcon(iconKey);
  const isCustom = visibleSet !== null;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-[var(--hub-control-h)] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
          isCustom
            ? "border-violet-500/35 bg-violet-500/10 text-violet-200"
            : "border-white/10 bg-[var(--panel-2)] text-[var(--text)] hover:bg-white/5"
        }`}
        title={`${label} visibility`}
      >
        {icon ? <span className="grid h-3.5 w-3.5 shrink-0 place-items-center [&>svg]:h-3 [&>svg]:w-3">{icon}</span> : null}
        <span>
          {label} {visibleCount}/{maxVisible ?? items.length}
        </span>
        <ChevronDown size={compactIconSize(12)} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="anim-pop absolute right-0 top-full z-30 mt-1 max-h-[min(60vh,16rem)] min-w-[12.5rem] overflow-y-auto rounded-xl border border-white/10 bg-[var(--panel)] p-1 shadow-xl shadow-black/40">
          {items.map((item) => {
            const selected = isHubPrefVisible(visibleSet, defaults, item.key);
            return (
              <ToggleRow
                key={item.key}
                label={item.label}
                on={selected}
                disabled={atMax && !selected}
                onDisabledClick={onCapReached}
                onChange={() => onToggle(item.key)}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
