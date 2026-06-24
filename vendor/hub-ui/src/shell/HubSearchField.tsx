import { Search, X } from "lucide-react";
import type { Ref } from "react";
import { compactIconSize } from "../ui-scale";

export type HubSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Show `F` focus hint when empty (directory FilterBar). Off in modals. */
  showShortcutHint?: boolean;
  /** Keyboard focus scope — FilterBar registers shortcuts when embedded. */
  shortcutScope?: string;
};

/** Golden directory search input — P0004 FilterBar row-1 (shared across tools). */
export function HubSearchField({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
  inputRef,
  showShortcutHint = true,
}: HubSearchFieldProps) {
  return (
    <div className={`relative min-w-[var(--hub-search-min-w)] flex-1 ${className}`.trim()}>
      <Search
        size={compactIconSize(14)}
        className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--muted)]"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        name="hub-directory-search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field h-[var(--hub-control-h)] w-full min-w-0 text-xs"
        style={{ paddingLeft: 31, paddingRight: value ? 25 : 36 }}
        aria-label={placeholder}
        role="searchbox"
      />
      {showShortcutHint && !value ? (
        <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 sm:flex">
          <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-indigo-200/90">
            F
          </kbd>
        </span>
      ) : null}
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
          aria-label="Clear search"
        >
          <X size={compactIconSize(12)} />
        </button>
      ) : null}
    </div>
  );
}
