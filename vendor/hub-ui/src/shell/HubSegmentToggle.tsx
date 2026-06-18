import type { ReactNode } from "react";
import { compactIconSize } from "../ui-scale";

export type HubSegmentToggleOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

export type HubSegmentToggleProps<T extends string = string> = {
  value: T;
  onChange: (value: T) => void;
  options: HubSegmentToggleOption<T>[];
  className?: string;
};

/** Icon size for segment toggle buttons — scales with hub UI zoom. */
export function hubSegmentIconSize(): number {
  return compactIconSize(14);
}

/** Generic 2+ option segment control — golden ViewToggle pattern (P0004 / P0020 Todo board|calendar). */
export function HubSegmentToggle<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: HubSegmentToggleProps<T>) {
  return (
    <div
      className={`inline-flex h-[var(--hub-control-h)] items-center rounded-lg border border-white/10 bg-[var(--panel)] p-0.5 ${className}`.trim()}
      role="group"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors ${
              active ? "bg-indigo-500/20 text-indigo-200" : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
