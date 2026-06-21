#!/usr/bin/env node
/** Add usePortal=true to HubMultiFilterDropdown — escapes KPI band stacking. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const devRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const files = [
  path.join(devRoot, "packages/hub-ui/src/shell/FilterBar.tsx"),
  path.join(devRoot, "Tool/P0003-Stealth-Browser-Console/vendor/hub-ui/src/shell/FilterBar.tsx"),
  path.join(devRoot, "Tool/P0020-Data-Box/vendor/hub-ui/src/shell/FilterBar.tsx"),
  path.join(devRoot, "Tool/P0004-Tool-Hub/vendor/hub-ui/src/shell/FilterBar.tsx"),
].filter((f) => fs.existsSync(f));

const OLD_PROPS = `export type HubMultiFilterDropdownProps = {
  filter: FilterDef;
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
  /** \`label-value\` (default): \`Label: value\`. \`value\`: selected option label only. */
  triggerFormat?: "label-value" | "value";
  /** Native button title — assignee tooltip, etc. */
  triggerTitle?: string;
};`;

const NEW_PROPS = `export type HubMultiFilterDropdownProps = {
  filter: FilterDef;
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
  /** \`label-value\` (default): \`Label: value\`. \`value\`: selected option label only. */
  triggerFormat?: "label-value" | "value";
  /** Native button title — assignee tooltip, etc. */
  triggerTitle?: string;
  usePortal?: boolean;
};`;

const OLD_FN_START = `export function HubMultiFilterDropdown({
  filter,
  selected,
  onChange,
  className = "",
  triggerFormat = "label-value",
  triggerTitle,
}: HubMultiFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);`;

const NEW_FN_START = `export function HubMultiFilterDropdown({
  filter,
  selected,
  onChange,
  className = "",
  triggerFormat = "label-value",
  triggerTitle,
  usePortal = true,
}: HubMultiFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 288 });

  useLayoutEffect(() => {
    if (!open || !usePortal || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 288),
    });
  }, [open, usePortal]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (usePortal && (e.target as Element).closest?.("[data-hub-multi-filter-panel]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, usePortal]);`;

const OLD_PANEL = `      <button
        type="button"
        title={resolvedTriggerTitle}
        onClick={() => setOpen((v) => !v)}
        className={hubFilterTriggerClass(selected.length > 0)}
      >`;

const NEW_PANEL = `      <button
        ref={triggerRef}
        type="button"
        title={resolvedTriggerTitle}
        onClick={() => setOpen((v) => !v)}
        className={hubFilterTriggerClass(selected.length > 0)}
      >`;

const OLD_OPEN_BLOCK = `      {open ? (
        <div className={\`\${HUB_FILTER_DROPDOWN_PANEL_CLASS} absolute left-0 top-full z-30 mt-1\`}>
          <div className="border-b border-white/5 p-2">
            <div className="relative">
              <Search size={compactIconSize(12)} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={\`Search \${filter.label.toLowerCase()}...\`}
                className="field text-xs"
                style={{ paddingLeft: 25, paddingTop: 4, paddingBottom: 4 }}
                autoFocus
              />
            </div>
          </div>
          <div className={HUB_FILTER_DROPDOWN_LIST_CLASS}>
            <button
              type="button"
              onClick={toggleAll}
              className={HUB_FILTER_DROPDOWN_ROW_CLASS}
            >
              <HubFilterDropdownCircle checked={allSelected} indeterminate={someSelected} />
              {allIcon ? <FilterIconGlyph meta={allIcon} /> : null}
              <span>All {filter.label}</span>
              <FilterOptionCount
                value={
                  filter.totalCount ??
                  (filter.options.some((o) => o.count !== undefined)
                    ? filter.options.reduce((sum, o) => sum + (o.count ?? 0), 0)
                    : filter.options.length)
                }
              />
            </button>
            <div className="my-1 border-t border-white/5" />
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={HUB_FILTER_DROPDOWN_ROW_CLASS}
              >
                <HubFilterDropdownCircle checked={selected.includes(o.value)} />
                <FilterOptionGlyph filterKey={filter.key} option={o} />
                <span className="flex-1 truncate text-left" title={o.label}>
                  {o.label}
                </span>
                <FilterOptionCount value={o.count} />
              </button>
            ))}
            {filtered.length === 0 ? <div className="py-4 text-center text-xs text-[var(--muted)]">No matches</div> : null}
          </div>
        </div>
      ) : null}`;

const NEW_OPEN_BLOCK = `      {open ? (
        usePortal ? (
          createPortal(
            <div
              data-hub-multi-filter-panel
              className={HUB_FILTER_DROPDOWN_PANEL_CLASS}
              style={{
                position: "fixed",
                top: panelPos.top,
                left: panelPos.left,
                width: panelPos.width,
                zIndex: 2500,
              }}
              role="listbox"
            >
              <div className="border-b border-white/5 p-2">
                <div className="relative">
                  <Search size={compactIconSize(12)} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={\`Search \${filter.label.toLowerCase()}...\`}
                    className="field text-xs"
                    style={{ paddingLeft: 25, paddingTop: 4, paddingBottom: 4 }}
                    autoFocus
                  />
                </div>
              </div>
              <div className={HUB_FILTER_DROPDOWN_LIST_CLASS}>
                <button type="button" onClick={toggleAll} className={HUB_FILTER_DROPDOWN_ROW_CLASS}>
                  <HubFilterDropdownCircle checked={allSelected} indeterminate={someSelected} />
                  {allIcon ? <FilterIconGlyph meta={allIcon} /> : null}
                  <span>All {filter.label}</span>
                  <FilterOptionCount
                    value={
                      filter.totalCount ??
                      (filter.options.some((o) => o.count !== undefined)
                        ? filter.options.reduce((sum, o) => sum + (o.count ?? 0), 0)
                        : filter.options.length)
                    }
                  />
                </button>
                <div className="my-1 border-t border-white/5" />
                {filtered.map((o) => (
                  <button key={o.value} type="button" onClick={() => toggle(o.value)} className={HUB_FILTER_DROPDOWN_ROW_CLASS}>
                    <HubFilterDropdownCircle checked={selected.includes(o.value)} />
                    <FilterOptionGlyph filterKey={filter.key} option={o} />
                    <span className="flex-1 truncate text-left" title={o.label}>
                      {o.label}
                    </span>
                    <FilterOptionCount value={o.count} />
                  </button>
                ))}
                {filtered.length === 0 ? <div className="py-4 text-center text-xs text-[var(--muted)]">No matches</div> : null}
              </div>
            </div>,
            document.body,
          )
        ) : (
          <div className={\`\${HUB_FILTER_DROPDOWN_PANEL_CLASS} absolute left-0 top-full z-30 mt-1\`} role="listbox">
            <div className="border-b border-white/5 p-2">
              <div className="relative">
                <Search size={compactIconSize(12)} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={\`Search \${filter.label.toLowerCase()}...\`}
                  className="field text-xs"
                  style={{ paddingLeft: 25, paddingTop: 4, paddingBottom: 4 }}
                  autoFocus
                />
              </div>
            </div>
            <div className={HUB_FILTER_DROPDOWN_LIST_CLASS}>
              <button type="button" onClick={toggleAll} className={HUB_FILTER_DROPDOWN_ROW_CLASS}>
                <HubFilterDropdownCircle checked={allSelected} indeterminate={someSelected} />
                {allIcon ? <FilterIconGlyph meta={allIcon} /> : null}
                <span>All {filter.label}</span>
                <FilterOptionCount
                  value={
                    filter.totalCount ??
                    (filter.options.some((o) => o.count !== undefined)
                      ? filter.options.reduce((sum, o) => sum + (o.count ?? 0), 0)
                      : filter.options.length)
                  }
                />
              </button>
              <div className="my-1 border-t border-white/5" />
              {filtered.map((o) => (
                <button key={o.value} type="button" onClick={() => toggle(o.value)} className={HUB_FILTER_DROPDOWN_ROW_CLASS}>
                  <HubFilterDropdownCircle checked={selected.includes(o.value)} />
                  <FilterOptionGlyph filterKey={filter.key} option={o} />
                  <span className="flex-1 truncate text-left" title={o.label}>
                    {o.label}
                  </span>
                  <FilterOptionCount value={o.count} />
                </button>
              ))}
              {filtered.length === 0 ? <div className="py-4 text-center text-xs text-[var(--muted)]">No matches</div> : null}
            </div>
          </div>
        )
      ) : null}`;

for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes("data-hub-multi-filter-panel")) {
    console.log("skip (already patched)", file);
    continue;
  }
  src = src.replace(OLD_PROPS, NEW_PROPS);
  src = src.replace(OLD_FN_START, NEW_FN_START);
  src = src.replace(OLD_PANEL, NEW_PANEL);
  src = src.replace(OLD_OPEN_BLOCK, NEW_OPEN_BLOCK);
  fs.writeFileSync(file, src, "utf8");
  console.log("patched", file);
}

console.log("done");
