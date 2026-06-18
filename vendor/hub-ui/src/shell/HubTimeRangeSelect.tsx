import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { TIME_RANGES, type TimeRange } from "../display-prefs/constants";
import { compactIconSize } from "../ui-scale";
import { getHubUrlPrefsDefaults, patchHubListPrefs } from "../lib/hub-url-prefs";

export function HubTimeRangeSelect({ value }: { value: TimeRange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { defaultRange } = getHubUrlPrefsDefaults();
  const label = TIME_RANGES.find((r) => r.value === value)?.label ?? "30 days";

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function pick(next: TimeRange) {
    patchHubListPrefs({ range: next === defaultRange ? null : next });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-[var(--hub-control-h)] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
          value !== defaultRange
            ? "border-amber-500/35 bg-amber-500/10 text-amber-200"
            : "border-white/10 bg-[var(--panel-2)] text-[var(--text)] hover:bg-white/5"
        }`}
      >
        <CalendarDays size={compactIconSize(13)} className="shrink-0 opacity-80" aria-hidden />
        <span>{label}</span>
        <ChevronDown
          size={compactIconSize(12)}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="anim-pop absolute right-0 top-full z-30 mt-1 min-w-[9rem] rounded-xl border border-white/10 bg-[var(--panel)] p-1 shadow-xl shadow-black/40">
          {TIME_RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => pick(r.value)}
              className={`flex w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/5 ${
                value === r.value ? "bg-indigo-500/15 font-semibold text-indigo-200" : "text-[var(--text)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
