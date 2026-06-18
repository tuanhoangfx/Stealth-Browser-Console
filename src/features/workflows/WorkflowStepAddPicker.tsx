import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search } from "lucide-react";
import {
  HUB_FILTER_DROPDOWN_LIST_CLASS,
  HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS,
  HUB_FILTER_DROPDOWN_ROW_CLASS,
  HubBulkActionButton,
  compactIconSize,
} from "@tool-workspace/hub-ui";
import type { ScriptStepKind } from "../../types";
import {
  catalogCategoryLabel,
  filterScriptStepCatalog,
  type ScriptStepCatalogEntry,
} from "./script-step-catalog";
import type { ScriptStepCategoryKey } from "./workflow-defaults";

export type WorkflowStepAddPickerProps = {
  onAdd: (kind: ScriptStepKind) => void;
};

function groupByCategory(entries: ScriptStepCatalogEntry[]) {
  const order: ScriptStepCategoryKey[] = ["page", "interact", "capture", "logic"];
  const map = new Map<ScriptStepCategoryKey, ScriptStepCatalogEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.category) ?? [];
    list.push(entry);
    map.set(entry.category, list);
  }
  return order
    .map((cat) => ({ cat, items: map.get(cat) ?? [] }))
    .filter((group) => group.items.length > 0);
}

export function WorkflowStepAddPicker({ onAdd }: WorkflowStepAddPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 352 });
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 352),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if ((event.target as Element).closest?.("[data-workflow-step-add-panel]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => filterScriptStepCatalog(search), [search]);
  const groups = useMemo(() => groupByCategory(filtered), [filtered]);

  function pick(kind: ScriptStepKind) {
    onAdd(kind);
    setOpen(false);
  }

  const panel =
    open &&
    createPortal(
      <div
        data-workflow-step-add-panel
        className={`${HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS} workflow-step-add-picker__panel`}
        style={{
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
          zIndex: 2600,
        }}
        role="listbox"
        aria-label="Add workflow step"
      >
        <div className="border-b border-white/5 p-2">
          <div className="relative">
            <Search
              size={compactIconSize(12)}
              className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[var(--muted)]"
              aria-hidden
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search steps…"
              className="hub-input w-full text-xs"
              style={{ paddingLeft: 25, paddingTop: 4, paddingBottom: 4 }}
              autoFocus
            />
          </div>
        </div>

        <div className={`${HUB_FILTER_DROPDOWN_LIST_CLASS} workflow-step-add-picker__list`}>
          {groups.map(({ cat, items }) => (
            <div key={cat} className="workflow-step-add-picker__group">
              <div className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                {catalogCategoryLabel(cat)}
              </div>
              {items.map((entry) => (
                <button
                  key={entry.kind}
                  type="button"
                  className={`${HUB_FILTER_DROPDOWN_ROW_CLASS} workflow-step-add-picker__row`}
                  onClick={() => pick(entry.kind)}
                >
                  <span className="workflow-step-add-picker__icon" aria-hidden>
                    <entry.Icon size={compactIconSize(14)} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">{entry.label}</span>
                    <span className="block text-[11px] font-normal leading-snug text-[var(--muted)]">
                      {entry.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-[var(--muted)]">No matching steps</div>
          ) : null}
        </div>
      </div>,
      document.body,
    );

  return (
    <div ref={ref} className="workflow-step-add-picker relative">
      <div ref={triggerRef} className="workflow-step-add-picker__trigger inline-flex">
        <HubBulkActionButton
          icon={<Plus size={14} aria-hidden />}
          label="New"
          title="Add workflow step"
          tone="emerald"
          onClick={() => setOpen((value) => !value)}
        />
      </div>
      {panel}
    </div>
  );
}
